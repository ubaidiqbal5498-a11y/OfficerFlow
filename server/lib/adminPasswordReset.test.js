const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isRailwayProductionDb, applyAdminPasswordReset } = require("./adminPasswordReset");

test("reset only targets the Railway SQLite path", () => {
  assert.equal(isRailwayProductionDb("/var/data", "/var/data/officerflow.db"), true);
  assert.equal(isRailwayProductionDb("./data", "./data/officerflow.db"), false);
});

test("startup reset does not change a local database", () => {
  const previous = process.env.RESET_ADMIN_PASSWORD;
  process.env.RESET_ADMIN_PASSWORD = "ThisIsATestPassword1";
  const result = applyAdminPasswordReset();
  assert.equal(result.applied, false);
  assert.equal(result.reason, "not-production-db");
  if (previous == null) delete process.env.RESET_ADMIN_PASSWORD;
  else process.env.RESET_ADMIN_PASSWORD = previous;
});
