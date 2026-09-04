import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, downloadUrl } from "../api";
import { useToast } from "../components/Toast.jsx";
import { Badge, EmptyState, Field } from "../components/Ui.jsx";
import { ATTENDANCE_STATUSES } from "../lib/constants.js";
import { MONTHS, formatDuration, formatMoney, todayISO } from "../lib/format.js";

export default function MonthlyReports() {
  const now = todayISO().split("-");
  const [year, setYear] = useState(now[0]);
  const [month, setMonth] = useState(String(Number(now[1])));
  const [date, setDate] = useState("");
  const [officerId, setOfficerId] = useState("all");
  const [shiftId, setShiftId] = useState("");
  const [status, setStatus] = useState("");
  const [officers, setOfficers] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [rows, setRows] = useState([]);
  const [records, setRecords] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    Promise.all([api.officers(), api.lookups()]).then(([list, lu]) => {
      setOfficers(list);
      setShifts(lu.shifts);
    });
  }, []);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ year, month });
    if (officerId && officerId !== "all") params.set("officer_id", officerId);
    if (shiftId) params.set("shift_id", shiftId);
    const attParams = new URLSearchParams();
    if (date) attParams.set("date", date);
    else {
      attParams.set("year", year);
      attParams.set("month", month);
    }
    if (officerId && officerId !== "all") attParams.set("officer_id", officerId);
    if (shiftId) attParams.set("shift_id", shiftId);
    if (status) attParams.set("status", status);
    const payParams = new URLSearchParams({ year, month });
    if (officerId && officerId !== "all") payParams.set("officer_id", officerId);
    try {
      const [monthly, attendance, salary] = await Promise.all([
        api.monthly(params.toString()),
        api.attendance(`?${attParams}`),
        api.payments(`?${payParams}`),
      ]);
      setRows(monthly);
      setRecords(attendance);
      setPayments(salary);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [year, month, date, officerId, shiftId, status]);

  function exportReport() {
    const params = new URLSearchParams({ year, month });
    if (officerId && officerId !== "all") params.set("officer_id", officerId);
    if (shiftId) params.set("shift_id", shiftId);
    downloadUrl(`/export/monthly?${params.toString()}`);
  }

  const hourTotals = useMemo(() => {
    return records.reduce(
      (acc, row) => {
        acc.hours += Number(row.working_hours) || 0;
        acc.overtime += Number(row.overtime_hours) || 0;
        acc[row.status] = (acc[row.status] || 0) + 1;
        return acc;
      },
      { hours: 0, overtime: 0 }
    );
  }, [records]);

  const salaryTotals = useMemo(() => {
    return payments.reduce(
      (acc, row) => {
        acc.net += Number(row.net_salary) || 0;
        acc.ot += Number(row.overtime_hours) || 0;
        return acc;
      },
      { net: 0, ot: 0 }
    );
  }, [payments]);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Monthly Reports</h2>
          <p>Filter by date, month, officer, or attendance status. Totals come from saved records only.</p>
        </div>
        <button className="btn btn-primary" onClick={exportReport}>Export Excel</button>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="filters">
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Month">
            <select value={month} onChange={(e) => setMonth(e.target.value)} disabled={Boolean(date)}>
              {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
            </select>
          </Field>
          <Field label="Year">
            <input type="number" value={year} onChange={(e) => setYear(e.target.value)} disabled={Boolean(date)} />
          </Field>
          <Field label="Officer">
            <select value={officerId} onChange={(e) => setOfficerId(e.target.value)}>
              <option value="all">All officers</option>
              {officers.map((o) => <option key={o.id} value={o.id}>{o.officer_code} — {o.name}</option>)}
            </select>
          </Field>
          <Field label="Attendance status">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {ATTENDANCE_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Shift">
            <select value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
              <option value="">All shifts</option>
              {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          {date ? <button className="btn btn-ghost" onClick={() => setDate("")}>Clear date</button> : null}
        </div>
      </div>

      <div className="grid-stats">
        <div className="stat green"><span>Attendance rows</span><strong>{records.length}</strong></div>
        <div className="stat blue"><span>Working hours</span><strong>{formatDuration(hourTotals.hours)}</strong></div>
        <div className="stat blue"><span>Overtime</span><strong>{formatDuration(hourTotals.overtime)}</strong></div>
        <div className="stat navy"><span>Salary (period)</span><strong>{formatMoney(salaryTotals.net)}</strong></div>
      </div>

      {loading ? <p className="muted">Loading reports…</p> : null}

      <div className="card table-wrap" style={{ marginBottom: 16 }}>
        <div className="card-pad"><strong>Monthly officer summary</strong></div>
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
              <tr><td colSpan="11"><EmptyState title="No officers found" text="Try another month or officer filter." /></td></tr>
            ) : rows.map((row) => (
              <tr key={row.officer.id}>
                <td>
                  <Link to={`/officers/${row.officer.id}`}><strong>{row.officer.name}</strong></Link>
                  <div className="muted small">{row.officer.officer_code}</div>
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

      <div className="card table-wrap">
        <div className="card-pad"><strong>Attendance records</strong></div>
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Officer</th><th>Status</th><th>Check-in</th><th>Check-out</th>
              <th>Hours</th><th>Overtime</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan="7"><EmptyState title="No attendance in this filter" text="Saved check-in and check-out records will appear here." /></td></tr>
            ) : records.map((row) => (
              <tr key={row.id}>
                <td>{row.work_date}</td>
                <td>{row.officer_name}<div className="muted small">{row.officer_code}</div></td>
                <td><Badge status={row.status} /></td>
                <td>{row.check_in || "—"}</td>
                <td>{row.check_out || "—"}</td>
                <td>{formatDuration(row.working_hours)}</td>
                <td>{formatDuration(row.overtime_hours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
