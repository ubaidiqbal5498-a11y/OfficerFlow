const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { DATA_DIR, DATABASE_PATH } = require("./config");

const dataDir = DATA_DIR;
const backupsDir = path.join(dataDir, "backups");
const privateDir = path.join(dataDir, "private");
const dbPath = DATABASE_PATH;

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(backupsDir, { recursive: true });
fs.mkdirSync(privateDir, { recursive: true });

let db;

function wrap(database) {
  const originalPrepare = database.prepare.bind(database);
  database.prepare = (sql) => {
    const stmt = originalPrepare(sql);
    return {
      run: (...params) => stmt.run(...params),
      get: (...params) => stmt.get(...params) ?? undefined,
      all: (...params) => stmt.all(...params),
    };
  };
  database.transaction = (fn) => {
    return (...args) => {
      database.exec("BEGIN");
      try {
        const result = fn(...args);
        database.exec("COMMIT");
        return result;
      } catch (err) {
        database.exec("ROLLBACK");
        throw err;
      }
    };
  };
  return database;
}

function getDb() {
  if (!db) {
    db = wrap(new DatabaseSync(dbPath));
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA busy_timeout = 5000");
    migrate(db);
    seed(db);
  }
  return db;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      is_night INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS officers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      officer_code TEXT NOT NULL UNIQUE,
      phone TEXT,
      cnic TEXT,
      designation TEXT,
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
      joining_date TEXT NOT NULL,
      salary REAL NOT NULL DEFAULT 0 CHECK (salary >= 0),
      salary_type TEXT NOT NULL DEFAULT 'monthly' CHECK (salary_type IN ('monthly','daily')),
      bank_details TEXT,
      emergency_contact TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','resigned','terminated')),
      leaving_date TEXT,
      leaving_reason TEXT,
      notes TEXT,
      working_hours_per_day REAL,
      photo_path TEXT,
      father_name TEXT,
      date_of_birth TEXT,
      whatsapp TEXT,
      email TEXT,
      address TEXT,
      emergency_contact_name TEXT,
      emergency_contact_phone TEXT,
      supervisor_id INTEGER REFERENCES officers(id) ON DELETE SET NULL,
      payment_method TEXT,
      salary_status TEXT NOT NULL DEFAULT 'active',
      salary_effective_date TEXT,
      account_name TEXT,
      bank_name TEXT,
      account_number TEXT,
      iban TEXT,
      payment_mobile TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      officer_id INTEGER NOT NULL REFERENCES officers(id) ON DELETE RESTRICT,
      work_date TEXT NOT NULL,
      shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
      check_in TEXT,
      check_out TEXT,
      status TEXT NOT NULL CHECK (status IN ('present','absent','half_day','leave','off','holiday')),
      remarks TEXT,
      working_hours REAL NOT NULL DEFAULT 0,
      late_minutes INTEGER NOT NULL DEFAULT 0,
      is_late INTEGER NOT NULL DEFAULT 0,
      overtime_hours REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE (officer_id, work_date)
    );

    CREATE TABLE IF NOT EXISTS salary_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      officer_id INTEGER NOT NULL REFERENCES officers(id) ON DELETE RESTRICT,
      amount REAL NOT NULL CHECK (amount >= 0),
      salary_type TEXT NOT NULL CHECK (salary_type IN ('monthly','daily')),
      effective_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS salary_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      officer_id INTEGER NOT NULL REFERENCES officers(id) ON DELETE RESTRICT,
      month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
      year INTEGER NOT NULL,
      basic_salary REAL NOT NULL DEFAULT 0,
      working_days INTEGER NOT NULL DEFAULT 0,
      present_days REAL NOT NULL DEFAULT 0,
      absent_days INTEGER NOT NULL DEFAULT 0,
      leave_days INTEGER NOT NULL DEFAULT 0,
      half_days INTEGER NOT NULL DEFAULT 0,
      overtime_hours REAL NOT NULL DEFAULT 0,
      deductions REAL NOT NULL DEFAULT 0,
      bonuses REAL NOT NULL DEFAULT 0,
      net_salary REAL NOT NULL DEFAULT 0,
      paid INTEGER NOT NULL DEFAULT 0,
      payment_date TEXT,
      payment_method TEXT,
      remarks TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE (officer_id, month, year)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      holiday_date TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS employment_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      officer_id INTEGER NOT NULL REFERENCES officers(id) ON DELETE RESTRICT,
      event_type TEXT NOT NULL,
      event_date TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS officer_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      officer_id INTEGER NOT NULL REFERENCES officers(id) ON DELETE RESTRICT,
      doc_type TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      officer_id INTEGER REFERENCES officers(id) ON DELETE SET NULL,
      actor TEXT NOT NULL DEFAULT 'Admin',
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','boss')),
      display_name TEXT,
      email TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_officers_name ON officers(name);
    CREATE INDEX IF NOT EXISTS idx_officers_phone ON officers(phone);
    CREATE INDEX IF NOT EXISTS idx_officers_cnic ON officers(cnic);
    CREATE INDEX IF NOT EXISTS idx_officers_status ON officers(status);
    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(work_date);
    CREATE INDEX IF NOT EXISTS idx_attendance_officer ON attendance(officer_id);
    CREATE INDEX IF NOT EXISTS idx_salary_history_officer ON salary_history(officer_id);
    CREATE INDEX IF NOT EXISTS idx_salary_payments_period ON salary_payments(year, month);
    CREATE INDEX IF NOT EXISTS idx_officer_documents_officer ON officer_documents(officer_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_officer ON audit_log(officer_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);

  migrateExistingSchema(database);
}

function addColumnIfMissing(database, table, name, definition) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!columns.includes(name)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

function migrateExistingSchema(database) {
  const officerColumns = [
    ["working_hours_per_day", "REAL"],
    ["photo_path", "TEXT"],
    ["father_name", "TEXT"],
    ["date_of_birth", "TEXT"],
    ["whatsapp", "TEXT"],
    ["email", "TEXT"],
    ["address", "TEXT"],
    ["emergency_contact_name", "TEXT"],
    ["emergency_contact_phone", "TEXT"],
    ["supervisor_id", "INTEGER"],
    ["payment_method", "TEXT"],
    ["salary_status", "TEXT"],
    ["salary_effective_date", "TEXT"],
    ["account_name", "TEXT"],
    ["bank_name", "TEXT"],
    ["account_number", "TEXT"],
    ["iban", "TEXT"],
    ["payment_mobile", "TEXT"],
  ];
  for (const [name, def] of officerColumns) {
    addColumnIfMissing(database, "officers", name, def);
  }
  addColumnIfMissing(database, "salary_history", "changed_by", "TEXT");
  addColumnIfMissing(database, "salary_history", "reason", "TEXT");
  addColumnIfMissing(database, "shifts", "overtime_mode", "TEXT");
  addColumnIfMissing(database, "shifts", "overtime_cutoff", "TEXT");
  addColumnIfMissing(database, "users", "email", "TEXT");
  database.exec(`
    UPDATE shifts
    SET overtime_mode = CASE WHEN is_night = 1 THEN 'after_hours' ELSE 'cutoff' END,
        overtime_cutoff = CASE WHEN is_night = 1 THEN overtime_cutoff ELSE IFNULL(overtime_cutoff, '17:00') END
    WHERE IFNULL(overtime_mode, '') = ''
  `);

  database.exec(`
    UPDATE officers
    SET emergency_contact_name = emergency_contact
    WHERE IFNULL(emergency_contact_name, '') = ''
      AND IFNULL(emergency_contact, '') != ''
  `);
  database.exec(`
    UPDATE officers
    SET salary_status = 'active'
    WHERE IFNULL(salary_status, '') = ''
  `);
  database.exec(`
    UPDATE salary_history
    SET reason = notes
    WHERE IFNULL(reason, '') = '' AND IFNULL(notes, '') != ''
  `);
  database.exec(`
    UPDATE salary_history
    SET changed_by = 'Admin'
    WHERE IFNULL(changed_by, '') = ''
  `);

  const schema = database.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'officers'"
  ).get();
  const sql = schema?.sql || "";
  const hasOldStatusCheck =
    sql.includes("CHECK (status IN ('active','inactive'))") && !sql.includes("resigned");
  if (hasOldStatusCheck) {
    rebuildOfficersTable(database);
  }
}

function rebuildOfficersTable(database) {
  const targetColumns = [
    "id", "name", "officer_code", "phone", "cnic", "designation", "department_id", "shift_id",
    "joining_date", "salary", "salary_type", "bank_details", "emergency_contact", "status",
    "leaving_date", "leaving_reason", "notes", "working_hours_per_day", "photo_path",
    "father_name", "date_of_birth", "whatsapp", "email", "address", "emergency_contact_name",
    "emergency_contact_phone", "supervisor_id", "payment_method", "salary_status",
    "salary_effective_date", "account_name", "bank_name", "account_number", "iban",
    "payment_mobile", "created_at", "updated_at",
  ];
  const existing = database.prepare("PRAGMA table_info(officers)").all().map((c) => c.name);
  const shared = targetColumns.filter((name) => existing.includes(name));
  database.exec("PRAGMA foreign_keys = OFF");
  database.exec(`
    CREATE TABLE officers_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      officer_code TEXT NOT NULL UNIQUE,
      phone TEXT,
      cnic TEXT,
      designation TEXT,
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
      joining_date TEXT NOT NULL,
      salary REAL NOT NULL DEFAULT 0 CHECK (salary >= 0),
      salary_type TEXT NOT NULL DEFAULT 'monthly' CHECK (salary_type IN ('monthly','daily')),
      bank_details TEXT,
      emergency_contact TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','resigned','terminated')),
      leaving_date TEXT,
      leaving_reason TEXT,
      notes TEXT,
      working_hours_per_day REAL,
      photo_path TEXT,
      father_name TEXT,
      date_of_birth TEXT,
      whatsapp TEXT,
      email TEXT,
      address TEXT,
      emergency_contact_name TEXT,
      emergency_contact_phone TEXT,
      supervisor_id INTEGER REFERENCES officers(id) ON DELETE SET NULL,
      payment_method TEXT,
      salary_status TEXT NOT NULL DEFAULT 'active',
      salary_effective_date TEXT,
      account_name TEXT,
      bank_name TEXT,
      account_number TEXT,
      iban TEXT,
      payment_mobile TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);
  database.exec(
    `INSERT INTO officers_new (${shared.join(", ")}) SELECT ${shared.join(", ")} FROM officers`
  );
  database.exec("DROP TABLE officers");
  database.exec("ALTER TABLE officers_new RENAME TO officers");
  database.exec("CREATE INDEX IF NOT EXISTS idx_officers_name ON officers(name)");
  database.exec("CREATE INDEX IF NOT EXISTS idx_officers_phone ON officers(phone)");
  database.exec("CREATE INDEX IF NOT EXISTS idx_officers_cnic ON officers(cnic)");
  database.exec("CREATE INDEX IF NOT EXISTS idx_officers_status ON officers(status)");
  database.exec("PRAGMA foreign_keys = ON");
}

const DEFAULT_SETTINGS = {
  office_start_time: "09:00",
  normal_working_hours: "10",
  overtime_after_hours: "10",
  overtime_cutoff_time: "17:00",
  late_grace_minutes: "0",
  default_shift_id: "1",
  deduct_absent: "false",
  deduct_half_day: "false",
  overtime_pay_enabled: "false",
  overtime_rate_per_hour: "0",
  working_days_per_month: "30",
  office_name: "OfficerFlow",
};

function seed(database) {
  const deptCount = database.prepare("SELECT COUNT(*) AS c FROM departments").get().c;
  if (deptCount === 0) {
    const insert = database.prepare("INSERT INTO departments (name) VALUES (?)");
    ["Administration", "Operations", "Finance", "Human Resources", "Security"].forEach((name) =>
      insert.run(name)
    );
  }

  const shiftCount = database.prepare("SELECT COUNT(*) AS c FROM shifts").get().c;
  if (shiftCount === 0) {
    const insert = database.prepare(
      "INSERT INTO shifts (name, start_time, end_time, is_night, overtime_mode, overtime_cutoff) VALUES (?, ?, ?, ?, ?, ?)"
    );
    insert.run("Morning", "09:00", "17:00", 0, "cutoff", "17:00");
    insert.run("Evening", "14:00", "22:00", 0, "cutoff", "17:00");
    insert.run("Night", "22:00", "06:00", 1, "after_hours", null);
  }

  const insertSetting = database.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
  );
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    insertSetting.run(key, value);
  }

  seedOfficeRules(database);
  seedRealOfficers(database);
}

function setSetting(database, key, value) {
  database
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(key, String(value));
}

function seedOfficeRules(database) {
  const version = database.prepare("SELECT value FROM settings WHERE key = 'config_version'").get();
  if (version && Number(version.value) >= 2) return;

  setSetting(database, "normal_working_hours", "10");
  setSetting(database, "overtime_after_hours", "10");
  setSetting(database, "working_days_per_month", "30");
  setSetting(database, "deduct_absent", "false");
  setSetting(database, "config_version", "2");

  const morning = database.prepare("SELECT id, end_time FROM shifts WHERE name = 'Morning'").get();
  if (morning && morning.end_time === "17:00") {
    database.prepare("UPDATE shifts SET end_time = '19:00' WHERE id = ?").run(morning.id);
  }
}

function deleteOfficerCascade(database, id) {
  database.prepare("DELETE FROM attendance WHERE officer_id = ?").run(id);
  database.prepare("DELETE FROM salary_history WHERE officer_id = ?").run(id);
  database.prepare("DELETE FROM salary_payments WHERE officer_id = ?").run(id);
  database.prepare("DELETE FROM employment_history WHERE officer_id = ?").run(id);
  database.prepare("DELETE FROM officers WHERE id = ?").run(id);
}

function seedRealOfficers(database) {
  const demoRows = database
    .prepare(
      `SELECT id FROM officers
       WHERE officer_code IN ('OF-001', 'OF-002', 'OF-003')
          OR name IN ('Ahmed Khan', 'Sara Malik', 'Old Officer')`
    )
    .all();
  for (const row of demoRows) deleteOfficerCascade(database, row.id);

  const realOfficers = [
    { code: "EMP001", name: "Saad", salary: 45000 },
    { code: "EMP002", name: "Aliyan", salary: 45000 },
    { code: "EMP003", name: "Bilawal", salary: 40000 },
    { code: "EMP004", name: "Miraj", salary: 45000 },
  ];
  const defaultShift = database.prepare("SELECT id FROM shifts WHERE name = 'Morning'").get();
  const shiftId = defaultShift?.id || 1;

  for (const officer of realOfficers) {
    const existing = database.prepare("SELECT * FROM officers WHERE officer_code = ?").get(officer.code);
    if (existing) {
      continue;
    }

    const info = database
      .prepare(
        `INSERT INTO officers (
          name, officer_code, joining_date, salary, salary_type, status, shift_id, working_hours_per_day
        ) VALUES (?, ?, '2026-08-19', ?, 'monthly', 'active', ?, 10)`
      )
      .run(officer.name, officer.code, officer.salary, shiftId);
    const id = Number(info.lastInsertRowid);
    database
      .prepare(
        "INSERT INTO salary_history (officer_id, amount, salary_type, effective_date, notes, changed_by, reason) VALUES (?, ?, 'monthly', '2026-08-19', 'Starting salary', 'Admin', 'Starting salary')"
      )
      .run(id, officer.salary);
    database
      .prepare(
        "INSERT INTO employment_history (officer_id, event_type, event_date, details) VALUES (?, 'join', '2026-08-19', ?)"
      )
      .run(id, JSON.stringify({ salary: officer.salary, salary_type: "monthly", working_hours_per_day: 10 }));
  }
}

function getSettingsMap(database = getDb()) {
  const rows = database.prepare("SELECT key, value FROM settings").all();
  const map = { ...DEFAULT_SETTINGS };
  for (const row of rows) map[row.key] = row.value;
  return map;
}

function backupDatabase() {
  const database = getDb();
  database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(backupsDir, `officerflow-${stamp}.db`);
  fs.copyFileSync(dbPath, dest);
  return dest;
}

function restoreDatabase(sourcePath) {
  closeDb();
  fs.copyFileSync(sourcePath, dbPath);
  const wal = `${dbPath}-wal`;
  const shm = `${dbPath}-shm`;
  if (fs.existsSync(wal)) fs.unlinkSync(wal);
  if (fs.existsSync(shm)) fs.unlinkSync(shm);
  return getDb();
}

module.exports = {
  getDb,
  closeDb,
  getSettingsMap,
  backupDatabase,
  restoreDatabase,
  dbPath,
  backupsDir,
  dataDir,
  privateDir,
};
