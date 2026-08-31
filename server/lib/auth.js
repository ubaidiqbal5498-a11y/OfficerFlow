const crypto = require("crypto");
const { getDb } = require("../db");
const {
  isProd,
  SESSION_SECRET,
  SESSION_DAYS,
  COOKIE_NAME,
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  ADMIN_NAME,
} = require("../config");
const { parseCookies, serializeCookie, clientIp } = require("./security");

const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 20;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function loginAttemptKey(ip, username) {
  return `${String(ip || "unknown")}|${String(username || "").trim().toLowerCase()}`;
}

function db() {
  return getDb();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !String(stored).includes(":")) return false;
  const [salt, hash] = String(stored).split(":");
  try {
    const check = crypto.scryptSync(String(password), salt, 64);
    const actual = Buffer.from(hash, "hex");
    if (actual.length !== check.length) return false;
    return crypto.timingSafeEqual(actual, check);
  } catch {
    return false;
  }
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    display_name: row.display_name || row.username,
    email: row.email || "",
  };
}

function signToken(raw) {
  const secret = SESSION_SECRET || "dev-only-session-secret";
  const hmac = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  return `${raw}.${hmac}`;
}

function unsignToken(value) {
  if (!value || !value.includes(".")) return null;
  const idx = value.lastIndexOf(".");
  const raw = value.slice(0, idx);
  const hmac = value.slice(idx + 1);
  const secret = SESSION_SECRET || "dev-only-session-secret";
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(hmac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return raw;
}

function cookieSecureFlag({ isProd: prod, cookieSecureEnv, https }) {
  const localHttpProd = prod && cookieSecureEnv === "false" && !https;
  if (localHttpProd) return false;
  return Boolean(prod || https || cookieSecureEnv === "true");
}

function cookieOptions(req) {
  const headerProto = String(req?.headers?.["x-forwarded-proto"] || "").toLowerCase();
  const https = headerProto.includes("https") || Boolean(req?.secure);
  return {
    httpOnly: true,
    secure: cookieSecureFlag({
      isProd,
      cookieSecureEnv: process.env.COOKIE_SECURE,
      https,
    }),
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

function setSessionCookie(res, token, req) {
  res.append("Set-Cookie", serializeCookie(COOKIE_NAME, signToken(token), cookieOptions(req)));
}

function clearSessionCookie(res, req) {
  res.append(
    "Set-Cookie",
    serializeCookie(COOKIE_NAME, "", { ...cookieOptions(req), maxAge: 0 })
  );
}

function tooManyLogins(ip, username) {
  const rec = loginAttempts.get(loginAttemptKey(ip, username));
  if (!rec) return false;
  if (rec.reset < Date.now()) {
    loginAttempts.delete(loginAttemptKey(ip, username));
    return false;
  }
  return rec.count >= MAX_LOGIN_ATTEMPTS;
}

function recordLoginFailure(ip, username) {
  const key = loginAttemptKey(ip, username);
  const now = Date.now();
  const rec = loginAttempts.get(key);
  if (!rec || rec.reset < now) {
    loginAttempts.set(key, { count: 1, reset: now + LOGIN_WINDOW_MS });
    return;
  }
  rec.count += 1;
}

function clearLoginAttempts(ip, username) {
  loginAttempts.delete(loginAttemptKey(ip, username));
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  db().prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
    token,
    userId,
    expiresAt
  );
  db().prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  return token;
}

function destroySession(token) {
  if (token) db().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

function destroyOtherSessions(userId, keepToken) {
  if (keepToken) {
    db().prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").run(userId, keepToken);
  } else {
    db().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }
}

function userFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  const signed = cookies[COOKIE_NAME];
  const token = unsignToken(signed);
  if (!token) return { user: null, token: null };
  const row = db()
    .prepare(
      `SELECT s.token, s.expires_at, u.id, u.username, u.role, u.display_name, u.email, u.active
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .get(token);
  if (!row || Number(row.expires_at) < Date.now() || !row.active) {
    if (row) destroySession(token);
    return { user: null, token: null };
  }
  return { user: publicUser(row), token };
}

function isPublicApi(req) {
  const path = req.path;
  if (req.method === "GET" && path === "/api/health") return true;
  if (req.method === "POST" && path === "/api/auth/login") return true;
  if (req.method === "POST" && path === "/api/auth/logout") return true;
  return false;
}

function isAdminOnly(method, pathname) {
  if (pathname.startsWith("/api/users")) return true;
  if (pathname === "/api/settings") return true;
  if (pathname === "/api/backup" || pathname === "/api/backups" || pathname === "/api/restore") {
    return true;
  }
  if (pathname === "/api/officers/next-code") return true;
  if (pathname === "/api/audit") return true;

  if (/^\/api\/departments(\/\d+)?$/.test(pathname) && method !== "GET") return true;
  if (/^\/api\/shifts(\/\d+)?$/.test(pathname) && method !== "GET") return true;
  if (/^\/api\/holidays(\/\d+)?$/.test(pathname) && method !== "GET") return true;

  if (pathname === "/api/officers" && method === "POST") return true;
  if (/^\/api\/officers\/\d+$/.test(pathname) && method === "PUT") return true;
  if (/^\/api\/officers\/\d+\/deactivate$/.test(pathname)) return true;
  if (/^\/api\/officers\/\d+\/photo$/.test(pathname) && method === "POST") return true;
  if (/^\/api\/officers\/\d+\/documents(\/\d+)?$/.test(pathname) && method !== "GET") return true;

  if (pathname === "/api/salary/history" && method === "POST") return true;
  if (pathname === "/api/salary/calculate" || pathname === "/api/salary/calculate-all") return true;
  if (pathname === "/api/salary/payments" && method === "POST") return true;
  if (/^\/api\/salary\/payments\/\d+$/.test(pathname) && method === "PUT") return true;

  if (/^\/api\/attendance\/\d+$/.test(pathname) && method === "DELETE") return true;
  return false;
}

function apiGuard(req, res, next) {
  if (!req.path.startsWith("/api")) return next();
  if (isPublicApi(req)) return next();
  const { user, token } = userFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Please sign in to continue." });
  }
  req.user = user;
  req.sessionToken = token;
  if (isAdminOnly(req.method, req.path) && user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
}

function ensureUser({ username, password, role, displayName }) {
  const name = String(username || "").trim().toLowerCase();
  if (!name || !password) return null;
  const existing = db().prepare("SELECT id FROM users WHERE username = ?").get(name);
  if (existing) return existing;
  const info = db()
    .prepare(
      "INSERT INTO users (username, password_hash, role, display_name, active) VALUES (?, ?, ?, ?, 1)"
    )
    .run(name, hashPassword(password), role, displayName || name);
  return { id: Number(info.lastInsertRowid) };
}

function ensureBootstrapUsers() {
  if (ADMIN_USERNAME && ADMIN_PASSWORD) {
    ensureUser({
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
      role: "admin",
      displayName: ADMIN_NAME,
    });
  }
  const count = db().prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (!count) {
    const message =
      "No application users exist. Set ADMIN_USERNAME and ADMIN_PASSWORD, then restart, or run npm run set-admin-password.";
    if (isProd) throw new Error(message);
    console.warn(message);
  }
}

function validateCredentials(username, password) {
  const name = String(username || "").trim();
  const pass = String(password || "");
  if (name.length < 3 || name.length > 64) return "Enter a valid username.";
  if (pass.length < 8 || pass.length > 200) return "Password must be at least 8 characters.";
  return null;
}

module.exports = {
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
  cookieSecureFlag,
  cookieOptions,
  clientIp,
  apiGuard,
  ensureBootstrapUsers,
  validateCredentials,
};
