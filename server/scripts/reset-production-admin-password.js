/**
 * Optional CLI for Railway. Production startup also applies RESET_ADMIN_PASSWORD.
 * Updates only users.password_hash for username = admin on /var/data/officerflow.db
 */
require("../config");
const { closeDb } = require("../db");
const { applyAdminPasswordReset, isRailwayProductionDb } = require("../lib/adminPasswordReset");

try {
  if (!process.env.RESET_ADMIN_PASSWORD) {
    throw new Error("Set RESET_ADMIN_PASSWORD to the new admin password (min 8 characters).");
  }
  if (!isRailwayProductionDb()) {
    throw new Error(
      "Refusing to run. This script only updates Railway production SQLite at /var/data/officerflow.db. Local data was not changed."
    );
  }
  const result = applyAdminPasswordReset();
  if (result.reason === "already-current") {
    console.log("Admin password already matches RESET_ADMIN_PASSWORD. No rows were changed.");
  } else if (!result.applied) {
    throw new Error("Admin password was not updated. No other records were changed.");
  }
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
