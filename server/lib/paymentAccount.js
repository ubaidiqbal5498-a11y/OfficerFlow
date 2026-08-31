const PAKISTANI_BANKS = [
  "HBL",
  "Meezan Bank",
  "UBL",
  "MCB",
  "Bank Alfalah",
  "Allied Bank",
  "Askari Bank",
  "Faysal Bank",
  "Standard Chartered",
  "Bank Al Habib",
  "Habib Metropolitan Bank",
  "Soneri Bank",
  "JS Bank",
  "Dubai Islamic Bank",
  "BankIslami",
  "NBP",
  "Silkbank",
];

const ACCOUNT_PAYMENT_METHODS = [
  { id: "bank_account", label: "Bank Account" },
  { id: "easypaisa", label: "Easypaisa" },
  { id: "jazzcash", label: "JazzCash" },
];

const LEGACY_PAYMENT_METHODS = [
  { id: "cash", label: "Cash" },
  { id: "other", label: "Other" },
];

const PAYMENT_METHOD_ALIASES = {
  bank_transfer: "bank_account",
};

function trim(value) {
  if (value == null) return "";
  return String(value).trim();
}

function normalizePaymentMethod(id) {
  const raw = trim(id);
  if (!raw) return "";
  return PAYMENT_METHOD_ALIASES[raw] || raw;
}

function isBankMethod(id) {
  const method = normalizePaymentMethod(id);
  return method === "bank_account";
}

function isWalletMethod(id) {
  const method = normalizePaymentMethod(id);
  return method === "easypaisa" || method === "jazzcash";
}

function needsPaymentAccount(id) {
  return isBankMethod(id) || isWalletMethod(id);
}

function normalizeIban(value) {
  return trim(value).replace(/\s+/g, "").toUpperCase();
}

function normalizeMobile(value) {
  return trim(value).replace(/[\s-]/g, "");
}

function isValidIban(value) {
  const iban = normalizeIban(value);
  if (!iban) return true;
  if (/^PK\d{2}[A-Z]{4}\d{16}$/.test(iban)) return true;
  return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban) && iban.length >= 15 && iban.length <= 34;
}

function isValidWalletMobile(value) {
  const mobile = normalizeMobile(value);
  if (!mobile) return false;
  return /^(?:\+92|92|0)?3\d{9}$/.test(mobile);
}

function paymentAccountFromBody(body = {}) {
  return {
    payment_method: normalizePaymentMethod(body.payment_method),
    account_name: trim(body.account_name || body.account_title),
    bank_name: trim(body.bank_name),
    account_number: trim(body.account_number),
    iban: normalizeIban(body.iban),
    payment_mobile: normalizeMobile(body.payment_mobile || body.mobile_number),
  };
}

function validatePaymentAccount(body = {}) {
  const errors = [];
  const account = paymentAccountFromBody(body);
  const method = account.payment_method;
  if (!method) return errors;
  if (isBankMethod(method)) {
    if (!account.account_name) errors.push("Account title / account name is required.");
    if (!account.bank_name) errors.push("Bank name is required for bank accounts.");
    else if (![...PAKISTANI_BANKS, "Other"].includes(account.bank_name)) {
      errors.push("Choose a bank from the list.");
    }
    if (!account.account_number) errors.push("Account number is required for bank accounts.");
  } else if (isWalletMethod(method)) {
    if (!account.account_name) errors.push("Account name is required.");
    if (!account.payment_mobile) errors.push("Mobile number is required for Easypaisa and JazzCash.");
    else if (!isValidWalletMobile(account.payment_mobile)) {
      errors.push("Enter a valid Pakistani mobile number, for example 03XXXXXXXXX.");
    }
  }
  if (account.iban && !isValidIban(account.iban)) {
    errors.push("IBAN format is not valid. Pakistani IBANs look like PK36HABB0000001234567890.");
  }
  return errors;
}

function formatPaymentAccountSummary(row = {}) {
  const method = normalizePaymentMethod(row.payment_method);
  const name = trim(row.account_name);
  if (isBankMethod(method)) {
    const parts = ["Bank Account", trim(row.bank_name), name, trim(row.account_number)];
    if (trim(row.iban)) parts.push(trim(row.iban));
    return parts.filter(Boolean).join(" · ");
  }
  if (isWalletMethod(method)) {
    const label = method === "easypaisa" ? "Easypaisa" : "JazzCash";
    return [label, name, trim(row.payment_mobile)].filter(Boolean).join(" · ");
  }
  return trim(row.bank_details);
}

function composeBankDetails(row = {}, previous = "") {
  return formatPaymentAccountSummary(row) || trim(previous) || null;
}

module.exports = {
  PAKISTANI_BANKS,
  ACCOUNT_PAYMENT_METHODS,
  LEGACY_PAYMENT_METHODS,
  PAYMENT_METHOD_ALIASES,
  normalizePaymentMethod,
  isBankMethod,
  isWalletMethod,
  needsPaymentAccount,
  normalizeIban,
  normalizeMobile,
  isValidIban,
  isValidWalletMobile,
  paymentAccountFromBody,
  validatePaymentAccount,
  formatPaymentAccountSummary,
  composeBankDetails,
};
