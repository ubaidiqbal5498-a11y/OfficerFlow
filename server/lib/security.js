const { CORS_ORIGINS, isProd, NODE_ENV } = require("../config");

const DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

function allowedOrigins() {
  if (CORS_ORIGINS.length) return CORS_ORIGINS;
  if (!isProd) return DEV_ORIGINS;
  return [];
}

function applySecurity(app) {
  app.disable("x-powered-by");
  // Railway sits behind more than one proxy. Using 1 can make every visitor
  // share the same IP, which then trips the login rate limiter for everyone.
  app.set("trust proxy", require("../config").TRUST_PROXY ? (isProd ? 2 : 1) : false);

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    if (isProd) {
      res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "img-src 'self' data: blob:",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "script-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; ")
    );
    next();
  });

  const origins = allowedOrigins();
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!origin) return next();
    const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "http")
      .split(",")[0]
      .trim();
    const selfHttp = `http://${req.headers.host}`;
    const selfHttps = `https://${req.headers.host}`;
    const self = `${proto}://${req.headers.host}`;
    const allowed = new Set([...origins, self, selfHttp, selfHttps]);
    if (allowed.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
      if (req.method === "OPTIONS") return res.status(204).end();
    }
    next();
  });
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge != null) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  parts.push(`Path=${options.path || "/"}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  return parts.join("; ");
}

function clientIp(req) {
  if (req.ip) return String(req.ip);
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

module.exports = {
  applySecurity,
  parseCookies,
  serializeCookie,
  allowedOrigins,
  clientIp,
  NODE_ENV,
};
