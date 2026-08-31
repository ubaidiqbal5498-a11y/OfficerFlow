const API_BASE = String(import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
export const API = `${API_BASE}/api`;

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
    body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body,
  });
  if (res.status === 401 && !path.startsWith("/auth/")) {
    if (window.location.pathname !== "/login") window.location.assign("/login");
  }
  if (!res.ok) {
    let message = "Request failed.";
    try {
      const data = await res.json();
      message = data.error || message;
    } catch {
      message = res.statusText || message;
    }
    throw new Error(message);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function upload(path, form) {
  const res = await fetch(`${API}${path}`, { method: "POST", credentials: "include", body: form });
  if (res.status === 401 && window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
  if (!res.ok) {
    let message = "Upload failed.";
    try {
      const data = await res.json();
      message = data.error || message;
    } catch {
      message = res.statusText || message;
    }
    throw new Error(message);
  }
  return res.json();
}

export const api = {
  me: () => request("/auth/me"),
  login: (body) => request("/auth/login", { method: "POST", body }),
  logout: () => request("/auth/logout", { method: "POST", body: {} }),
  changePassword: (body) => request("/auth/password", { method: "POST", body }),
  users: () => request("/users"),
  createUser: (body) => request("/users", { method: "POST", body }),
  updateUser: (id, body) => request(`/users/${id}`, { method: "PUT", body }),
  deleteUser: (id) => request(`/users/${id}`, { method: "DELETE" }),
  lookups: () => request("/lookups"),
  search: (q) => request(`/search?q=${encodeURIComponent(q)}`),
  officers: (params = "") => request(`/officers${params}`),
  nextOfficerCode: () => request("/officers/next-code"),
  officer: (id) => request(`/officers/${id}`),
  createOfficer: (body) => request("/officers", { method: "POST", body }),
  updateOfficer: (id, body) => request(`/officers/${id}`, { method: "PUT", body }),
  updatePaymentAccount: (id, body) => request(`/officers/${id}/payment-account`, { method: "PUT", body }),
  deactivateOfficer: (id, body) => request(`/officers/${id}/deactivate`, { method: "POST", body }),
  profile: (id, params = "") => request(`/officers/${id}/profile${params}`),
  uploadPhoto: (id, file) => {
    const form = new FormData();
    form.append("photo", file);
    return upload(`/officers/${id}/photo`, form);
  },
  documents: (id) => request(`/officers/${id}/documents`),
  uploadDocument: (id, file, docType, notes = "") => {
    const form = new FormData();
    form.append("file", file);
    form.append("doc_type", docType);
    if (notes) form.append("notes", notes);
    return upload(`/officers/${id}/documents`, form);
  },
  deleteDocument: (id, docId) => request(`/officers/${id}/documents/${docId}`, { method: "DELETE" }),
  documentFileUrl: (id, docId) => `${API}/officers/${id}/documents/${docId}/file`,
  daily: (date) => request(`/attendance/daily?date=${date}`),
  attendance: (params = "") => request(`/attendance${params}`),
  saveAttendance: (body) => request("/attendance", { method: "POST", body }),
  saveBulk: (body) => request("/attendance/bulk", { method: "POST", body }),
  monthly: (params) => request(`/reports/monthly?${params}`),
  dashboard: (date) => request(`/dashboard${date ? `?date=${date}` : ""}`),
  settings: () => request("/settings"),
  saveSettings: (body) => request("/settings", { method: "PUT", body }),
  addDepartment: (name) => request("/departments", { method: "POST", body: { name } }),
  addShift: (body) => request("/shifts", { method: "POST", body }),
  updateShift: (id, body) => request(`/shifts/${id}`, { method: "PUT", body }),
  deleteShift: (id) => request(`/shifts/${id}`, { method: "DELETE" }),
  deleteDepartment: (id) => request(`/departments/${id}`, { method: "DELETE" }),
  addHoliday: (body) => request("/holidays", { method: "POST", body }),
  deleteHoliday: (id) => request(`/holidays/${id}`, { method: "DELETE" }),
  salaryHistory: (id) => request(`/salary/history/${id}`),
  addSalaryHistory: (body) => request("/salary/history", { method: "POST", body }),
  payments: (params = "") => request(`/salary/payments${params}`),
  calculate: (body) => request("/salary/calculate", { method: "POST", body }),
  calculateAll: (body) => request("/salary/calculate-all", { method: "POST", body }),
  savePayment: (body) => request("/salary/payments", { method: "POST", body }),
  updatePayment: (id, body) => request(`/salary/payments/${id}`, { method: "PUT", body }),
  backups: () => request("/backups"),
  audit: (officerId) => request(`/audit${officerId ? `?officer_id=${officerId}` : ""}`),
};

export function downloadUrl(path) {
  window.open(`${API}${path}`, "_blank");
}

export async function restoreBackup(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/restore`, { method: "POST", credentials: "include", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Restore failed.");
  return data;
}

export function officerLabel(officer) {
  if (!officer) return "";
  return `${officer.officer_code} — ${officer.name}`;
}
