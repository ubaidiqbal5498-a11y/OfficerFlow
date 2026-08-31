/**
 * One-time Railway admin password reset.
 * Updates only users.password_hash for username = admin.
 * Refuses to run unless the database is /var/data/officerflow.db
 */
require("../config");
const path = require("path");
const { getDb, closeDb, dbPath } = require("../db");
const { hashPassword } = require("../lib/auth");
const { DATABASE_PATH, DATA_DIR } = require("../config");

function posix(p) {
  return String(p || "").replace(/\\/g, "/");
}

function assertProductionDatabase() {
  const resolved = posix(path.resolve(DATABASE_PATH || dbPath));
  const dataDir = posix(DATA_DIR);
  const allowed =
    resolved === "/var/data/officerflow.db" ||
    dataDir === "/var/data" ||
    posix(process.env.DATABASE_PATH) === "/var/data/officerflow.db";
  if (!allowed) {
    throw new Error(
      "Refusing to run. This script only updates Railway production SQLite at /var/data/officerflow.db. Local data was not changed."
    );
  }
}

function main() {
  const password = String(process.env.RESET_ADMIN_PASSWORD || "");
  if (password.length < 8) {
    throw new Error("Set RESET_ADMIN_PASSWORD to the new admin password (min 8 characters). Do not put it in source code.");
  }
  assertProductionDatabase();

  const db = getDb();
  const admin = db.prepare("SELECT id, username, role FROM users WHERE username = 'admin'").get();
  if (!admin) {
    throw new Error("No admin user found. No rows were changed.");
  }
  if (admin.role !== "admin") {
    throw new Error("The admin username exists but is not an admin role. No rows were changed.");
  }

  const result = db
    .prepare(
      "UPDATE users SET password_hash = ?, updated_at = datetime('now','localtime') WHERE id = ? AND username = 'admin' AND role = 'admin'"
    )
    .run(hashPassword(password), admin.id);

  if (!result.changes) {
    throw new Error("Admin password was not updated. No rows were changed.");
  }

  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(admin.id);
  console.log("Admin password updated for username: admin");
  console.log("Database:", posix(dbPath));
}

try {
  main();
} catch (err) {
  console.error(err.message || "Could not reset admin password.");
  process.exitCode = 1;
} finally {
  try {
    closeDb();
  } catch {
    /* ignore */
  }
}
