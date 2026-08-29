const fs = require("fs");
const path = require("path");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, "..", ".env"));

const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";
const PORT = Number(process.env.PORT) || 3847;
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data"));

function resolveDatabasePath() {
  const raw = String(process.env.DATABASE_URL || process.env.DATABASE_PATH || "").trim();
  if (/^postgres(ql)?:\/\//i.test(raw)) {
    throw new Error(
      "OfficerFlow uses SQLite on a persistent disk. Do not set a PostgreSQL DATABASE_URL. Set DATA_DIR or DATABASE_PATH instead."
    );
  }
  if (raw) return path.resolve(raw.replace(/^file:/i, ""));
  return path.resolve(path.join(DATA_DIR, "officerflow.db"));
}

const DATABASE_PATH = resolveDatabasePath();
const CORS_ORIGINS = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const SESSION_DAYS = Math.max(1, Number(process.env.SESSION_DAYS) || 7);
const COOKIE_NAME = process.env.COOKIE_NAME || "of_session";
const TRUST_PROXY = process.env.TRUST_PROXY !== "false";

if (isProd && !SESSION_SECRET) {
  throw new Error("SESSION_SECRET is required in production. Set it in the host environment or .env.");
}

module.exports = {
  NODE_ENV,
  isProd,
  PORT,
  HOST,
  DATA_DIR,
  DATABASE_PATH,
  CORS_ORIGINS,
  SESSION_SECRET,
  SESSION_DAYS,
  COOKIE_NAME,
  TRUST_PROXY,
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || "",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "",
  ADMIN_NAME: process.env.ADMIN_NAME || "Admin",
};
