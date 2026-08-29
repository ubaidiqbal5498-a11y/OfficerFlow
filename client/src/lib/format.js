export function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export function formatDate(value) {
  if (!value) return "—";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  if (!y || !m || !d) return value;
  return `${d}-${m}-${y}`;
}

export function formatMoney(value) {
  const n = Number(value || 0);
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function formatDuration(hours) {
  const n = Number(hours);
  if (!Number.isFinite(n) || n <= 0) return "0:00";
  const total = Math.round(n * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function statusLabel(status) {
  return {
    present: "Present",
    absent: "Absent",
    half_day: "Half Day",
    leave: "Leave",
    off: "Off",
    holiday: "Holiday",
    active: "Active",
    inactive: "Inactive",
    resigned: "Resigned",
    terminated: "Terminated",
    officer_created: "Officer created",
    officer_edited: "Officer edited",
    salary_changed: "Salary changed",
    attendance_created: "Attendance created",
    attendance_edited: "Attendance edited",
    salary_payment_recorded: "Salary payment recorded",
    officer_deactivated: "Officer deactivated",
    user_login: "Signed in",
    user_logout: "Signed out",
    user_created: "User created",
    user_updated: "User updated",
    user_deleted: "User deleted",
    user_permission_changed: "User permission changed",
    password_changed: "Password changed",
    join: "Joined",
    leave: "Left",
    rejoin: "Rejoined",
    salary_change: "Salary change",
  }[status] || String(status || "—").replaceAll("_", " ");
}

export function weekday(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "—";
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short" });
}

export function formatDateTime(value) {
  if (!value) return "—";
  const text = String(value);
  if (text.length >= 16) return `${formatDate(text.slice(0, 10))} ${text.slice(11, 16)}`;
  return formatDate(text);
}

export function lateLabel(record) {
  if (!record) return "—";
  if (record.status !== "present") return "—";
  return record.is_late ? `Late (${record.late_minutes}m)` : "On Time";
}

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
