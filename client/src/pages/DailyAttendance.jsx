import { useEffect, useMemo, useState } from "react";
import { api, officerLabel } from "../api";
import { useToast } from "../components/Toast.jsx";
import { Field, SearchSelect } from "../components/Ui.jsx";
import { formatDuration, todayISO } from "../lib/format.js";
import { previewAttendance } from "../lib/attendanceMetrics.js";

const STATUSES = [
  ["present", "Present"],
  ["absent", "Absent"],
  ["half_day", "Half Day"],
  ["leave", "Leave"],
  ["off", "Off"],
  ["holiday", "Holiday"],
];

function emptyRow(officer, date) {
  return {
    officer_id: officer.id,
    shift_id: officer.shift_id || "",
    status: "",
    check_in: officer.shift_start || "09:00",
    check_out: officer.shift_end || "17:00",
    remarks: "",
  };
}

export default function DailyAttendance() {
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState([]);
  const [lookups, setLookups] = useState({ shifts: [] });
  const [saving, setSaving] = useState(false);
  const [focusId, setFocusId] = useState("");
  const toast = useToast();

  async function load(selected = date) {
    const [daily, lu] = await Promise.all([api.daily(selected), api.lookups()]);
    setLookups(lu);
    setRows(
      daily.rows.map(({ officer, attendance }) => ({
        officer,
        ...emptyRow(officer, selected),
        ...(attendance
          ? {
              shift_id: attendance.shift_id || officer.shift_id || "",
              status: attendance.status,
              check_in: attendance.check_in || officer.shift_start || "09:00",
              check_out: attendance.check_out || officer.shift_end || "17:00",
              remarks: attendance.remarks || "",
              working_hours: attendance.working_hours,
              is_late: attendance.is_late,
              overtime_hours: attendance.overtime_hours,
            }
          : {}),
      }))
    );
  }

  useEffect(() => {
    load(date).catch((e) => toast(e.message, "error"));
  }, [date]);

  function update(index, field, value) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function markAll(status) {
    setRows((current) => current.map((row) => ({ ...row, status })));
  }

  const summary = useMemo(() => {
    const counts = { present: 0, absent: 0, half_day: 0, leave: 0, off: 0, holiday: 0 };
    for (const row of rows) if (row.status) counts[row.status] += 1;
    return counts;
  }, [rows]);

  const officers = rows.map((row) => row.officer);
  const visibleRows = focusId ? rows.filter((row) => String(row.officer.id) === String(focusId)) : rows;

  function selectById(officerId) {
    setFocusId(officerId ? String(officerId) : "");
  }

  async function save() {
    setSaving(true);
    try {
      const payload = rows
        .filter((row) => row.status)
        .map((row) => ({
          officer_id: row.officer_id,
          shift_id: row.shift_id || null,
          status: row.status,
          check_in: ["present", "half_day"].includes(row.status) ? row.check_in : null,
          check_out: ["present", "half_day"].includes(row.status) ? row.check_out : null,
          remarks: row.remarks,
        }));
      if (!payload.length) {
        toast("Mark at least one officer before saving.", "error");
        return;
      }
      const result = await api.saveBulk({ date, rows: payload });
      toast(`Saved attendance for ${result.saved} officer(s).`);
      await load(date);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Daily Attendance</h2>
          <p>Enter check-in and check-out only. Working hours and overtime after 5:00 PM are calculated automatically.</p>
        </div>
        <button className="btn btn-primary" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save attendance"}
        </button>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="filters">
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setFocusId(""); }} />
          </Field>
          <SearchSelect
            label="Employee ID"
            options={officers}
            value={focusId}
            onChange={selectById}
            getValue={(o) => o.id}
            getLabel={(o) => o.officer_code}
            placeholder="All IDs"
          />
          <SearchSelect
            label="Officer name"
            options={officers}
            value={focusId}
            onChange={selectById}
            getValue={(o) => o.id}
            getLabel={(o) => o.name}
            placeholder="All names"
          />
          {focusId ? <button className="btn btn-ghost" onClick={() => setFocusId("")}>Show all</button> : null}
          <button className="btn btn-ghost" onClick={() => markAll("present")}>All present</button>
          <button className="btn btn-ghost" onClick={() => markAll("off")}>All off</button>
          <button className="btn btn-ghost" onClick={() => markAll("holiday")}>All holiday</button>
        </div>
        <div className="grid-stats" style={{ marginTop: 16, marginBottom: 0 }}>
          <div className="stat green"><span>Present</span><strong>{summary.present}</strong></div>
          <div className="stat red"><span>Absent</span><strong>{summary.absent}</strong></div>
          <div className="stat amber"><span>Half day</span><strong>{summary.half_day}</strong></div>
          <div className="stat purple"><span>Leave</span><strong>{summary.leave}</strong></div>
          <div className="stat navy"><span>Off</span><strong>{summary.off}</strong></div>
        </div>
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Officer</th>
              <th>Shift</th>
              <th>Status</th>
              <th>Check-in</th>
              <th>Check-out</th>
              <th>Working Hours</th>
              <th>Overtime</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan="8">No active officers for this date. Inactive, resigned or terminated officers stay in history only.</td></tr>
            ) : visibleRows.map((row) => {
              const index = rows.findIndex((r) => r.officer.id === row.officer.id);
              const metrics = previewAttendance(row, lookups.shifts);
              return (
              <tr key={row.officer.id} className="attendance-row">
                <td>
                  <strong>{officerLabel(row.officer)}</strong>
                  <div style={{ fontSize: 12, color: "#5c6b80" }}>{row.officer.designation || "No designation"}</div>
                </td>
                <td>
                  <select value={row.shift_id} onChange={(e) => update(index, "shift_id", e.target.value)}>
                    <option value="">Default</option>
                    {lookups.shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </td>
                <td>
                  <div className="status-pills">
                    {STATUSES.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={row.status === value ? `on-${value}` : ""}
                        onClick={() => update(index, "status", value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </td>
                <td>
                  <input
                    type="time"
                    disabled={!["present", "half_day"].includes(row.status)}
                    value={row.check_in}
                    onChange={(e) => update(index, "check_in", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    disabled={!["present", "half_day"].includes(row.status)}
                    value={row.check_out}
                    onChange={(e) => update(index, "check_out", e.target.value)}
                  />
                </td>
                <td>
                  {metrics ? (
                    <>
                      {formatDuration(metrics.workingHours)}
                      {metrics.isLate ? " · Late" : row.status === "present" ? " · On time" : ""}
                    </>
                  ) : "—"}
                </td>
                <td>{metrics && row.status === "present" ? formatDuration(metrics.overtimeHours) : "—"}</td>
                <td>
                  <input value={row.remarks} onChange={(e) => update(index, "remarks", e.target.value)} />
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
