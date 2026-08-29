import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck, FileBarChart, UserPlus, Wallet } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { api } from "../api";
import { todayISO, formatDuration, formatMoney } from "../lib/format.js";
import { useAuth } from "../auth.jsx";

const DASHBOARD_ERROR = "Unable to load dashboard data. Please try again.";

const EMPTY_TODAY = {
  active: 0, present: 0, absent: 0, leave: 0, half_day: 0, off: 0, late: 0, unmarked: 0, currently_working: 0,
};
const EMPTY_MONTHLY = {
  attendance_percentage: 0, working_hours: 0, overtime: 0, salary_paid: 0, salary_pending: 0,
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

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Dashboard</h2>
          <p>Live attendance and this month’s payroll snapshot.</p>
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

      {loading ? <p>Loading dashboard…</p> : null}

      {!loading && !error ? (
        <>
          <h3 style={{ margin: "0 0 10px" }}>Today</h3>
          <div className="grid-stats">
            <div className="stat navy"><span>Total active officers</span><strong>{num(t.active)}</strong></div>
            <div className="stat green"><span>Present</span><strong>{num(t.present)}</strong></div>
            <div className="stat red"><span>Absent</span><strong>{num(t.absent)}</strong></div>
            <div className="stat amber"><span>Half day</span><strong>{num(t.half_day)}</strong></div>
            <div className="stat purple"><span>Leave</span><strong>{num(t.leave)}</strong></div>
            <div className="stat navy"><span>Off</span><strong>{num(t.off)}</strong></div>
            <div className="stat amber"><span>Late</span><strong>{num(t.late)}</strong></div>
            <div className="stat blue"><span>Currently working</span><strong>{num(t.currently_working)}</strong></div>
          </div>
          {num(t.unmarked) ? (
            <p className="error">{num(t.unmarked)} active officer(s) still unmarked for this date. <Link to="/attendance">Enter attendance</Link></p>
          ) : null}

          <h3 style={{ margin: "18px 0 10px" }}>This month</h3>
          <div className="grid-stats">
            <div className="stat green"><span>Attendance %</span><strong>{num(m.attendance_percentage)}%</strong></div>
            <div className="stat blue"><span>Total working hours</span><strong>{formatDuration(m.working_hours)}</strong></div>
            <div className="stat blue"><span>Total overtime</span><strong>{formatDuration(m.overtime)}</strong></div>
            <div className="stat green"><span>Salary paid</span><strong>{formatMoney(m.salary_paid)}</strong></div>
            <div className="stat amber"><span>Salary pending</span><strong>{formatMoney(m.salary_pending)}</strong></div>
          </div>

          <div className="card chart-card">
            <strong>Daily present / absent / leave</strong>
            {trend.length === 0 ? (
              <p style={{ color: "#5c6b80", marginTop: 16 }}>No attendance records for this month yet.</p>
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
