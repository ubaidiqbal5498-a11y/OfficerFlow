const { EMPLOYMENT_STATUSES, PAYMENT_METHODS, SALARY_STATUSES } = require("./hr");

function required(value, label) {
  if (value == null || String(value).trim() === "") {
    return `${label} is required.`;
  }
  return null;
}

function nonNegative(value, label) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return `${label} cannot be negative.`;
  return null;
}

function validateOfficer(body, { isUpdate = false } = {}) {
  const errors = [];
  const nameErr = required(body.name, "Full name");
  if (nameErr) errors.push(nameErr);
  if (!isUpdate || body.officer_code != null) {
    const codeErr = required(body.officer_code, "Employee ID");
    if (codeErr) errors.push(codeErr);
  }
  if (!isUpdate || body.joining_date != null) {
    const joinErr = required(body.joining_date, "Joining date");
    if (joinErr) errors.push(joinErr);
  }
  if (!isUpdate) {
    const desErr = required(body.designation, "Designation");
    if (desErr) errors.push(desErr);
    const shiftErr = required(body.shift_id, "Shift");
    if (shiftErr) errors.push(shiftErr);
    const salReq = required(body.salary, "Salary");
    if (salReq) errors.push(salReq);
    const stErr = required(body.status, "Employment status");
    if (stErr) errors.push(stErr);
  }
  const salErr = nonNegative(body.salary, "Salary");
  if (salErr) errors.push(salErr);
  if (body.salary_type && !["monthly", "daily"].includes(body.salary_type)) {
    errors.push("Salary type must be Monthly or Daily.");
  }
  if (body.status && !EMPLOYMENT_STATUSES.includes(body.status)) {
    errors.push("Employment status is invalid.");
  }
  if (body.status && body.status !== "active" && !body.leaving_date && !isUpdate) {
    errors.push("Leaving date is required when the officer is not active.");
  }
  if (body.payment_method && !PAYMENT_METHODS.some((m) => m.id === body.payment_method)) {
    errors.push("Payment method is invalid.");
  }
  if (body.salary_status && !SALARY_STATUSES.some((s) => s.id === body.salary_status)) {
    errors.push("Salary status is invalid.");
  }
  if (body.email && String(body.email).trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email).trim())) {
    errors.push("Email address is not valid.");
  }
  return errors;
}

const ATTENDANCE_STATUSES = ["present", "absent", "half_day", "leave", "off", "holiday"];

module.exports = { required, nonNegative, validateOfficer, ATTENDANCE_STATUSES };
