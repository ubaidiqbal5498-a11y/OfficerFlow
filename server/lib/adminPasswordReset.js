const path = require("path");
const { getDb, dbPath } = require("../db");
const { DATA_DIR, DATABASE_PATH } = require("../config");
const { hashPassword, verifyPassword } = require("./auth");

function posix(p) {
  return String(p || "").replace(/\\/g, "/");
}

function isRailwayProductionDb(dataDir = DATA_DIR, databasePath = DATABASE_PATH) {
  const resolved = posix(path.resolve(databasePath || dbPath || ""));
  const dir = posix(dataDir);
  return resolved === "/var/data/officerflow.db" || dir === "/var/data";
}

function takeResetPassword() {
  const password = String(process.env.RESET_ADMIN_PASSWORD || "");
  delete process.env.RESET_ADMIN_PASSWORD;
  return password;
}

function applyAdminPasswordReset() {
  const password = String(process.env.RESET_ADMIN_PASSWORD || "");
  if (password.length < 8) return { applied: false, reason: "unset" };
  if (!isRailwayProductionDb()) {
    return { applied: false, reason: "not-production-db" };
  }

  const db = getDb();
  const admin = db
    .prepare("SELECT id, username, role, password_hash FROM users WHERE username = 'admin'")
    .get();
  if (!admin || admin.role !== "admin") {
    takeResetPassword();
    console.warn("RESET_ADMIN_PASSWORD is set but the admin user was not found. No rows were changed.");
    return { applied: false, reason: "no-admin" };
  }

  if (verifyPassword(password, admin.password_hash)) {
    takeResetPassword();
    return { applied: false, reason: "already-current" };
  }

  const result = db
    .prepare(
      "UPDATE users SET password_hash = ?, updated_at = datetime('now','localtime') WHERE id = ? AND username = 'admin' AND role = 'admin'"
    )
    .run(hashPassword(password), admin.id);

  if (!result.changes) {
    takeResetPassword();
    console.warn("Admin password was not updated. No rows were changed.");
    return { applied: false, reason: "no-change" };
  }

  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(admin.id);
  takeResetPassword();
  console.log("Admin password updated for username: admin. Remove RESET_ADMIN_PASSWORD from Railway Variables after you sign in.");
  return { applied: true, reason: "updated" };
}

module.exports = {
  posix,
  isRailwayProductionDb,
  applyAdminPasswordReset,
};
