const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  tooManyLogins,
  recordLoginFailure,
  clearLoginAttempts,
  cookieSecureFlag,
} = require("./auth");

beforeEach(() => {
  clearLoginAttempts("1.1.1.1", "admin");
  clearLoginAttempts("1.1.1.1", "boss");
  clearLoginAttempts("2.2.2.2", "admin");
});

test("rate limiter counts failed attempts only and allows 20 per IP+username", () => {
  const ip = "1.1.1.1";
  const username = "admin";
  assert.equal(tooManyLogins(ip, username), false);
  for (let i = 0; i < 20; i += 1) {
    recordLoginFailure(ip, username);
  }
  assert.equal(tooManyLogins(ip, username), true);
});

test("rate limiter is per IP + username", () => {
  for (let i = 0; i < 20; i += 1) {
    recordLoginFailure("1.1.1.1", "admin");
  }
  assert.equal(tooManyLogins("1.1.1.1", "admin"), true);
  assert.equal(tooManyLogins("1.1.1.1", "boss"), false);
  assert.equal(tooManyLogins("2.2.2.2", "admin"), false);
});

test("successful-login path would not record a failure (clear resets the bucket)", () => {
  recordLoginFailure("1.1.1.1", "admin");
  recordLoginFailure("1.1.1.1", "admin");
  clearLoginAttempts("1.1.1.1", "admin");
  assert.equal(tooManyLogins("1.1.1.1", "admin"), false);
});

test("session cookies are Secure on HTTPS and in production", () => {
  assert.equal(cookieSecureFlag({ isProd: true, cookieSecureEnv: "", https: true }), true);
  assert.equal(cookieSecureFlag({ isProd: true, cookieSecureEnv: "false", https: true }), true);
  assert.equal(cookieSecureFlag({ isProd: false, cookieSecureEnv: "", https: true }), true);
  assert.equal(cookieSecureFlag({ isProd: false, cookieSecureEnv: "false", https: false }), false);
});
