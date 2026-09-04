import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck, FileBarChart, UserPlus, Wallet } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { api } from "../api";
import { todayISO, formatDuration, formatMoney } from "../lib/format.js";
import { Badge, EmptyState } from "../components/Ui.jsx";
import { useAuth } from "../auth.jsx";

const DASHBOARD_ERROR = "Unable to load dashboard data. Please try again.";

const EMPTY_TODAY = {
  active: 0, present: 0, absent: 0, leave: 0, half_day: 0, off: 0, holiday: 0, late: 0, unmarked: 0, currently_working: 0,
};
const EMPTY_MONTHLY = {
  attendance_percentage: 0, working_hours: 0, overtime: 0, salary_paid: 0, salary_pending: 0, salary_total: 0, estimated_salary: 0,
};

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const { isAdmin } = useAuth();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.dashboard(date);
      setData(result && typeof result === "object" ? result : null);
    } catch {
      setData(null);
      setError(DASHBOARD_ERROR);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const t = { ...EMPTY_TODAY, ...(data?.todayStats || {}) };
  const m = { ...EMPTY_MONTHLY, ...(data?.monthly || {}) };
  const trend = Array.isArray(data?.trend) ? data.trend : [];
  const roster = Array.isArray(data?.today_roster) ? data.today_roster : [];
  const recent = Array.isArray(data?.recent_activity) ? data.recent_activity : [];
  const officerHours = Array.isArray(data?.officer_hours) ? data.officer_hours : [];
  const totalOfficers = num(data?.total_officers ?? t.active);
  const estimatedSalary = num(data?.estimated_salary ?? m.estimated_salary);
  const todayHours = num(data?.today_hours);
  const todayOvertime = num(data?.today_overtime);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Dashboard</h2>
          <p>Attendance, hours, overtime, and salary at a glance.</p>
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="quick-actions">
        {isAdmin ? <Link to="/officers/new" className="quick-action"><UserPlus size={18} /> Add Officer</Link> : null}
        <Link to="/attendance" className="quick-action"><ClipboardCheck size={18} /> Mark Attendance</Link>
        <Link to="/reports" className="quick-action"><FileBarChart size={18} /> View Reports</Link>
        <Link to="/salary" className="quick-action"><Wallet size={18} /> {isAdmin ? "Process Salary" : "View Salary"}</Link>
      </div>

      {error ? (
        <div className="card card-pad">
          <p className="error">{error}</p>
          <button type="button" className="btn btn-primary" onClick={load}>Try again</button>
        </div>
      ) : null}

      {loading ? <p className="muted">Loading dashboard…</p> : null}

      {!loading && !error ? (
        <>
          <div className="grid-stats">
            <div className="stat navy"><span>Total Officers</span><strong>{totalOfficers}</strong></div>
            <div className="stat green"><span>Present Today</span><strong>{num(t.present)}</strong></div>
            <div className="stat red"><span>Absent Today</span><strong>{num(t.absent)}</strong></div>
            <div className="stat purple"><span>On Leave</span><strong>{num(t.leave)}</strong></div>
            <div className="stat amber"><span>Late Arrivals</span><strong>{num(t.late)}</strong></div>
            <div className="stat blue"><span>Currently Working</span><strong>{num(t.currently_working)}</strong></div>
            <div className="stat blue"><span>Total Working Hours</span><strong>{formatDuration(m.working_hours)}</strong></div>
            <div className="stat blue"><span>Total Overtime</span><strong>{formatDuration(m.overtime)}</strong></div>
            <div className="stat green"><span>Estimated Salary</span><strong>{formatMoney(estimatedSalary)}</strong></div>
            <div className="stat green"><span>Attendance %</span><strong>{num(m.attendance_percentage)}%</strong></div>
          </div>
          {num(t.unmarked) ? (
            <p className="error">{num(t.unmarked)} active officer(s) still unmarked for this date. <Link to="/attendance">Enter attendance</Link></p>
          ) : null}

          <div className="dash-grid">
            <div className="card table-wrap">
              <div className="card-pad section-head">
                <strong>Today’s attendance</strong>
                <span className="muted">{date} · {formatDuration(todayHours)} hours · {formatDuration(todayOvertime)} OT</span>
              </div>
              {roster.length === 0 ? (
                <EmptyState title="No officers on roster" text="Active officers with a joining date on or before this day will appear here." />
              ) : (
                <table>
                  <thead>
                    <tr><th>Officer</th><th>Status</th><th>Check-in</th><th>Check-out</th><th>Hours</th></tr>
                  </thead>
                  <tbody>
                    {roster.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link to={`/officers/${row.id}`}><strong>{row.name}</strong></Link>
                          <div className="muted small">{row.officer_code}</div>
                        </td>
                        <td>{row.status ? <Badge status={row.status} /> : <span className="muted">Unmarked</span>}</td>
                        <td>{row.check_in || "—"}</td>
                        <td>{row.check_out || "—"}</td>
                        <td>{row.working_hours != null ? formatDuration(row.working_hours) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card table-wrap">
              <div className="card-pad section-head"><strong>Recent attendance activity</strong></div>
              {recent.length === 0 ? (
                <EmptyState title="No attendance yet" text="Saved check-in and check-out records will show here." />
              ) : (
                <table>
                  <thead>
                    <tr><th>Date</th><th>Officer</th><th>Status</th><th>Hours</th><th>OT</th></tr>
                  </thead>
                  <tbody>
                    {recent.map((row) => (
                      <tr key={row.id}>
                        <td>{row.work_date}</td>
                        <td>{row.officer_name}<div className="muted small">{row.officer_code}</div></td>
                        <td><Badge status={row.status} /></td>
                        <td>{formatDuration(row.working_hours)}</td>
                        <td>{formatDuration(row.overtime_hours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="dash-grid">
            <div className="card table-wrap">
              <div className="card-pad section-head"><strong>Officer-wise working hours</strong></div>
              {officerHours.length === 0 ? (
                <EmptyState title="No hour totals" text="Hours appear after attendance is saved this month." />
              ) : (
                <table>
                  <thead><tr><th>Officer</th><th>Hours</th><th>Overtime</th></tr></thead>
                  <tbody>
                    {officerHours.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link to={`/officers/${row.id}`}><strong>{row.name}</strong></Link>
                          <div className="muted small">{row.officer_code}</div>
                        </td>
                        <td>{formatDuration(row.hours)}</td>
                        <td>{formatDuration(row.overtime)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card card-pad">
              <div className="section-head"><strong>Overtime summary</strong></div>
              <div className="kv"><span>This month</span><strong>{formatDuration(m.overtime)}</strong></div>
              <div className="kv"><span>Today</span><strong>{formatDuration(todayOvertime)}</strong></div>
              <div className="kv"><span>Half day</span><strong>{num(t.half_day)}</strong></div>
              <div className="kv"><span>Off / holiday</span><strong>{num(t.off) + num(t.holiday)}</strong></div>
              <hr className="soft-rule" />
              <div className="section-head"><strong>Salary summary</strong></div>
              <div className="kv"><span>Estimated / current</span><strong>{formatMoney(estimatedSalary)}</strong></div>
              <div className="kv"><span>This month (records)</span><strong>{formatMoney(m.salary_total)}</strong></div>
              <div className="kv"><span>Paid</span><strong>{formatMoney(m.salary_paid)}</strong></div>
              <div className="kv"><span>Pending</span><strong>{formatMoney(m.salary_pending)}</strong></div>
            </div>
          </div>

          <div className="card chart-card">
            <strong>Monthly attendance overview</strong>
            {trend.length === 0 ? (
              <p className="muted" style={{ marginTop: 16 }}>No attendance records for this month yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="90%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="present" stroke="#0f8a5f" strokeWidth={2} />
                  <Line type="monotone" dataKey="absent" stroke="#c0362c" strokeWidth={2} />
                  <Line type="monotone" dataKey="leave_count" name="leave" stroke="#6d4ad4" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      ) : null}
    </>
  );
}
