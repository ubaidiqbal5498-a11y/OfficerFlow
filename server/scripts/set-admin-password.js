require("../config");
const { getDb, closeDb } = require("../db");
const { hashPassword } = require("../lib/auth");

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    if (!stdin.isTTY || !stdout.isTTY) {
      reject(new Error("Run this command in a local terminal so the password is not typed in chat or logs."));
      return;
    }
    stdout.write(prompt);
    stdin.resume();
    stdin.setRawMode?.(true);
    stdin.setEncoding("utf8");
    let value = "";
    function onData(chunk) {
      const ch = String(chunk);
      if (ch === "\u0003") {
        cleanup();
        stdout.write("\n");
        reject(new Error("Cancelled."));
        return;
      }
      if (ch === "\r" || ch === "\n" || ch === "\u0004") {
        cleanup();
        stdout.write("\n");
        resolve(value);
        return;
      }
      if (ch === "\u0008" || ch === "\u007f") {
        value = value.slice(0, -1);
        return;
      }
      if (ch.length === 1 && ch >= " ") value += ch;
    }
    function cleanup() {
      stdin.setRawMode?.(false);
      stdin.removeListener("data", onData);
      stdin.pause();
    }
    stdin.on("data", onData);
  });
}

async function main() {
  const db = getDb();
  const existing = db.prepare("SELECT id, username, role FROM users WHERE username = 'admin'").get();
  console.log(existing ? "Updating password for existing Admin account: admin" : "Creating Admin account: admin");
  const password = await readHidden("New admin password (min 8 characters): ");
  const confirm = await readHidden("Confirm new admin password: ");
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  if (password !== confirm) {
    throw new Error("Passwords do not match.");
  }
  const hash = hashPassword(password);
  if (existing) {
    db.prepare("UPDATE users SET password_hash = ?, active = 1, role = 'admin', updated_at = datetime('now','localtime') WHERE id = ?").run(hash, existing.id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(existing.id);
  } else {
    db.prepare(
      "INSERT INTO users (username, password_hash, role, display_name, active) VALUES ('admin', ?, 'admin', 'Admin', 1)"
    ).run(hash);
  }
  console.log("Admin password saved. Sign in with username: admin");
}

main()
  .catch((err) => {
    console.error(err.message || "Could not update admin password.");
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      closeDb();
    } catch {
      /* ignore */
    }
  });
