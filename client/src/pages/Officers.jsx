import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, officerLabel } from "../api";
import { useToast } from "../components/Toast.jsx";
import { Avatar, Badge, Confirm, EmptyState, Field } from "../components/Ui.jsx";
import { EMPLOYMENT_STATUSES } from "../lib/constants.js";
import { formatDate, formatMoney } from "../lib/format.js";
import { useAuth } from "../auth.jsx";

export default function Officers() {
  const [rows, setRows] = useState([]);
  const [lookups, setLookups] = useState({ departments: [], shifts: [] });
  const [filters, setFilters] = useState({ status: "", shift_id: "", department_id: "", designation: "", q: "" });
  const [sort, setSort] = useState({ key: "name", dir: "asc" });
  const [loading, setLoading] = useState(true);
  const [deactivate, setDeactivate] = useState(null);
  const toast = useToast();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  async function load() {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.shift_id) params.set("shift_id", filters.shift_id);
    if (filters.department_id) params.set("department_id", filters.department_id);
    if (filters.designation) params.set("designation", filters.designation);
    if (filters.q) params.set("q", filters.q);
    params.set("sort", sort.key);
    params.set("order", sort.dir);
    setRows(await api.officers(`?${params}`));
  }

  useEffect(() => {
    api.lookups().then(setLookups);
  }, []);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((e) => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [filters.status, filters.shift_id, filters.department_id, sort.key, sort.dir]);

  function toggleSort(key) {
    setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));
  }

  async function confirmDeactivate() {
    try {
      await api.deactivateOfficer(deactivate.id, { status: "inactive" });
      toast(`${deactivate.name} is now inactive. History was kept.`);
      setDeactivate(null);
      await load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  const th = (key, label) => (
    <th className="sortable" onClick={() => toggleSort(key)}>
      {label} {sort.key === key ? (sort.dir === "asc" ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Officers</h2>
          <p>Employee accounts, search, and status. Historical attendance stays after deactivation.</p>
        </div>
        {isAdmin ? <button className="btn btn-primary" onClick={() => navigate("/officers/new")}>Add officer</button> : null}
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="filters">
          <Field label="Search">
            <input
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="Employee ID, name, phone, CNIC"
            />
          </Field>
          <Field label="Status">
            <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="">All</option>
              {EMPLOYMENT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Department">
            <select value={filters.department_id} onChange={(e) => setFilters((f) => ({ ...f, department_id: e.target.value }))}>
              <option value="">All</option>
              {lookups.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Shift">
            <select value={filters.shift_id} onChange={(e) => setFilters((f) => ({ ...f, shift_id: e.target.value }))}>
              <option value="">All shifts</option>
              {lookups.shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Designation">
            <input
              value={filters.designation}
              onChange={(e) => setFilters((f) => ({ ...f, designation: e.target.value }))}
              placeholder="e.g. Duty Officer"
            />
          </Field>
          <button className="btn btn-ghost" onClick={load}>Apply</button>
        </div>
      </div>

      <div className="card table-wrap">
        {loading ? <p className="card-pad">Loading officers…</p> : (
          <table>
            <thead>
              <tr>
                {th("officer_code", "Employee ID")}
                <th>Profile</th>
                {th("name", "Name")}
                {th("designation", "Designation")}
                {th("department", "Department")}
                {th("shift", "Shift")}
                {th("joining_date", "Joining date")}
                {th("salary", "Salary")}
                {th("status", "Status")}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan="10">
                    <EmptyState title="No officers found" text="Add an officer or clear filters." />
                  </td>
                </tr>
              ) : rows.map((row) => (
                <tr key={row.id} className="clickable" onClick={() => navigate(`/officers/${row.id}`)}>
                  <td><strong>{row.officer_code}</strong></td>
                  <td><Avatar officer={row} size={36} /></td>
                  <td>
                    <strong>{row.name}</strong>
                    <div style={{ fontSize: 12, color: "#5c6b80" }}>{officerLabel(row)}</div>
                  </td>
                  <td>{row.designation || "—"}</td>
                  <td>{row.department_name || "—"}</td>
                  <td>{row.shift_name || "—"}</td>
                  <td>{formatDate(row.joining_date)}</td>
                  <td>{formatMoney(row.monthly_salary)}</td>
                  <td><Badge status={row.status} /></td>
                  <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-ghost" onClick={() => navigate(`/officers/${row.id}`)}>View</button>
                    {isAdmin ? <button className="btn btn-ghost" onClick={() => navigate(`/officers/${row.id}/edit`)}>Edit</button> : null}
                    {isAdmin && row.status === "active" ? (
                      <button className="btn btn-danger" onClick={() => setDeactivate(row)}>Deactivate</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {deactivate ? (
        <Confirm
          title="Deactivate officer?"
          message={`${deactivate.name} will leave Daily Attendance, but all attendance and salary history will remain.`}
          confirmLabel="Deactivate"
          danger
          onClose={() => setDeactivate(null)}
          onConfirm={confirmDeactivate}
        />
      ) : null}
    </>
  );
}
