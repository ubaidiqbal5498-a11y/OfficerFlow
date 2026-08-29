import { useEffect, useState } from "react";
import { api, downloadUrl, restoreBackup } from "../api";
import { useToast } from "../components/Toast.jsx";
import { Field, PasswordField } from "../components/Ui.jsx";
import { useAuth } from "../auth.jsx";
import UsersPage from "./Users.jsx";
import { formatDateTime, statusLabel } from "../lib/format.js";

function auditDetails(raw) {
  if (!raw) return "—";
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== "object") return String(raw);
    const copy = { ...obj };
    delete copy.password;
    delete copy.password_hash;
    delete copy.current_password;
    delete copy.new_password;
    delete copy.confirm_password;
    const parts = Object.entries(copy).filter(([, value]) => value != null && value !== "");
    return parts.length ? parts.map(([key, value]) => `${key}: ${value}`).join(", ") : "—";
  } catch {
    return String(raw);
  }
}

export default function SettingsPage() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({});
  const [dept, setDept] = useState("");
  const [shift, setShift] = useState({ name: "", start_time: "09:00", end_time: "17:00", is_night: false });
  const [holiday, setHoliday] = useState({ holiday_date: "", name: "" });
  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [savingPw, setSavingPw] = useState(false);
  const [audit, setAudit] = useState([]);
  const toast = useToast();
  const { user } = useAuth();

  async function load() {
    const [res, log] = await Promise.all([api.settings(), api.audit()]);
    setData(res);
    setForm(res.settings);
    setAudit(log);
  }

  useEffect(() => {
    load().catch((e) => toast(e.message, "error"));
  }, []);

  useEffect(() => {
    if (!data) return;
    if (window.location.hash === "#user-management") {
      document.getElementById("user-management")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [data]);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function saveSettings(e) {
    e.preventDefault();
    try {
      await api.saveSettings(form);
      toast("Settings saved. Attendance calculations will use these values.");
      await load();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  if (!data) return <p>Loading settings…</p>;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Settings</h2>
          <p>Office hours, overtime, salary rules, holidays, user accounts, backup, and account security.</p>
        </div>
      </div>

      <form
        className="card card-pad"
        style={{ marginBottom: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setSavingPw(true);
          try {
            await api.changePassword(pw);
            toast("Password updated. Use it the next time you sign in.");
            setPw({ current_password: "", new_password: "", confirm_password: "" });
          } catch (err) {
            toast(err.message, "error");
          } finally {
            setSavingPw(false);
          }
        }}
      >
        <h3>Security / Account</h3>
        <p style={{ color: "#5c6b80", marginTop: 6 }}>
          Signed in as <strong>{user?.username}</strong>
          {user?.role === "admin" ? " (Admin)" : ""}. The new password is hashed before it is stored.
        </p>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <PasswordField
            label="Current password"
            autoComplete="current-password"
            required
            minLength={8}
            value={pw.current_password}
            onChange={(e) => setPw((p) => ({ ...p, current_password: e.target.value }))}
          />
          <PasswordField
            label="New password"
            autoComplete="new-password"
            required
            minLength={8}
            value={pw.new_password}
            onChange={(e) => setPw((p) => ({ ...p, new_password: e.target.value }))}
          />
          <PasswordField
            label="Confirm new password"
            autoComplete="new-password"
            required
            minLength={8}
            value={pw.confirm_password}
            onChange={(e) => setPw((p) => ({ ...p, confirm_password: e.target.value }))}
          />
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="btn btn-primary" type="submit" disabled={savingPw}>
            {savingPw ? "Saving…" : "Update password"}
          </button>
        </div>
      </form>

      <section id="user-management" style={{ marginBottom: 16 }}>
        <UsersPage embedded />
      </section>

      <form className="card card-pad" onSubmit={saveSettings} style={{ marginBottom: 16 }}>
        <h3>Attendance rules</h3>
        <div className="form-grid">
          <Field label="Office name">
            <input value={form.office_name || ""} onChange={(e) => set("office_name", e.target.value)} />
          </Field>
          <Field label="Office start time">
            <input type="time" value={form.office_start_time || "09:00"} onChange={(e) => set("office_start_time", e.target.value)} />
          </Field>
          <Field label="Normal working hours">
            <input type="number" min="1" value={form.normal_working_hours || "8"} onChange={(e) => set("normal_working_hours", e.target.value)} />
          </Field>
          <Field label="Day-shift overtime starts at">
            <input type="time" value={form.overtime_cutoff_time || "17:00"} onChange={(e) => set("overtime_cutoff_time", e.target.value)} />
          </Field>
          <Field label="Night-shift overtime after (hours)">
            <input type="number" min="0" value={form.overtime_after_hours || "10"} onChange={(e) => set("overtime_after_hours", e.target.value)} />
          </Field>
          <Field label="Late grace minutes">
            <input type="number" min="0" value={form.late_grace_minutes || "0"} onChange={(e) => set("late_grace_minutes", e.target.value)} />
          </Field>
          <Field label="Default shift">
            <select value={form.default_shift_id || ""} onChange={(e) => set("default_shift_id", e.target.value)}>
              {data.shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Working days per month (for daily rate)">
            <input type="number" min="1" value={form.working_days_per_month || "26"} onChange={(e) => set("working_days_per_month", e.target.value)} />
          </Field>
          <Field label="Auto-deduct absences">
            <select value={form.deduct_absent || "false"} onChange={(e) => set("deduct_absent", e.target.value)}>
              <option value="false">No (default)</option>
              <option value="true">Yes</option>
            </select>
          </Field>
          <Field label="Auto-deduct half days">
            <select value={form.deduct_half_day || "false"} onChange={(e) => set("deduct_half_day", e.target.value)}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </Field>
          <Field label="Pay overtime automatically">
            <select value={form.overtime_pay_enabled || "false"} onChange={(e) => set("overtime_pay_enabled", e.target.value)}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </Field>
          <Field label="Overtime rate per hour">
            <input type="number" min="0" value={form.overtime_rate_per_hour || "0"} onChange={(e) => set("overtime_rate_per_hour", e.target.value)} />
          </Field>
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="btn btn-primary" type="submit">Save settings</button>
        </div>
      </form>

      <div className="form-grid" style={{ marginBottom: 16 }}>
        <div className="card card-pad">
          <h3>Departments</h3>
          <form
            className="filters"
            onSubmit={async (e) => {
              e.preventDefault();
              await api.addDepartment(dept);
              setDept("");
              await load();
            }}
          >
            <input value={dept} onChange={(e) => setDept(e.target.value)} placeholder="New department" required />
            <button className="btn btn-primary">Add</button>
          </form>
          <ul>
            {data.departments.map((d) => (
              <li key={d.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                {d.name}
                <button className="btn btn-danger" onClick={async () => { await api.deleteDepartment(d.id); await load(); }}>Remove</button>
              </li>
            ))}
          </ul>
        </div>

        <div className="card card-pad">
          <h3>Shifts</h3>
          <form
            className="filters"
            onSubmit={async (e) => {
              e.preventDefault();
              await api.addShift(shift);
              setShift({ name: "", start_time: "09:00", end_time: "17:00", is_night: false });
              await load();
            }}
          >
            <input placeholder="Name" value={shift.name} onChange={(e) => setShift((s) => ({ ...s, name: e.target.value }))} required />
            <input type="time" value={shift.start_time} onChange={(e) => setShift((s) => ({ ...s, start_time: e.target.value }))} />
            <input type="time" value={shift.end_time} onChange={(e) => setShift((s) => ({ ...s, end_time: e.target.value }))} />
            <label className="field">
              Night
              <input type="checkbox" checked={shift.is_night} onChange={(e) => setShift((s) => ({ ...s, is_night: e.target.checked }))} />
            </label>
            <button className="btn btn-primary">Add</button>
          </form>
          <table>
            <tbody>
              {data.shifts.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.start_time}–{s.end_time}</td>
                  <td>{s.is_night ? "Night" : "Day"}</td>
                  <td>{s.is_night || s.overtime_mode === "after_hours" ? "After hours" : `From ${s.overtime_cutoff || "17:00"}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h3>Office holidays</h3>
        <form
          className="filters"
          onSubmit={async (e) => {
            e.preventDefault();
            await api.addHoliday(holiday);
            setHoliday({ holiday_date: "", name: "" });
            await load();
          }}
        >
          <Field label="Date"><input type="date" required value={holiday.holiday_date} onChange={(e) => setHoliday((h) => ({ ...h, holiday_date: e.target.value }))} /></Field>
          <Field label="Name"><input required value={holiday.name} onChange={(e) => setHoliday((h) => ({ ...h, name: e.target.value }))} /></Field>
          <button className="btn btn-primary">Add holiday</button>
        </form>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>Date</th><th>Name</th><th></th></tr></thead>
            <tbody>
              {data.holidays.length === 0 ? <tr><td colSpan="3">No holidays configured.</td></tr> : data.holidays.map((h) => (
                <tr key={h.id}>
                  <td>{h.holiday_date}</td>
                  <td>{h.name}</td>
                  <td><button className="btn btn-danger" onClick={async () => { await api.deleteHoliday(h.id); await load(); }}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card card-pad">
        <h3>Backup & export</h3>
        <div className="filters" style={{ marginTop: 10 }}>
          <button className="btn btn-primary" onClick={() => downloadUrl("/backup")}>Backup database</button>
          <button className="btn btn-ghost" onClick={() => downloadUrl("/export/officers")}>Export officers</button>
          <button className="btn btn-ghost" onClick={() => downloadUrl("/export/officers?format=csv")}>Officers CSV</button>
          <button className="btn btn-ghost" onClick={() => downloadUrl("/export/attendance")}>Export attendance</button>
          <label className="btn btn-ghost">
            Restore backup
            <input
              type="file"
              accept=".db"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  await restoreBackup(file);
                  toast("Database restored. Refreshing…");
                  window.location.reload();
                } catch (err) {
                  toast(err.message, "error");
                }
              }}
            />
          </label>
        </div>
        <p style={{ color: "#5c6b80", marginTop: 12 }}>
          Backup copies officers, attendance, salary, salary history, users, and settings into a private file on this server.
          It is downloaded only after you sign in as Admin. Restore replaces the current database with the uploaded backup file.
          Attendance statuses in use: Present, Absent, Half Day, Leave, Off, Holiday.
        </p>
      </div>

      <div className="card table-wrap">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <h3>Activity log</h3>
          <p style={{ color: "#5c6b80", margin: "6px 0 12px" }}>
            Login, attendance, salary, and user changes. Passwords are never stored here.
          </p>
        </div>
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Action</th>
              <th>Date/Time</th>
              <th>Record</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {audit.length === 0 ? (
              <tr><td colSpan="5">No activity recorded yet.</td></tr>
            ) : audit.slice(0, 80).map((row) => (
              <tr key={row.id}>
                <td>{row.actor || "—"}</td>
                <td>{statusLabel(row.action)}</td>
                <td>{formatDateTime(row.created_at)}</td>
                <td>{row.officer_code ? `${row.officer_code} ${row.officer_name || ""}`.trim() : "—"}</td>
                <td>{auditDetails(row.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
