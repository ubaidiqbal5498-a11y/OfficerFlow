require("./config");
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const XLSX = require("xlsx");
const {
  getDb,
  getSettingsMap,
  backupDatabase,
  restoreDatabase,
  dbPath,
  backupsDir,
  privateDir,
} = require("./db");
const {
  computeAttendanceMetrics,
  attendancePercentage,
  validateTimes,
  monthDateRange,
  roundHours,
} = require("./lib/attendance");
const { validateOfficer, ATTENDANCE_STATUSES } = require("./lib/validation");
const { salaryRates, officerOvertimeAfter } = require("./lib/rates");
const {
  EMPLOYMENT_STATUSES,
  ACCOUNT_PAYMENT_METHODS,
  PAKISTANI_BANKS,
  SALARY_PAYOUT_METHODS,
  SALARY_STATUSES,
  DOCUMENT_TYPES,
  isActiveEmployment,
  nextEmployeeCode,
  paymentMethodLabel,
} = require("./lib/hr");
const {
  paymentAccountFromBody,
  composeBankDetails,
  formatPaymentAccountSummary,
  normalizePaymentMethod,
  salaryPayoutFromOfficer,
  payoutAccountDisplay,
} = require("./lib/paymentAccount");
const { applySecurity, clientIp } = require("./lib/security");
const { applyAdminPasswordReset } = require("./lib/adminPasswordReset");
const {
  apiGuard,
  ensureBootstrapUsers,
  hashPassword,
  verifyPassword,
  publicUser,
  createSession,
  destroySession,
  destroyOtherSessions,
  userFromRequest,
  setSessionCookie,
  clearSessionCookie,
  tooManyLogins,
  recordLoginFailure,
  clearLoginAttempts,
  validateCredentials,
} = require("./lib/auth");
const { PORT, HOST, isProd, NODE_ENV } = require("./config");

const app = express();
const upload = multer({ dest: path.join(__dirname, "..", "uploads") });
const ALLOWED_UPLOAD_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf", ".doc", ".docx"]);
const fileUpload = multer({
  dest: path.join(privateDir, "tmp"),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (!ALLOWED_UPLOAD_EXT.has(ext)) {
      return cb(new Error("This file type is not allowed. Use PDF, Word, or an image."));
    }
    cb(null, true);
  },
});
fs.mkdirSync(path.join(privateDir, "tmp"), { recursive: true });

applySecurity(app);
app.use(express.json({ limit: "1mb" }));
app.use(apiGuard);

function db() {
  return getDb();
}

function settings() {
  return getSettingsMap(db());
}

function officerRow(row) {
  if (!row) return null;
  const rates = salaryRates(row, settings());
  const payment_method = normalizePaymentMethod(row.payment_method) || row.payment_method || "";
  return {
    ...row,
    ...rates,
    is_night: row.is_night ? 1 : 0,
    has_photo: Boolean(row.photo_path),
    photo_url: row.photo_path ? `/api/officers/${row.id}/photo` : null,
    payment_method,
    payment_method_label: paymentMethodLabel(row.payment_method),
    payment_account_summary: formatPaymentAccountSummary({ ...row, payment_method }),
    is_active: isActiveEmployment(row.status),
  };
}

function paymentAccountValues(body, previous = {}) {
  const merged = { ...previous, ...body };
  const account = paymentAccountFromBody(merged);
  const payment_method = account.payment_method || null;
  const values = {
    payment_method,
    account_name: account.account_name || null,
    bank_name: account.bank_name || null,
    account_number: account.account_number || null,
    iban: account.iban || null,
    payment_mobile: account.payment_mobile || null,
    nayapay_account_name: account.nayapay_account_name || null,
    nayapay_number: account.nayapay_number || null,
    nayapay_iban: account.nayapay_iban || null,
    easypaisa_iban: account.easypaisa_iban || null,
  };
  values.bank_details =
    composeBankDetails({ ...values, bank_details: merged.bank_details }) ||
    blankToNull(merged.bank_details) ||
    blankToNull(merged.payment_account);
  return values;
}

function getShift(shiftId) {
  if (!shiftId) return null;
  return db().prepare("SELECT * FROM shifts WHERE id = ?").get(shiftId) || null;
}

function metricsForRecord({ status, check_in, check_out, is_night, shift_start, officer, shift }) {
  const s = settings();
  const night = Boolean(is_night || shift?.is_night);
  return computeAttendanceMetrics({
    status,
    checkIn: check_in,
    checkOut: check_out,
    isNight: night,
    officeStartTime: shift_start || shift?.start_time || s.office_start_time,
    lateGraceMinutes: s.late_grace_minutes,
    overtimeAfterHours: officerOvertimeAfter(officer, s),
    overtimeMode: shift?.overtime_mode,
    overtimeCutoff: shift?.overtime_cutoff || s.overtime_cutoff_time || "17:00",
    shift,
  });
}

function logEmployment(officerId, eventType, eventDate, details) {
  db()
    .prepare(
      "INSERT INTO employment_history (officer_id, event_type, event_date, details) VALUES (?, ?, ?, ?)"
    )
    .run(officerId, eventType, eventDate, details ? JSON.stringify(details) : null);
}

function actorName(req) {
  return req?.user?.username || "System";
}

const USER_PUBLIC_COLS = "id, username, role, display_name, email, active, created_at";

function publicUserRow(id) {
  return db().prepare(`SELECT ${USER_PUBLIC_COLS} FROM users WHERE id = ?`).get(id);
}

function normalizeEmail(raw) {
  const email = String(raw || "").trim().toLowerCase();
  if (!email) return "";
  if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function stripAuditSecrets(details) {
  if (details == null || details === "") return details;
  try {
    const obj = typeof details === "string" ? JSON.parse(details) : { ...details };
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return details;
    delete obj.password;
    delete obj.password_hash;
    delete obj.current_password;
    delete obj.new_password;
    delete obj.confirm_password;
    return typeof details === "string" ? JSON.stringify(obj) : obj;
  } catch {
    return details;
  }
}

function logAudit(action, officerId, details, actor = "System") {
  const safe = details && typeof details === "object" ? stripAuditSecrets({ ...details }) : details;
  db()
    .prepare(
      "INSERT INTO audit_log (action, officer_id, actor, details) VALUES (?, ?, ?, ?)"
    )
    .run(action, officerId || null, actor || "System", safe ? JSON.stringify(safe) : null);
}

function officerPrivateDir(officerId) {
  const dir = path.join(privateDir, "officers", String(officerId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function storePrivateFile(officerId, file, prefix) {
  const ext = path.extname(file.originalname || "").toLowerCase() || ".bin";
  const storedName = `${prefix}-${crypto.randomBytes(12).toString("hex")}${ext}`;
  const dest = path.join(officerPrivateDir(officerId), storedName);
  fs.renameSync(file.path, dest);
  return {
    storedName,
    relativePath: path.join("officers", String(officerId), storedName).replace(/\\/g, "/"),
    dest,
  };
}

function resolvePrivate(relativePath) {
  const full = path.resolve(privateDir, relativePath);
  if (!full.startsWith(path.resolve(privateDir))) {
    return null;
  }
  return full;
}

function insertSalaryHistory({ officerId, amount, salaryType, effectiveDate, notes, reason, changedBy = "Admin" }) {
  return db()
    .prepare(
      `INSERT INTO salary_history
        (officer_id, amount, salary_type, effective_date, notes, changed_by, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      officerId,
      Number(amount) || 0,
      salaryType || "monthly",
      effectiveDate,
      notes || reason || null,
      changedBy,
      reason || notes || null
    );
}

function officerJoin(alias = "o") {
  return `
    SELECT ${alias}.*,
      d.name AS department_name,
      s.name AS shift_name,
      s.start_time AS shift_start,
      s.end_time AS shift_end,
      s.is_night AS is_night,
      sup.name AS supervisor_name,
      sup.officer_code AS supervisor_code
    FROM officers ${alias}
    LEFT JOIN departments d ON d.id = ${alias}.department_id
    LEFT JOIN shifts s ON s.id = ${alias}.shift_id
    LEFT JOIN officers sup ON sup.id = ${alias}.supervisor_id
  `;
}

function localISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

app.get("/api/health", (_req, res) => {
  try {
    db().prepare("SELECT 1 AS ok").get();
    res.json({ ok: true, status: "ok" });
  } catch {
    res.status(503).json({ ok: false, status: "database_unavailable" });
  }
});

app.post("/api/auth/login", (req, res) => {
  const ip = clientIp(req);
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  if (tooManyLogins(ip, username)) {
    return res.status(429).json({ error: "Too many sign-in attempts. Try again in 15 minutes." });
  }
  const invalid = validateCredentials(username, password);
  if (invalid) return res.status(400).json({ error: invalid });
  const row = db()
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username.toLowerCase());
  if (!row || !row.active || !verifyPassword(password, row.password_hash)) {
    recordLoginFailure(ip, username);
    return res.status(401).json({ error: "Invalid username or password." });
  }
  clearLoginAttempts(ip, username);
  const token = createSession(row.id);
  setSessionCookie(res, token, req);
  logAudit("user_login", null, { username: row.username }, row.username);
  res.json({ user: publicUser(row) });
});

app.post("/api/auth/logout", (req, res) => {
  const session = userFromRequest(req);
  if (session.user) {
    logAudit("user_logout", null, { username: session.user.username }, session.user.username);
  }
  destroySession(session.token);
  clearSessionCookie(res, req);
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  res.json({ user: req.user });
});

app.post("/api/auth/password", (req, res) => {
  const current = String(req.body?.current_password || "");
  const next = String(req.body?.new_password || "");
  const confirm = String(req.body?.confirm_password || "");
  if (next.length < 8 || next.length > 200) {
    return res.status(400).json({ error: "New password must be at least 8 characters." });
  }
  if (next !== confirm) {
    return res.status(400).json({ error: "New password and confirmation do not match." });
  }
  const row = db().prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!row || !row.active) {
    return res.status(404).json({ error: "Account not found." });
  }
  if (!verifyPassword(current, row.password_hash)) {
    return res.status(400).json({ error: "Current password is incorrect." });
  }
  db()
    .prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now','localtime') WHERE id = ?")
    .run(hashPassword(next), row.id);
  destroyOtherSessions(row.id, req.sessionToken);
  logAudit("password_changed", null, { username: row.username }, row.username);
  res.json({ ok: true, username: row.username });
});

function validateUserBody(body, { isUpdate = false } = {}) {
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");
  const role = String(body.role || "").trim();
  if (!isUpdate) {
    if (!/^[a-z0-9._-]{3,64}$/.test(username)) {
      return "Username must be 3–64 characters using letters, numbers, dot, underscore or hyphen.";
    }
    if (password.length < 8) return "Password must be at least 8 characters.";
  } else if (password && password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (role && !["admin", "boss"].includes(role)) return "Role must be admin or boss.";
  if (!isUpdate && !role) return "Role is required.";
  if (body.email != null && normalizeEmail(body.email) == null) {
    return "Enter a valid email address, or leave it blank.";
  }
  if (password && body.confirm_password != null && String(body.confirm_password) !== password) {
    return "Password and confirmation do not match.";
  }
  return null;
}

app.get("/api/users", (_req, res) => {
  const rows = db()
    .prepare(`SELECT ${USER_PUBLIC_COLS} FROM users ORDER BY username`)
    .all();
  res.json(rows);
});

app.post("/api/users", (req, res) => {
  const error = validateUserBody(req.body);
  if (error) return res.status(400).json({ error });
  const username = String(req.body.username).trim().toLowerCase();
  const email = normalizeEmail(req.body.email) || "";
  const active = req.body.active == null ? 1 : req.body.active ? 1 : 0;
  try {
    const info = db()
      .prepare(
        "INSERT INTO users (username, password_hash, role, display_name, email, active) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(
        username,
        hashPassword(req.body.password),
        req.body.role,
        String(req.body.display_name || username).trim(),
        email || null,
        active
      );
    logAudit(
      "user_created",
      null,
      { username, role: req.body.role, active: Boolean(active) },
      actorName(req)
    );
    res.status(201).json(publicUserRow(info.lastInsertRowid));
  } catch {
    res.status(400).json({ error: "That username is already in use." });
  }
});

app.put("/api/users/:id", (req, res) => {
  const existing = db().prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "User not found." });
  const error = validateUserBody({ ...existing, ...req.body }, { isUpdate: true });
  if (error) return res.status(400).json({ error });
  const role = req.body.role || existing.role;
  const active = req.body.active == null ? existing.active : req.body.active ? 1 : 0;
  if (existing.role === "admin" && (role !== "admin" || !active)) {
    const admins = db().prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1").get().c;
    if (admins <= 1) return res.status(400).json({ error: "Keep at least one active admin." });
  }
  const displayName = req.body.display_name != null
    ? String(req.body.display_name).trim()
    : existing.display_name;
  const email = req.body.email != null ? normalizeEmail(req.body.email) : existing.email;
  if (req.body.email != null && email == null) {
    return res.status(400).json({ error: "Enter a valid email address, or leave it blank." });
  }
  if (req.body.password) {
    db()
      .prepare(
        "UPDATE users SET password_hash=?, role=?, display_name=?, email=?, active=?, updated_at=datetime('now','localtime') WHERE id=?"
      )
      .run(hashPassword(req.body.password), role, displayName, email || null, active, existing.id);
  } else {
    db()
      .prepare(
        "UPDATE users SET role=?, display_name=?, email=?, active=?, updated_at=datetime('now','localtime') WHERE id=?"
      )
      .run(role, displayName, email || null, active, existing.id);
  }
  if (!active) db().prepare("DELETE FROM sessions WHERE user_id = ?").run(existing.id);
  const actor = actorName(req);
  const roleChanged = role !== existing.role;
  const statusChanged = Number(active) !== Number(existing.active);
  if (roleChanged || statusChanged) {
    logAudit(
      "user_permission_changed",
      null,
      { username: existing.username, role, active: Boolean(active) },
      actor
    );
  }
  logAudit(
    "user_updated",
    null,
    { username: existing.username, role, active: Boolean(active), password_reset: Boolean(req.body.password) },
    actor
  );
  res.json(publicUserRow(existing.id));
});

app.delete("/api/users/:id", (req, res) => {
  const existing = db().prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "User not found." });
  if (Number(existing.id) === Number(req.user.id)) {
    return res.status(400).json({ error: "You cannot delete your own account." });
  }
  if (existing.role === "admin") {
    const admins = db().prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1").get().c;
    if (admins <= 1) return res.status(400).json({ error: "Keep at least one active admin." });
  }
  db().prepare("DELETE FROM sessions WHERE user_id = ?").run(existing.id);
  db().prepare("DELETE FROM users WHERE id = ?").run(existing.id);
  logAudit("user_deleted", null, { username: existing.username }, req.user.username);
  res.json({ ok: true });
});

app.get("/api/lookups", (req, res) => {
  const departments = db().prepare("SELECT * FROM departments ORDER BY name").all();
  const shifts = db().prepare("SELECT * FROM shifts ORDER BY name").all();
  res.json({
    departments,
    shifts,
    statuses: ATTENDANCE_STATUSES,
    employment_statuses: EMPLOYMENT_STATUSES,
    payment_methods: ACCOUNT_PAYMENT_METHODS,
    salary_payout_methods: SALARY_PAYOUT_METHODS,
    banks: PAKISTANI_BANKS,
    salary_statuses: SALARY_STATUSES,
    document_types: DOCUMENT_TYPES,
    settings: req.user?.role === "admin"
      ? settings()
      : {
          overtime_cutoff_time: settings().overtime_cutoff_time,
          office_start_time: settings().office_start_time,
          late_grace_minutes: settings().late_grace_minutes,
        },
  });
});

app.get("/api/search", (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json([]);
  const like = `%${q}%`;
  const rows = db()
    .prepare(
      `${officerJoin("o")}
       WHERE o.name LIKE ? COLLATE NOCASE
          OR o.officer_code LIKE ? COLLATE NOCASE
          OR IFNULL(o.phone,'') LIKE ?
          OR IFNULL(o.cnic,'') LIKE ?
       ORDER BY o.name LIMIT 20`
    )
    .all(like, like, like, like);
  res.json(rows.map(officerRow));
});

/* ---------- Departments / Shifts ---------- */

app.post("/api/departments", (req, res) => {
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Department name is required." });
  try {
    const info = db().prepare("INSERT INTO departments (name) VALUES (?)").run(name);
    res.json(db().prepare("SELECT * FROM departments WHERE id = ?").get(info.lastInsertRowid));
  } catch {
    res.status(400).json({ error: "A department with this name already exists." });
  }
});

app.put("/api/departments/:id", (req, res) => {
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Department name is required." });
  db().prepare("UPDATE departments SET name = ? WHERE id = ?").run(name, req.params.id);
  res.json(db().prepare("SELECT * FROM departments WHERE id = ?").get(req.params.id));
});

app.delete("/api/departments/:id", (req, res) => {
  db().prepare("UPDATE officers SET department_id = NULL WHERE department_id = ?").run(req.params.id);
  db().prepare("DELETE FROM departments WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.post("/api/shifts", (req, res) => {
  const { name, start_time, end_time, is_night } = req.body;
  if (!name || !start_time || !end_time) {
    return res.status(400).json({ error: "Shift name, start time and end time are required." });
  }
  try {
    const night = is_night ? 1 : 0;
    const info = db()
      .prepare(
        "INSERT INTO shifts (name, start_time, end_time, is_night, overtime_mode, overtime_cutoff) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(
        name.trim(),
        start_time,
        end_time,
        night,
        night ? "after_hours" : "cutoff",
        night ? null : "17:00"
      );
    res.json(db().prepare("SELECT * FROM shifts WHERE id = ?").get(info.lastInsertRowid));
  } catch {
    res.status(400).json({ error: "A shift with this name already exists." });
  }
});

app.put("/api/shifts/:id", (req, res) => {
  const { name, start_time, end_time, is_night } = req.body;
  const night = is_night ? 1 : 0;
  db()
    .prepare(
      `UPDATE shifts SET name = ?, start_time = ?, end_time = ?, is_night = ?,
       overtime_mode = ?, overtime_cutoff = CASE WHEN ? = 1 THEN overtime_cutoff ELSE IFNULL(overtime_cutoff, '17:00') END
       WHERE id = ?`
    )
    .run(name, start_time, end_time, night, night ? "after_hours" : "cutoff", night, req.params.id);
  res.json(db().prepare("SELECT * FROM shifts WHERE id = ?").get(req.params.id));
});

app.delete("/api/shifts/:id", (req, res) => {
  db().prepare("UPDATE officers SET shift_id = NULL WHERE shift_id = ?").run(req.params.id);
  db().prepare("UPDATE attendance SET shift_id = NULL WHERE shift_id = ?").run(req.params.id);
  db().prepare("DELETE FROM shifts WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

/* ---------- Officers ---------- */

/* ---------- Officers ---------- */

function blankToNull(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  return typeof value === "string" ? value.trim() : value;
}

app.get("/api/officers/next-code", (_req, res) => {
  res.json({ officer_code: nextEmployeeCode(db()) });
});

app.get("/api/officers", (req, res) => {
  const { status, shift_id, designation, department_id, q, sort, order } = req.query;
  const where = [];
  const params = [];
  if (status) {
    where.push("o.status = ?");
    params.push(status);
  }
  if (shift_id) {
    where.push("o.shift_id = ?");
    params.push(shift_id);
  }
  if (department_id) {
    where.push("o.department_id = ?");
    params.push(department_id);
  }
  if (designation) {
    where.push("IFNULL(o.designation,'') LIKE ? COLLATE NOCASE");
    params.push(`%${designation}%`);
  }
  if (q) {
    const like = `%${q}%`;
    where.push(
      "(o.name LIKE ? COLLATE NOCASE OR o.officer_code LIKE ? COLLATE NOCASE OR IFNULL(o.phone,'') LIKE ? OR IFNULL(o.cnic,'') LIKE ?)"
    );
    params.push(like, like, like, like);
  }
  const sortMap = {
    officer_code: "o.officer_code",
    name: "o.name",
    designation: "o.designation",
    department: "d.name",
    shift: "s.name",
    joining_date: "o.joining_date",
    salary: "o.salary",
    status: "o.status",
  };
  const sortCol = sortMap[sort] || "o.name";
  const sortDir = String(order).toLowerCase() === "desc" ? "DESC" : "ASC";
  const sql = `${officerJoin("o")} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${sortCol} ${sortDir}, o.name`;
  res.json(db().prepare(sql).all(...params).map(officerRow));
});

app.get("/api/officers/:id/profile", (req, res) => {
  const officer = db().prepare(`${officerJoin("o")} WHERE o.id = ?`).get(req.params.id);
  if (!officer) return res.status(404).json({ error: "Officer not found." });
  const { year, month, status } = req.query;
  const stats = profileStats(officer.id);
  const attWhere = ["a.officer_id = ?", "a.work_date >= ?"];
  const attParams = [officer.id, officer.joining_date];
  if (year && month) {
    const range = monthDateRange(year, month);
    attWhere.push("a.work_date BETWEEN ? AND ?");
    attParams.push(range.start, range.end);
  } else if (year) {
    attWhere.push("substr(a.work_date, 1, 4) = ?");
    attParams.push(String(year));
  }
  if (status) {
    attWhere.push("a.status = ?");
    attParams.push(status);
  }
  const history = db()
    .prepare(
      `SELECT a.*, s.name AS shift_name, s.is_night
       FROM attendance a
       LEFT JOIN shifts s ON s.id = a.shift_id
       WHERE ${attWhere.join(" AND ")}
       ORDER BY a.work_date DESC`
    )
    .all(...attParams);
  const salaryHistory = db()
    .prepare("SELECT * FROM salary_history WHERE officer_id = ? ORDER BY effective_date DESC, id DESC")
    .all(officer.id);
  const payments = db()
    .prepare("SELECT * FROM salary_payments WHERE officer_id = ? ORDER BY year DESC, month DESC")
    .all(officer.id);
  const employment = db()
    .prepare("SELECT * FROM employment_history WHERE officer_id = ? ORDER BY event_date DESC, id DESC")
    .all(officer.id);
  const documents = db()
    .prepare("SELECT id, officer_id, doc_type, original_name, mime_type, size_bytes, notes, created_at FROM officer_documents WHERE officer_id = ? ORDER BY created_at DESC")
    .all(officer.id);
  const activity = db()
    .prepare(
      `SELECT a.*, o.name AS officer_name, o.officer_code
       FROM audit_log a
       LEFT JOIN officers o ON o.id = a.officer_id
       WHERE a.officer_id = ?
       ORDER BY a.created_at DESC, a.id DESC`
    )
    .all(officer.id);
  const payAgg = db()
    .prepare(
      `SELECT
         IFNULL(SUM(CASE WHEN paid = 1 THEN net_salary ELSE 0 END), 0) AS paid_total,
         IFNULL(SUM(CASE WHEN paid = 0 THEN net_salary ELSE 0 END), 0) AS pending_total,
         MAX(CASE WHEN paid = 1 THEN payment_date END) AS last_payment_date
       FROM salary_payments WHERE officer_id = ?`
    )
    .get(officer.id) || {};
  res.json({
    officer: officerRow(officer),
    stats,
    attendance: history,
    salaryHistory,
    payments,
    employment,
    documents,
    activity,
    salarySummary: {
      current_salary: officer.salary,
      salary_paid: roundHours(Number(payAgg.paid_total) || 0),
      salary_pending: roundHours(Number(payAgg.pending_total) || 0),
      last_payment_date: payAgg.last_payment_date || null,
    },
  });
});

app.get("/api/officers/:id/photo", (req, res) => {
  const officer = db().prepare("SELECT photo_path FROM officers WHERE id = ?").get(req.params.id);
  if (!officer?.photo_path) return res.status(404).json({ error: "No photo." });
  const full = resolvePrivate(officer.photo_path);
  if (!full || !fs.existsSync(full)) return res.status(404).json({ error: "Photo file missing." });
  res.sendFile(full);
});

app.post("/api/officers/:id/photo", (req, res) => {
  fileUpload.single("photo")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Please choose a photo." });
    const officer = db().prepare("SELECT * FROM officers WHERE id = ?").get(req.params.id);
    if (!officer) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: "Officer not found." });
    }
    try {
      const stored = storePrivateFile(officer.id, req.file, "photo");
      if (officer.photo_path) {
        const prev = resolvePrivate(officer.photo_path);
        if (prev && fs.existsSync(prev)) fs.unlinkSync(prev);
      }
      db().prepare("UPDATE officers SET photo_path = ?, updated_at = datetime('now','localtime') WHERE id = ?")
        .run(stored.relativePath, officer.id);
      logAudit("officer_edited", officer.id, { field: "photo" }, actorName(req));
      const row = db().prepare(`${officerJoin("o")} WHERE o.id = ?`).get(officer.id);
      res.json(officerRow(row));
    } catch (error) {
      res.status(500).json({ error: "Could not save photo." });
    }
  });
});

app.get("/api/officers/:id/documents", (req, res) => {
  const officer = db().prepare("SELECT id FROM officers WHERE id = ?").get(req.params.id);
  if (!officer) return res.status(404).json({ error: "Officer not found." });
  res.json(
    db()
      .prepare("SELECT id, officer_id, doc_type, original_name, mime_type, size_bytes, notes, created_at FROM officer_documents WHERE officer_id = ? ORDER BY created_at DESC")
      .all(officer.id)
  );
});

app.get("/api/officers/:id/documents/:docId/file", (req, res) => {
  const doc = db()
    .prepare("SELECT * FROM officer_documents WHERE id = ? AND officer_id = ?")
    .get(req.params.docId, req.params.id);
  if (!doc) return res.status(404).json({ error: "Document not found." });
  const relative = path.join("officers", String(doc.officer_id), doc.stored_name).replace(/\\/g, "/");
  const full = resolvePrivate(relative);
  if (!full || !fs.existsSync(full)) return res.status(404).json({ error: "File missing." });
  res.setHeader("Content-Disposition", `inline; filename="${doc.original_name.replace(/"/g, "")}"`);
  res.sendFile(full);
});

app.post("/api/officers/:id/documents", (req, res) => {
  fileUpload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Please choose a file." });
    const officer = db().prepare("SELECT * FROM officers WHERE id = ?").get(req.params.id);
    if (!officer) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: "Officer not found." });
    }
    const docType = String(req.body.doc_type || "other");
    if (!DOCUMENT_TYPES.some((t) => t.id === docType)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Invalid document type." });
    }
    try {
      const stored = storePrivateFile(officer.id, req.file, docType);
      const info = db()
        .prepare(
          `INSERT INTO officer_documents (officer_id, doc_type, original_name, stored_name, mime_type, size_bytes, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          officer.id,
          docType,
          req.file.originalname,
          stored.storedName,
          req.file.mimetype,
          req.file.size,
          req.body.notes || null
        );
      logAudit("officer_edited", officer.id, { document: req.file.originalname, doc_type: docType }, actorName(req));
      res.status(201).json(db().prepare("SELECT id, officer_id, doc_type, original_name, mime_type, size_bytes, notes, created_at FROM officer_documents WHERE id = ?").get(info.lastInsertRowid));
    } catch {
      res.status(500).json({ error: "Could not save document." });
    }
  });
});

app.delete("/api/officers/:id/documents/:docId", (req, res) => {
  const doc = db()
    .prepare("SELECT * FROM officer_documents WHERE id = ? AND officer_id = ?")
    .get(req.params.docId, req.params.id);
  if (!doc) return res.status(404).json({ error: "Document not found." });
  const relative = path.join("officers", String(doc.officer_id), doc.stored_name).replace(/\\/g, "/");
  const full = resolvePrivate(relative);
  if (full && fs.existsSync(full)) fs.unlinkSync(full);
  db().prepare("DELETE FROM officer_documents WHERE id = ?").run(doc.id);
  logAudit("officer_edited", doc.officer_id, { deleted_document: doc.original_name }, actorName(req));
  res.json({ ok: true });
});

app.get("/api/officers/:id", (req, res) => {
  const row = db().prepare(`${officerJoin("o")} WHERE o.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: "Officer not found." });
  res.json(officerRow(row));
});

app.post("/api/officers", (req, res) => {
  const body = { ...req.body, officer_code: req.body.officer_code || nextEmployeeCode(db()) };
  const errors = validateOfficer(body);
  if (errors.length) return res.status(400).json({ error: errors[0], errors });
  const pay = paymentAccountValues(body);
  try {
    const info = db()
      .prepare(
        `INSERT INTO officers (
          name, officer_code, phone, cnic, designation, department_id, shift_id,
          joining_date, salary, salary_type, bank_details, emergency_contact,
          status, leaving_date, leaving_reason, notes, working_hours_per_day,
          father_name, date_of_birth, whatsapp, email, address,
          emergency_contact_name, emergency_contact_phone, supervisor_id,
          payment_method, salary_status, salary_effective_date,
          account_name, bank_name, account_number, iban, payment_mobile,
          nayapay_account_name, nayapay_number, nayapay_iban, easypaisa_iban
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        body.name.trim(),
        body.officer_code.trim(),
        blankToNull(body.phone),
        blankToNull(body.cnic),
        blankToNull(body.designation),
        body.department_id || null,
        body.shift_id || Number(settings().default_shift_id) || null,
        body.joining_date,
        Number(body.salary) || 0,
        body.salary_type || "monthly",
        pay.bank_details,
        blankToNull(body.emergency_contact_name) || blankToNull(body.emergency_contact),
        body.status || "active",
        blankToNull(body.leaving_date),
        blankToNull(body.leaving_reason),
        blankToNull(body.notes),
        body.working_hours_per_day === "" || body.working_hours_per_day == null
          ? Number(settings().normal_working_hours) || 10
          : Number(body.working_hours_per_day),
        blankToNull(body.father_name),
        blankToNull(body.date_of_birth),
        blankToNull(body.whatsapp),
        blankToNull(body.email),
        blankToNull(body.address),
        blankToNull(body.emergency_contact_name),
        blankToNull(body.emergency_contact_phone) || blankToNull(body.emergency_contact),
        body.supervisor_id || null,
        pay.payment_method,
        blankToNull(body.salary_status) || "active",
        blankToNull(body.salary_effective_date) || body.joining_date,
        pay.account_name,
        pay.bank_name,
        pay.account_number,
        pay.iban,
        pay.payment_mobile,
        pay.nayapay_account_name,
        pay.nayapay_number,
        pay.nayapay_iban,
        pay.easypaisa_iban
      );
    const id = Number(info.lastInsertRowid);
    insertSalaryHistory({
      officerId: id,
      amount: Number(body.salary) || 0,
      salaryType: body.salary_type || "monthly",
      effectiveDate: body.salary_effective_date || body.joining_date,
      notes: "Starting salary",
      reason: body.salary_change_notes || "Starting salary",
    });
    logEmployment(id, "join", body.joining_date, {
      designation: body.designation,
      shift_id: body.shift_id,
      salary: Number(body.salary) || 0,
      salary_type: body.salary_type || "monthly",
    });
    logAudit("officer_created", id, { officer_code: body.officer_code, name: body.name }, actorName(req));
    const row = db().prepare(`${officerJoin("o")} WHERE o.id = ?`).get(id);
    res.status(201).json(officerRow(row));
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return res.status(400).json({ error: "An officer with this Employee ID already exists." });
    }
    res.status(500).json({ error: "Could not save officer." });
  }
});

app.put("/api/officers/:id", (req, res) => {
  const existing = db().prepare("SELECT * FROM officers WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Officer not found." });
  const errors = validateOfficer({ ...existing, ...req.body }, { isUpdate: true });
  if (errors.length) return res.status(400).json({ error: errors[0], errors });
  const body = { ...existing, ...req.body };
  if (body.status !== "active" && !body.leaving_date) {
    body.leaving_date = localISODate();
  }
  const pay = paymentAccountValues(body, existing);
  try {
    db()
      .prepare(
        `UPDATE officers SET
          name=?, officer_code=?, phone=?, cnic=?, designation=?, department_id=?, shift_id=?,
          joining_date=?, salary=?, salary_type=?, bank_details=?, emergency_contact=?,
          status=?, leaving_date=?, leaving_reason=?, notes=?, working_hours_per_day=?,
          father_name=?, date_of_birth=?, whatsapp=?, email=?, address=?,
          emergency_contact_name=?, emergency_contact_phone=?, supervisor_id=?,
          payment_method=?, salary_status=?, salary_effective_date=?,
          account_name=?, bank_name=?, account_number=?, iban=?, payment_mobile=?,
          nayapay_account_name=?, nayapay_number=?, nayapay_iban=?, easypaisa_iban=?,
          updated_at=datetime('now','localtime')
         WHERE id=?`
      )
      .run(
        body.name.trim(),
        body.officer_code.trim(),
        blankToNull(body.phone),
        blankToNull(body.cnic),
        blankToNull(body.designation),
        body.department_id || null,
        body.shift_id || null,
        body.joining_date,
        Number(body.salary) || 0,
        body.salary_type || "monthly",
        pay.bank_details,
        blankToNull(body.emergency_contact_name) || blankToNull(body.emergency_contact),
        body.status || "active",
        blankToNull(body.leaving_date),
        blankToNull(body.leaving_reason),
        blankToNull(body.notes),
        body.working_hours_per_day === "" || body.working_hours_per_day == null
          ? existing.working_hours_per_day
          : Number(body.working_hours_per_day),
        blankToNull(body.father_name),
        blankToNull(body.date_of_birth),
        blankToNull(body.whatsapp),
        blankToNull(body.email),
        blankToNull(body.address),
        blankToNull(body.emergency_contact_name),
        blankToNull(body.emergency_contact_phone),
        body.supervisor_id || null,
        pay.payment_method,
        blankToNull(body.salary_status) || "active",
        blankToNull(body.salary_effective_date) || existing.salary_effective_date,
        pay.account_name,
        pay.bank_name,
        pay.account_number,
        pay.iban,
        pay.payment_mobile,
        pay.nayapay_account_name,
        pay.nayapay_number,
        pay.nayapay_iban,
        pay.easypaisa_iban,
        req.params.id
      );

    const salaryChanged =
      Number(existing.salary) !== Number(body.salary) || existing.salary_type !== body.salary_type;
    if (salaryChanged) {
      const effective = body.salary_effective_date || localISODate();
      insertSalaryHistory({
        officerId: req.params.id,
        amount: Number(body.salary) || 0,
        salaryType: body.salary_type || "monthly",
        effectiveDate: effective,
        notes: body.salary_change_notes || "Salary updated",
        reason: body.salary_change_notes || body.salary_reason || "Salary updated",
      });
      db().prepare("UPDATE officers SET salary_effective_date = ? WHERE id = ?").run(effective, req.params.id);
      logEmployment(req.params.id, "salary_change", effective, {
        from: existing.salary,
        to: Number(body.salary) || 0,
        salary_type: body.salary_type,
      });
      logAudit("salary_changed", req.params.id, {
        from: existing.salary,
        to: Number(body.salary) || 0,
        effective_date: effective,
      }, actorName(req));
    }

    if (existing.status === "active" && body.status !== "active") {
      logEmployment(req.params.id, "leave", body.leaving_date, {
        reason: body.leaving_reason,
        final_status: body.status,
      });
      logAudit("officer_deactivated", req.params.id, { status: body.status, leaving_date: body.leaving_date }, actorName(req));
    } else if (existing.status !== "active" && body.status === "active") {
      logEmployment(req.params.id, "rejoin", body.joining_date, { status: "active" });
      logAudit("officer_edited", req.params.id, { status: "active" }, actorName(req));
    } else {
      logAudit("officer_edited", req.params.id, { officer_code: body.officer_code }, actorName(req));
    }

    const row = db().prepare(`${officerJoin("o")} WHERE o.id = ?`).get(req.params.id);
    res.json(officerRow(row));
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return res.status(400).json({ error: "An officer with this Employee ID already exists." });
    }
    res.status(500).json({ error: "Could not update officer." });
  }
});

app.put("/api/officers/:id/payment-account", (req, res) => {
  const existing = db().prepare("SELECT * FROM officers WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Officer not found." });
  const errors = validateOfficer({ ...existing, ...req.body }, { isUpdate: true });
  if (errors.length) return res.status(400).json({ error: errors[0], errors });
  const pay = paymentAccountValues(req.body, existing);
  db()
    .prepare(
      `UPDATE officers SET
        payment_method=?, account_name=?, bank_name=?, account_number=?, iban=?,
        payment_mobile=?, nayapay_account_name=?, nayapay_number=?, nayapay_iban=?,
        easypaisa_iban=?, bank_details=?, updated_at=datetime('now','localtime')
       WHERE id=?`
    )
    .run(
      pay.payment_method,
      pay.account_name,
      pay.bank_name,
      pay.account_number,
      pay.iban,
      pay.payment_mobile,
      pay.nayapay_account_name,
      pay.nayapay_number,
      pay.nayapay_iban,
      pay.easypaisa_iban,
      pay.bank_details,
      existing.id
    );
  logAudit("officer_edited", existing.id, { payment_account: "updated" }, actorName(req));
  const row = db().prepare(`${officerJoin("o")} WHERE o.id = ?`).get(existing.id);
  res.json(officerRow(row));
});

app.post("/api/officers/:id/deactivate", (req, res) => {
  const existing = db().prepare("SELECT * FROM officers WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Officer not found." });
  const status = req.body.status || "inactive";
  if (!EMPLOYMENT_STATUSES.includes(status) || status === "active") {
    return res.status(400).json({ error: "Choose Inactive, Resigned, or Terminated." });
  }
  const leaving_date = req.body.leaving_date || localISODate();
  const leaving_reason = blankToNull(req.body.leaving_reason);
  db()
    .prepare(
      `UPDATE officers SET status=?, leaving_date=?, leaving_reason=?, updated_at=datetime('now','localtime') WHERE id=?`
    )
    .run(status, leaving_date, leaving_reason, existing.id);
  logEmployment(existing.id, "leave", leaving_date, { reason: leaving_reason, final_status: status });
  logAudit("officer_deactivated", existing.id, { status, leaving_date }, actorName(req));
  const row = db().prepare(`${officerJoin("o")} WHERE o.id = ?`).get(existing.id);
  res.json(officerRow(row));
});

function profileStats(officerId, fromDate, toDate) {
  const officer = db().prepare("SELECT joining_date, leaving_date FROM officers WHERE id = ?").get(officerId);
  const joinDate = officer?.joining_date;
  const leaveDate = officer?.leaving_date;
  const start = [fromDate, joinDate].filter(Boolean).sort().slice(-1)[0];
  const endCandidates = [toDate, leaveDate].filter(Boolean).sort();
  const end = endCandidates[0];

  let sql = `SELECT status, COUNT(*) AS c,
      SUM(working_hours) AS hours,
      SUM(overtime_hours) AS overtime,
      SUM(is_late) AS late
    FROM attendance WHERE officer_id = ?`;
  const params = [officerId];
  if (start) {
    sql += " AND work_date >= ?";
    params.push(start);
  }
  if (end) {
    sql += " AND work_date <= ?";
    params.push(end);
  }
  sql += " GROUP BY status";
  const rows = db().prepare(sql).all(...params);
  const counts = {
    present: 0,
    absent: 0,
    half_day: 0,
    leave: 0,
    off: 0,
    holiday: 0,
    late: 0,
    hours: 0,
    overtime: 0,
  };
  for (const row of rows) {
    counts[row.status] = row.c;
    counts.hours += row.hours || 0;
    counts.overtime += row.overtime || 0;
    counts.late += row.late || 0;
  }
  const totalDaysWorked = counts.present + counts.half_day;
  return {
    ...counts,
    hours: roundHours(counts.hours),
    overtime: roundHours(counts.overtime),
    total_days_worked: totalDaysWorked,
    attendance_percentage: attendancePercentage(counts),
  };
}

/* ---------- Attendance ---------- */

app.get("/api/attendance/daily", (req, res) => {
  const date = req.query.date;
  if (!date) return res.status(400).json({ error: "Date is required." });
  const officers = db()
    .prepare(
      `${officerJoin("o")}
       WHERE o.status = 'active'
         AND o.joining_date <= ?
         AND (o.leaving_date IS NULL OR o.leaving_date >= ?)
       ORDER BY o.name`
    )
    .all(date, date);
  const records = db()
    .prepare("SELECT * FROM attendance WHERE work_date = ?")
    .all(date);
  const byOfficer = Object.fromEntries(records.map((r) => [r.officer_id, r]));
  res.json({
    date,
    rows: officers.map((o) => ({
      officer: officerRow(o),
      attendance: byOfficer[o.id] || null,
    })),
  });
});

app.get("/api/attendance", (req, res) => {
  const { date, month, year, officer_id, shift_id, status } = req.query;
  const where = [];
  const params = [];
  if (date) {
    where.push("a.work_date = ?");
    params.push(date);
  }
  if (year && month) {
    const range = monthDateRange(year, month);
    where.push("a.work_date BETWEEN ? AND ?");
    params.push(range.start, range.end);
  }
  if (officer_id) {
    where.push("a.officer_id = ?");
    params.push(officer_id);
  }
  if (shift_id) {
    where.push("a.shift_id = ?");
    params.push(shift_id);
  }
  if (status) {
    where.push("a.status = ?");
    params.push(status);
  }
  const sql = `
    SELECT a.*, o.name AS officer_name, o.officer_code, s.name AS shift_name, s.is_night
    FROM attendance a
    JOIN officers o ON o.id = a.officer_id
    LEFT JOIN shifts s ON s.id = a.shift_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY a.work_date DESC, o.name
  `;
  res.json(db().prepare(sql).all(...params));
});

function upsertAttendance(payload, actor) {
  const {
    officer_id,
    work_date,
    shift_id,
    check_in,
    check_out,
    status,
    remarks,
  } = payload;
  if (!officer_id || !work_date || !status) {
    throw Object.assign(new Error("Officer, date and status are required."), { status: 400 });
  }
  if (!ATTENDANCE_STATUSES.includes(status)) {
    throw Object.assign(new Error("Invalid attendance status."), { status: 400 });
  }
  const officer = db().prepare(`${officerJoin("o")} WHERE o.id = ?`).get(officer_id);
  if (!officer) throw Object.assign(new Error("Officer not found."), { status: 404 });
  if (officer.joining_date && work_date < officer.joining_date) {
    throw Object.assign(new Error("Attendance cannot be marked before the officer's joining date."), { status: 400 });
  }
  const effectiveShiftId = shift_id || officer.shift_id;
  const shift = getShift(effectiveShiftId);
  const isNight = Boolean(shift?.is_night);
  const timeError = validateTimes({
    status,
    checkIn: check_in,
    checkOut: check_out,
    isNight,
  });
  if (timeError) throw Object.assign(new Error(timeError), { status: 400 });
  const metrics = metricsForRecord({
    status,
    check_in,
    check_out,
    is_night: isNight,
    shift_start: shift?.start_time,
    officer,
    shift,
  });
  const existing = db()
    .prepare("SELECT id FROM attendance WHERE officer_id = ? AND work_date = ?")
    .get(officer_id, work_date);
  if (existing) {
    db()
      .prepare(
        `UPDATE attendance SET shift_id=?, check_in=?, check_out=?, status=?, remarks=?,
         working_hours=?, late_minutes=?, is_late=?, overtime_hours=?, updated_at=datetime('now','localtime')
         WHERE id=?`
      )
      .run(
        effectiveShiftId || null,
        check_in || null,
        check_out || null,
        status,
        remarks || null,
        metrics.workingHours,
        metrics.lateMinutes,
        metrics.isLate,
        metrics.overtimeHours,
        existing.id
      );
    logAudit("attendance_edited", officer_id, { work_date, status }, actor);
    return db().prepare("SELECT * FROM attendance WHERE id = ?").get(existing.id);
  }
  const info = db()
    .prepare(
      `INSERT INTO attendance (
        officer_id, work_date, shift_id, check_in, check_out, status, remarks,
        working_hours, late_minutes, is_late, overtime_hours
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      officer_id,
      work_date,
      effectiveShiftId || null,
      check_in || null,
      check_out || null,
      status,
      remarks || null,
      metrics.workingHours,
      metrics.lateMinutes,
      metrics.isLate,
      metrics.overtimeHours
    );
  logAudit("attendance_created", officer_id, { work_date, status }, actor);
  return db().prepare("SELECT * FROM attendance WHERE id = ?").get(info.lastInsertRowid);
}

app.post("/api/attendance", (req, res) => {
  try {
    res.status(201).json(upsertAttendance(req.body, actorName(req)));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post("/api/attendance/bulk", (req, res) => {
  const { date, rows } = req.body;
  if (!date || !Array.isArray(rows)) {
    return res.status(400).json({ error: "Date and attendance rows are required." });
  }
  try {
    const save = db().transaction((items) => {
      return items
        .filter((row) => row.status)
        .map((row) =>
          upsertAttendance({
            officer_id: row.officer_id,
            work_date: date,
            shift_id: row.shift_id,
            check_in: row.check_in,
            check_out: row.check_out,
            status: row.status,
            remarks: row.remarks,
          }, actorName(req))
        );
    });
    res.json({ saved: save(rows).length });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete("/api/attendance/:id", (req, res) => {
  db().prepare("DELETE FROM attendance WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

/* ---------- Reports ---------- */

function monthlyReport({ year, month, officer_id, shift_id }) {
  const range = monthDateRange(year, month);
  const where = ["a.work_date BETWEEN ? AND ?"];
  const params = [range.start, range.end];
  if (officer_id && officer_id !== "all") {
    where.push("a.officer_id = ?");
    params.push(officer_id);
  }
  if (shift_id) {
    where.push("IFNULL(a.shift_id, o.shift_id) = ?");
    params.push(shift_id);
  }
  const officersSql = officer_id && officer_id !== "all"
    ? `${officerJoin("o")} WHERE o.id = ?`
    : `${officerJoin("o")} ORDER BY o.name`;
  const officers =
    officer_id && officer_id !== "all"
      ? [db().prepare(officersSql).get(officer_id)].filter(Boolean)
      : db().prepare(officersSql).all();

  return officers.map((officer) => {
    const stats = profileStats(officer.id, range.start, range.end);
    const workingDays = stats.present + stats.absent + stats.half_day + stats.leave;
    return {
      officer: officerRow(officer),
      month: Number(month),
      year: Number(year),
      working_days: workingDays,
      present: stats.present,
      absent: stats.absent,
      half_day: stats.half_day,
      leave: stats.leave,
      off: stats.off,
      holiday: stats.holiday,
      late: stats.late,
      working_hours: stats.hours,
      overtime: stats.overtime,
      attendance_percentage: stats.attendance_percentage,
    };
  });
}

app.get("/api/reports/monthly", (req, res) => {
  const { year, month, officer_id, shift_id } = req.query;
  if (!year || !month) return res.status(400).json({ error: "Month and year are required." });
  res.json(monthlyReport({ year, month, officer_id, shift_id }));
});

/* ---------- Salary ---------- */

function salaryForDate(officerId, date) {
  return db()
    .prepare(
      `SELECT * FROM salary_history
       WHERE officer_id = ? AND effective_date <= ?
       ORDER BY effective_date DESC, id DESC LIMIT 1`
    )
    .get(officerId, date);
}

function calculateSalaryDraft(officerId, year, month) {
  const officer = db().prepare("SELECT * FROM officers WHERE id = ?").get(officerId);
  if (!officer) throw Object.assign(new Error("Officer not found."), { status: 404 });
  const range = monthDateRange(year, month);
  const stats = profileStats(officerId, range.start, range.end);
  const s = settings();
  const salaryRow = salaryForDate(officerId, range.end) || {
    amount: officer.salary,
    salary_type: officer.salary_type,
  };
  const officerForRates = {
    ...officer,
    salary: salaryRow.amount,
    salary_type: salaryRow.salary_type,
  };
  const rates = salaryRates(officerForRates, s);
  const presentEquivalent = stats.present + stats.half_day * 0.5;
  let basic = rates.monthly_salary;
  if (salaryRow.salary_type === "daily") {
    basic = roundHours(rates.daily_salary * presentEquivalent);
  }
  const dailyRate = rates.daily_salary;

  let deductions = 0;
  if (s.deduct_absent === "true") {
    deductions += roundHours(dailyRate * stats.absent);
  }
  if (s.deduct_half_day === "true") {
    deductions += roundHours(dailyRate * stats.half_day * 0.5);
  }

  let bonuses = 0;
  let overtime_amount = 0;
  if (s.overtime_pay_enabled === "true") {
    const otRate = Number(s.overtime_rate_per_hour) > 0 ? Number(s.overtime_rate_per_hour) : rates.hourly_rate;
    overtime_amount = roundHours(stats.overtime * otRate);
    bonuses += overtime_amount;
  }

  const net = roundHours(basic - deductions + bonuses);
  const workingDays = stats.present + stats.absent + stats.half_day + stats.leave;
  const payout_method = salaryPayoutFromOfficer(officer);
  return {
    officer_id: officerId,
    month: Number(month),
    year: Number(year),
    basic_salary: roundHours(basic),
    working_days: workingDays,
    present_days: presentEquivalent,
    present_full_days: stats.present,
    absent_days: stats.absent,
    leave_days: stats.leave,
    half_days: stats.half_day,
    overtime_hours: stats.overtime,
    overtime_amount,
    deductions: roundHours(deductions),
    bonuses: roundHours(bonuses),
    net_salary: net,
    salary_type: salaryRow.salary_type,
    monthly_salary: rates.monthly_salary,
    daily_salary: rates.daily_salary,
    hourly_rate: rates.hourly_rate,
    working_hours_per_day: rates.working_hours_per_day,
    payment_method: payout_method,
    officer_payment_method: normalizePaymentMethod(officer.payment_method) || officer.payment_method || null,
    payment_method_label: paymentMethodLabel(officer.payment_method),
    payment_account_summary: formatPaymentAccountSummary(officer),
    payout_account: payoutAccountDisplay(officer, payout_method),
    account_name: officer.account_name || null,
    bank_name: officer.bank_name || null,
    account_number: officer.account_number || null,
    iban: officer.iban || null,
    payment_mobile: officer.payment_mobile || null,
    nayapay_account_name: officer.nayapay_account_name || null,
    nayapay_number: officer.nayapay_number || null,
    nayapay_iban: officer.nayapay_iban || null,
    easypaisa_iban: officer.easypaisa_iban || null,
  };
}

app.get("/api/salary/history/:officerId", (req, res) => {
  res.json(
    db()
      .prepare("SELECT * FROM salary_history WHERE officer_id = ? ORDER BY effective_date DESC, id DESC")
      .all(req.params.officerId)
  );
});

app.post("/api/salary/history", (req, res) => {
  const { officer_id, amount, salary_type, effective_date, notes, reason, changed_by } = req.body;
  if (!officer_id || amount == null || !effective_date) {
    return res.status(400).json({ error: "Officer, amount and effective date are required." });
  }
  if (Number(amount) < 0) return res.status(400).json({ error: "Salary cannot be negative." });
  insertSalaryHistory({
    officerId: officer_id,
    amount: Number(amount),
    salaryType: salary_type || "monthly",
    effectiveDate: effective_date,
    notes: notes || reason || null,
    reason: reason || notes || "Salary changed",
    changedBy: changed_by || actorName(req),
  });
  db()
    .prepare(
      "UPDATE officers SET salary = ?, salary_type = ?, salary_effective_date = ?, updated_at = datetime('now','localtime') WHERE id = ?"
    )
    .run(Number(amount), salary_type || "monthly", effective_date, officer_id);
  logEmployment(officer_id, "salary_change", effective_date, {
    amount: Number(amount),
    salary_type,
    notes,
  });
  logAudit("salary_changed", officer_id, { amount: Number(amount), effective_date, reason: reason || notes }, actorName(req));
  const row = db()
    .prepare("SELECT * FROM salary_history WHERE officer_id = ? ORDER BY id DESC LIMIT 1")
    .get(officer_id);
  res.status(201).json(row);
});

app.get("/api/salary/payments", (req, res) => {
  const { year, month, officer_id } = req.query;
  const where = [];
  const params = [];
  if (year) {
    where.push("p.year = ?");
    params.push(year);
  }
  if (month) {
    where.push("p.month = ?");
    params.push(month);
  }
  if (officer_id) {
    where.push("p.officer_id = ?");
    params.push(officer_id);
  }
  const sql = `
    SELECT p.*, o.name AS officer_name, o.officer_code,
      o.payment_method AS officer_payment_method,
      o.account_name, o.bank_name, o.account_number, o.iban, o.payment_mobile, o.bank_details,
      o.nayapay_account_name, o.nayapay_number, o.nayapay_iban, o.easypaisa_iban
    FROM salary_payments p
    JOIN officers o ON o.id = p.officer_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY p.year DESC, p.month DESC, o.name
  `;
  res.json(db().prepare(sql).all(...params));
});

app.post("/api/salary/calculate", (req, res) => {
  const { officer_id, year, month } = req.body;
  if (!officer_id || !year || !month) {
    return res.status(400).json({ error: "Officer, month and year are required." });
  }
  try {
    res.json(calculateSalaryDraft(officer_id, year, month));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post("/api/salary/calculate-all", (req, res) => {
  const { year, month } = req.body;
  if (!year || !month) return res.status(400).json({ error: "Month and year are required." });
  const officers = db().prepare("SELECT id FROM officers WHERE status = 'active'").all();
  res.json(officers.map((o) => calculateSalaryDraft(o.id, year, month)));
});

app.post("/api/salary/payments", (req, res) => {
  const body = req.body;
  if (!body.officer_id || !body.month || !body.year) {
    return res.status(400).json({ error: "Officer, month and year are required." });
  }
  const existing = db()
    .prepare("SELECT id FROM salary_payments WHERE officer_id = ? AND month = ? AND year = ?")
    .get(body.officer_id, body.month, body.year);
  const fields = [
    Number(body.basic_salary) || 0,
    Number(body.working_days) || 0,
    Number(body.present_days) || 0,
    Number(body.absent_days) || 0,
    Number(body.leave_days) || 0,
    Number(body.half_days) || 0,
    Number(body.overtime_hours) || 0,
    Number(body.deductions) || 0,
    Number(body.bonuses) || 0,
    Number(body.net_salary) || 0,
    body.paid ? 1 : 0,
    body.payment_date || null,
    body.payment_method || null,
    body.remarks || null,
  ];
  if (existing) {
    db()
      .prepare(
        `UPDATE salary_payments SET
          basic_salary=?, working_days=?, present_days=?, absent_days=?, leave_days=?, half_days=?,
          overtime_hours=?, deductions=?, bonuses=?, net_salary=?, paid=?, payment_date=?,
          payment_method=?, remarks=?, updated_at=datetime('now','localtime')
         WHERE id=?`
      )
      .run(...fields, existing.id);
    logAudit("salary_payment_recorded", body.officer_id, {
      month: body.month,
      year: body.year,
      paid: Boolean(body.paid),
      net_salary: Number(body.net_salary) || 0,
    }, actorName(req));
    return res.json(db().prepare("SELECT * FROM salary_payments WHERE id = ?").get(existing.id));
  }
  const info = db()
    .prepare(
      `INSERT INTO salary_payments (
        officer_id, month, year, basic_salary, working_days, present_days, absent_days, leave_days,
        half_days, overtime_hours, deductions, bonuses, net_salary, paid, payment_date, payment_method, remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(body.officer_id, body.month, body.year, ...fields);
  logAudit("salary_payment_recorded", body.officer_id, {
    month: body.month,
    year: body.year,
    paid: Boolean(body.paid),
    net_salary: Number(body.net_salary) || 0,
  }, actorName(req));
  res.status(201).json(db().prepare("SELECT * FROM salary_payments WHERE id = ?").get(info.lastInsertRowid));
});

app.put("/api/salary/payments/:id", (req, res) => {
  const body = req.body;
  db()
    .prepare(
      `UPDATE salary_payments SET
        deductions=?, bonuses=?, net_salary=?, paid=?, payment_date=?, payment_method=?, remarks=?,
        updated_at=datetime('now','localtime')
       WHERE id=?`
    )
    .run(
      Number(body.deductions) || 0,
      Number(body.bonuses) || 0,
      Number(body.net_salary) || 0,
      body.paid ? 1 : 0,
      body.payment_date || null,
      body.payment_method || null,
      body.remarks || null,
      req.params.id
    );
  const row = db().prepare("SELECT * FROM salary_payments WHERE id = ?").get(req.params.id);
  logAudit("salary_payment_recorded", row?.officer_id, {
    month: row?.month,
    year: row?.year,
    paid: Boolean(body.paid),
    net_salary: Number(body.net_salary) || 0,
  }, actorName(req));
  res.json(row);
});

app.get("/api/audit", (req, res) => {
  const { officer_id } = req.query;
  const where = [];
  const params = [];
  if (officer_id) {
    where.push("a.officer_id = ?");
    params.push(officer_id);
  }
  const rows = db()
    .prepare(
      `SELECT a.*, o.name AS officer_name, o.officer_code
       FROM audit_log a
       LEFT JOIN officers o ON o.id = a.officer_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 200`
    )
    .all(...params)
    .map((row) => ({ ...row, details: stripAuditSecrets(row.details) }));
  res.json(rows);
});

/* ---------- Dashboard ---------- */

app.get("/api/dashboard", (req, res) => {
  try {
    const dateParam = String(req.query.date || "");
    const today = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : localISODate();
    const [y, m] = today.split("-");
    const range = monthDateRange(y, Number(m));
    const activeCount =
      db().prepare("SELECT COUNT(*) AS c FROM officers WHERE status = 'active'").get()?.c || 0;
    const todayRows = db()
      .prepare(
        `SELECT a.status, a.is_late, a.check_in, a.check_out, o.id
         FROM officers o
         LEFT JOIN attendance a ON a.officer_id = o.id AND a.work_date = ?
         WHERE o.status = 'active'
           AND o.joining_date <= ?
           AND (o.leaving_date IS NULL OR o.leaving_date >= ?)`
      )
      .all(today, today, today);
    const todayStats = {
      active: activeCount,
      present: 0,
      absent: 0,
      leave: 0,
      half_day: 0,
      off: 0,
      holiday: 0,
      late: 0,
      unmarked: 0,
      currently_working: 0,
    };
    for (const row of todayRows || []) {
      if (!row.status) {
        todayStats.unmarked += 1;
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(todayStats, row.status)) {
        todayStats[row.status] += 1;
      }
      if (row.is_late) todayStats.late += 1;
      if (row.status === "present" && row.check_in && !row.check_out) {
        todayStats.currently_working += 1;
      }
    }

    const monthAgg =
      db()
        .prepare(
          `SELECT
             SUM(CASE WHEN a.status IN ('present','half_day','absent','leave') THEN 1 ELSE 0 END) AS denom,
             SUM(CASE WHEN a.status = 'present' THEN 1 WHEN a.status = 'half_day' THEN 0.5 ELSE 0 END) AS earned,
             SUM(a.working_hours) AS hours,
             SUM(a.overtime_hours) AS overtime
           FROM attendance a
           JOIN officers o ON o.id = a.officer_id
           WHERE a.work_date BETWEEN ? AND ?
             AND a.work_date >= o.joining_date`
        )
        .get(range.start, range.end) || {};

    const salaryAgg =
      db()
        .prepare(
          `SELECT
             IFNULL(SUM(net_salary),0) AS total,
             IFNULL(SUM(CASE WHEN paid = 1 THEN net_salary ELSE 0 END),0) AS paid,
             IFNULL(SUM(CASE WHEN paid = 0 THEN net_salary ELSE 0 END),0) AS pending
           FROM salary_payments WHERE year = ? AND month = ?`
        )
        .get(Number(y), Number(m)) || {};

    const trend = db()
      .prepare(
        `SELECT a.work_date AS date,
           SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS present,
           SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS absent,
           SUM(CASE WHEN a.status = 'leave' THEN 1 ELSE 0 END) AS leave_count
         FROM attendance a
         JOIN officers o ON o.id = a.officer_id
         WHERE a.work_date BETWEEN ? AND ?
           AND a.work_date >= o.joining_date
         GROUP BY a.work_date
         ORDER BY a.work_date`
      )
      .all(range.start, range.end);

    const denom = Number(monthAgg.denom) || 0;
    const earned = Number(monthAgg.earned) || 0;
    const totalOfficers = db().prepare("SELECT COUNT(*) AS c FROM officers").get()?.c || 0;
    const estimatedSalary =
      db().prepare("SELECT IFNULL(SUM(salary),0) AS total FROM officers WHERE status = 'active'").get()?.total || 0;
    const todayHours =
      db()
        .prepare(
          `SELECT
             IFNULL(SUM(working_hours),0) AS hours,
             IFNULL(SUM(overtime_hours),0) AS overtime
           FROM attendance WHERE work_date = ?`
        )
        .get(today) || {};
    const todayRoster = db()
      .prepare(
        `SELECT o.id, o.name, o.officer_code, a.status, a.check_in, a.check_out,
                a.working_hours, a.overtime_hours, a.is_late
         FROM officers o
         LEFT JOIN attendance a ON a.officer_id = o.id AND a.work_date = ?
         WHERE o.status = 'active'
           AND o.joining_date <= ?
           AND (o.leaving_date IS NULL OR o.leaving_date >= ?)
         ORDER BY o.name`
      )
      .all(today, today, today);
    const recentActivity = db()
      .prepare(
        `SELECT a.id, a.work_date, a.status, a.check_in, a.check_out, a.working_hours, a.overtime_hours,
                o.name AS officer_name, o.officer_code
         FROM attendance a
         JOIN officers o ON o.id = a.officer_id
         ORDER BY a.work_date DESC, a.id DESC
         LIMIT 12`
      )
      .all();
    const officerHours = db()
      .prepare(
        `SELECT o.id, o.name, o.officer_code,
                IFNULL(SUM(a.working_hours),0) AS hours,
                IFNULL(SUM(a.overtime_hours),0) AS overtime
         FROM officers o
         LEFT JOIN attendance a ON a.officer_id = o.id AND a.work_date BETWEEN ? AND ?
         WHERE o.status = 'active'
         GROUP BY o.id
         ORDER BY o.name`
      )
      .all(range.start, range.end);

    res.json({
      today,
      todayStats,
      total_officers: Number(totalOfficers) || 0,
      estimated_salary: roundHours(Number(estimatedSalary) || 0),
      today_hours: roundHours(Number(todayHours.hours) || 0),
      today_overtime: roundHours(Number(todayHours.overtime) || 0),
      today_roster: todayRoster || [],
      recent_activity: recentActivity || [],
      officer_hours: officerHours || [],
      monthly: {
        active: activeCount,
        attendance_percentage: denom ? roundHours((earned / denom) * 100) : 0,
        working_hours: roundHours(Number(monthAgg.hours) || 0),
        overtime: roundHours(Number(monthAgg.overtime) || 0),
        salary_total: roundHours(Number(salaryAgg.total) || 0),
        salary_paid: roundHours(Number(salaryAgg.paid) || 0),
        salary_pending: roundHours(Number(salaryAgg.pending) || 0),
        estimated_salary: roundHours(Number(estimatedSalary) || 0),
      },
      trend: trend || [],
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ error: "Unable to load dashboard data. Please try again." });
  }
});

/* ---------- Settings / holidays ---------- */

app.get("/api/settings", (_req, res) => {
  res.json({
    settings: settings(),
    holidays: db().prepare("SELECT * FROM holidays ORDER BY holiday_date").all(),
    departments: db().prepare("SELECT * FROM departments ORDER BY name").all(),
    shifts: db().prepare("SELECT * FROM shifts ORDER BY name").all(),
  });
});

app.put("/api/settings", (req, res) => {
  const entries = req.body || {};
  const upsert = db().prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  const tx = db().transaction((obj) => {
    for (const [key, value] of Object.entries(obj)) {
      upsert.run(key, String(value));
    }
  });
  tx(entries);
  res.json(settings());
});

app.post("/api/holidays", (req, res) => {
  const { holiday_date, name } = req.body;
  if (!holiday_date || !name) return res.status(400).json({ error: "Holiday date and name are required." });
  try {
    const info = db()
      .prepare("INSERT INTO holidays (holiday_date, name) VALUES (?, ?)")
      .run(holiday_date, name.trim());
    res.json(db().prepare("SELECT * FROM holidays WHERE id = ?").get(info.lastInsertRowid));
  } catch {
    res.status(400).json({ error: "A holiday already exists on this date." });
  }
});

app.delete("/api/holidays/:id", (req, res) => {
  db().prepare("DELETE FROM holidays WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

/* ---------- Export / backup ---------- */

function sendWorkbook(res, filename, sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
}

app.get("/api/export/officers", (_req, res) => {
  const rows = db()
    .prepare(
      `${officerJoin("o")} ORDER BY o.name`
    )
    .all()
    .map((o) => ({
      Name: o.name,
      OfficerID: o.officer_code,
      Phone: o.phone,
      CNIC: o.cnic,
      Designation: o.designation,
      Department: o.department_name,
      Shift: o.shift_name,
      JoiningDate: o.joining_date,
      MonthlySalary: salaryRates(o, settings()).monthly_salary,
      DailySalary: salaryRates(o, settings()).daily_salary,
      HourlyRate: salaryRates(o, settings()).hourly_rate,
      WorkingHoursPerDay: salaryRates(o, settings()).working_hours_per_day,
      SalaryType: o.salary_type,
      PaymentMethod: paymentMethodLabel(o.payment_method),
      BankName: o.bank_name,
      AccountName: o.account_name,
      AccountNumber: o.account_number,
      IBAN: o.iban,
      PaymentMobile: o.payment_mobile,
      NayaPayAccountName: o.nayapay_account_name,
      NayaPayNumber: o.nayapay_number,
      NayaPayIBAN: o.nayapay_iban,
      EasypaisaIBAN: o.easypaisa_iban,
      BankDetails: formatPaymentAccountSummary(o) || o.bank_details,
      EmergencyContact: o.emergency_contact,
      Status: o.status,
      LeavingDate: o.leaving_date,
      Notes: o.notes,
    }));
  const format = String(_req.query.format || "xlsx");
  if (format === "csv") {
    const ws = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(ws);
    res.setHeader("Content-Disposition", "attachment; filename=\"officers.csv\"");
    res.type("text/csv").send(csv);
    return;
  }
  sendWorkbook(res, "officers.xlsx", { Officers: rows });
});

app.get("/api/export/attendance", (req, res) => {
  const { date, month, year, officer_id } = req.query;
  const where = [];
  const params = [];
  if (date) {
    where.push("a.work_date = ?");
    params.push(date);
  }
  if (year && month) {
    const range = monthDateRange(year, month);
    where.push("a.work_date BETWEEN ? AND ?");
    params.push(range.start, range.end);
  }
  if (officer_id) {
    where.push("a.officer_id = ?");
    params.push(officer_id);
  }
  const rows = db()
    .prepare(
      `SELECT a.work_date, o.name, o.officer_code, s.name AS shift_name, a.status,
              a.check_in, a.check_out, a.working_hours, a.is_late, a.late_minutes, a.overtime_hours, a.remarks
       FROM attendance a
       JOIN officers o ON o.id = a.officer_id
       LEFT JOIN shifts s ON s.id = a.shift_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY a.work_date, o.name`
    )
    .all(...params)
    .map((r) => ({
      Date: r.work_date,
      Officer: r.name,
      OfficerID: r.officer_code,
      Shift: r.shift_name,
      Status: r.status,
      CheckIn: r.check_in,
      CheckOut: r.check_out,
      WorkingHours: r.working_hours,
      Late: r.is_late ? "Yes" : "No",
      LateMinutes: r.late_minutes,
      Overtime: r.overtime_hours,
      Remarks: r.remarks,
    }));
  const format = String(req.query.format || "xlsx");
  if (format === "csv") {
    const ws = XLSX.utils.json_to_sheet(rows);
    res.setHeader("Content-Disposition", "attachment; filename=\"attendance.csv\"");
    res.type("text/csv").send(XLSX.utils.sheet_to_csv(ws));
    return;
  }
  sendWorkbook(res, "attendance.xlsx", { Attendance: rows });
});

app.get("/api/export/monthly", (req, res) => {
  const { year, month, officer_id, shift_id } = req.query;
  if (!year || !month) return res.status(400).json({ error: "Month and year are required." });
  const report = monthlyReport({ year, month, officer_id, shift_id }).map((r) => ({
    Officer: r.officer.name,
    OfficerID: r.officer.officer_code,
    Shift: r.officer.shift_name,
    WorkingDays: r.working_days,
    Present: r.present,
    Absent: r.absent,
    HalfDay: r.half_day,
    Leave: r.leave,
    Off: r.off,
    Late: r.late,
    WorkingHours: r.working_hours,
    Overtime: r.overtime,
    AttendancePercent: r.attendance_percentage,
  }));
  sendWorkbook(res, `monthly-report-${year}-${month}.xlsx`, { Report: report });
});

app.get("/api/backup", (_req, res) => {
  try {
    const dest = backupDatabase();
    res.download(dest, path.basename(dest));
  } catch (err) {
    res.status(500).json({ error: "Backup failed: " + err.message });
  }
});

app.get("/api/backups", (_req, res) => {
  const files = fs
    .readdirSync(backupsDir)
    .filter((f) => f.endsWith(".db"))
    .map((name) => {
      const stat = fs.statSync(path.join(backupsDir, name));
      return { name, size: stat.size, created: stat.mtime };
    })
    .sort((a, b) => new Date(b.created) - new Date(a.created));
  res.json(files);
});

app.post("/api/restore", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Please upload a database backup file." });
  try {
    restoreDatabase(req.file.path);
    fs.unlinkSync(req.file.path);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Restore failed: " + err.message });
  }
});

app.use((req, res, next) => {
  const p = String(req.path || "").toLowerCase();
  if (
    p.includes(".env") ||
    p.endsWith(".db") ||
    p.startsWith("/data") ||
    p.startsWith("/backups") ||
    p.startsWith("/private") ||
    p.startsWith("/server") ||
    p.startsWith("/uploads")
  ) {
    return res.status(404).json({ error: "Not found." });
  }
  next();
});

const clientDist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(
    express.static(clientDist, {
      dotfiles: "deny",
      index: false,
      setHeaders(res, filePath) {
        if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-store");
      },
    })
  );
  app.get(/.*/, (req, res) => {
    if (req.path.startsWith("/api")) {
      return res.status(404).json({ error: "Not found." });
    }
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use((err, req, res, _next) => {
  console.error("Request failed:", req.method, req.path, err.message);
  const status = Number(err.status) || 500;
  const message =
    status >= 500 && isProd ? "Something went wrong." : err.message || "Request failed.";
  res.status(status).json({ error: message });
});

getDb();
ensureBootstrapUsers();
applyAdminPasswordReset();

app.listen(PORT, HOST, () => {
  console.log(`OfficerFlow ${NODE_ENV} server listening on ${HOST}:${PORT}`);
});
