const {
  ACCOUNT_PAYMENT_METHODS,
  LEGACY_PAYMENT_METHODS,
  SALARY_PAYOUT_METHODS,
  PAKISTANI_BANKS,
  normalizePaymentMethod,
} = require("./paymentAccount");

const EMPLOYMENT_STATUSES = ["active", "inactive", "resigned", "terminated"];

const PAYMENT_METHODS = [
  ...ACCOUNT_PAYMENT_METHODS,
  ...LEGACY_PAYMENT_METHODS,
  { id: "bank_transfer", label: "Bank Account" },
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
  const method = normalizePaymentMethod(id);
  return PAYMENT_METHODS.find((m) => m.id === method || m.id === id)?.label || method || id || "—";
}

module.exports = {
  EMPLOYMENT_STATUSES,
  PAYMENT_METHODS,
  ACCOUNT_PAYMENT_METHODS,
  LEGACY_PAYMENT_METHODS,
  SALARY_PAYOUT_METHODS,
  PAKISTANI_BANKS,
  SALARY_STATUSES,
  DOCUMENT_TYPES,
  isActiveEmployment,
  nextEmployeeCode,
  paymentMethodLabel,
};
