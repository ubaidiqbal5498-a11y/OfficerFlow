const EMPLOYMENT_STATUSES = ["active", "inactive", "resigned", "terminated"];

const PAYMENT_METHODS = [
  { id: "cash", label: "Cash" },
  { id: "bank_transfer", label: "Bank Transfer" },
  { id: "easypaisa", label: "Easypaisa" },
  { id: "jazzcash", label: "JazzCash" },
  { id: "other", label: "Other" },
];

const SALARY_STATUSES = [
  { id: "active", label: "Active" },
  { id: "on_hold", label: "On Hold" },
];

const DOCUMENT_TYPES = [
  { id: "cnic_front", label: "CNIC Front" },
  { id: "cnic_back", label: "CNIC Back" },
  { id: "cv", label: "CV" },
  { id: "joining_letter", label: "Joining Letter" },
  { id: "contract", label: "Contract" },
  { id: "other", label: "Other Documents" },
];

function isActiveEmployment(status) {
  return status === "active";
}

function nextEmployeeCode(database) {
  const rows = database.prepare("SELECT officer_code FROM officers").all();
  let max = 0;
  for (const row of rows) {
    const match = String(row.officer_code || "").trim().match(/^EMP(\d+)$/i);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `EMP${String(max + 1).padStart(3, "0")}`;
}

function paymentMethodLabel(id) {
  return PAYMENT_METHODS.find((m) => m.id === id)?.label || id || "—";
}

module.exports = {
  EMPLOYMENT_STATUSES,
  PAYMENT_METHODS,
  SALARY_STATUSES,
  DOCUMENT_TYPES,
  isActiveEmployment,
  nextEmployeeCode,
  paymentMethodLabel,
};
