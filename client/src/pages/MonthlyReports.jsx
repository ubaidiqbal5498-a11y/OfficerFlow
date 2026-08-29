import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, downloadUrl } from "../api";
import { useToast } from "../components/Toast.jsx";
import { Field } from "../components/Ui.jsx";
import { MONTHS, formatDuration, todayISO } from "../lib/format.js";

export default function MonthlyReports() {
  const now = todayISO().split("-");
  const [year, setYear] = useState(now[0]);
  const [month, setMonth] = useState(String(Number(now[1])));
  const [officerId, setOfficerId] = useState("all");
  const [shiftId, setShiftId] = useState("");
  const [officers, setOfficers] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [rows, setRows] = useState([]);
  const toast = useToast();

  useEffect(() => {
    Promise.all([api.officers(), api.lookups()]).then(([list, lu]) => {
      setOfficers(list);
      setShifts(lu.shifts);
    });
  }, []);

  async function load() {
    const params = new URLSearchParams({ year, month });
    if (officerId && officerId !== "all") params.set("officer_id", officerId);
    if (shiftId) params.set("shift_id", shiftId);
    try {
      setRows(await api.monthly(params.toString()));
    } catch (e) {
      toast(e.message, "error");
    }
  }

  useEffect(() => {
    load();
  }, [year, month, officerId, shiftId]);

  function exportReport() {
    const params = new URLSearchParams({ year, month });
    if (officerId && officerId !== "all") params.set("officer_id", officerId);
    if (shiftId) params.set("shift_id", shiftId);
    downloadUrl(`/export/monthly?${params.toString()}`);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Monthly Reports</h2>
          <p>Working days, late, overtime and attendance percentage are calculated from saved attendance.</p>
        </div>
        <button className="btn btn-primary" onClick={exportReport}>Export Excel</button>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="filters">
          <Field label="Month">
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
            </select>
          </Field>
          <Field label="Year">
            <input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
          </Field>
          <Field label="Officer">
            <select value={officerId} onChange={(e) => setOfficerId(e.target.value)}>
              <option value="all">All officers</option>
              {officers.map((o) => <option key={o.id} value={o.id}>{o.officer_code} — {o.name}</option>)}
            </select>
          </Field>
          <Field label="Shift">
            <select value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
              <option value="">All shifts</option>
              {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </div>
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Officer</th>
              <th>Working days</th>
              <th>Present</th>
              <th>Absent</th>
              <th>Half day</th>
              <th>Leave</th>
              <th>Off</th>
              <th>Late</th>
              <th>Hours</th>
              <th>Overtime</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan="11">No officers found for this filter.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.officer.id}>
                <td>
                  <Link to={`/officers/${row.officer.id}`}><strong>{row.officer.name}</strong></Link>
                  <div style={{ fontSize: 12, color: "#5c6b80" }}>{row.officer.officer_code}</div>
                </td>
                <td>{row.working_days}</td>
                <td>{row.present}</td>
                <td>{row.absent}</td>
                <td>{row.half_day}</td>
                <td>{row.leave}</td>
                <td>{row.off}</td>
                <td>{row.late}</td>
                <td>{formatDuration(row.working_hours)}</td>
                <td>{formatDuration(row.overtime)}</td>
                <td><strong>{row.attendance_percentage}%</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
