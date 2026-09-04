const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const {
  PAKISTANI_BANKS,
  normalizePaymentMethod,
  isBankMethod,
  isWalletMethod,
  isNayaPayMethod,
  isValidIban,
  isValidWalletMobile,
  validatePaymentAccount,
  formatPaymentAccountSummary,
  paymentAccountFromBody,
} = require("./paymentAccount");

test("common Pakistani banks are listed", () => {
  for (const name of ["HBL", "Meezan Bank", "UBL", "NBP", "Silkbank", "Bank Al Habib"]) {
    assert.equal(PAKISTANI_BANKS.includes(name), true);
  }
});

test("bank_transfer is treated as Bank Account", () => {
  assert.equal(normalizePaymentMethod("bank_transfer"), "bank_account");
  assert.equal(isBankMethod("bank_transfer"), true);
  assert.equal(isWalletMethod("easypaisa"), true);
  assert.equal(isWalletMethod("jazzcash"), true);
  assert.equal(isBankMethod("cash"), false);
});

test("IBAN validation accepts Pakistani format and ignores spaces", () => {
  assert.equal(isValidIban(""), true);
  assert.equal(isValidIban("PK36 HABB 0000 0012 3456 7890"), true);
  assert.equal(isValidIban("PK36HABB0000001234567890"), true);
  assert.equal(isValidIban("not-an-iban"), false);
  assert.equal(isValidIban("PK12AB"), false);
});

test("wallet mobile numbers must be Pakistani 03 numbers", () => {
  assert.equal(isValidWalletMobile("03001234567"), true);
  assert.equal(isValidWalletMobile("0300-1234567"), true);
  assert.equal(isValidWalletMobile("+923001234567"), true);
  assert.equal(isValidWalletMobile("12345"), false);
});

test("bank accounts require title, bank and account number", () => {
  const errors = validatePaymentAccount({ payment_method: "bank_account" });
  assert.equal(errors.some((e) => /account title/i.test(e)), true);
  assert.equal(errors.some((e) => /bank name/i.test(e)), true);
  assert.equal(errors.some((e) => /account number/i.test(e)), true);
  const ok = validatePaymentAccount({
    payment_method: "bank_account",
    account_name: "Saad",
    bank_name: "HBL",
    account_number: "1234567890",
    iban: "PK36HABB0000001234567890",
  });
  assert.deepEqual(ok, []);
});

test("Easypaisa and JazzCash require account name and mobile", () => {
  const errors = validatePaymentAccount({ payment_method: "easypaisa", account_name: "Aliyan" });
  assert.equal(errors.some((e) => /mobile number/i.test(e)), true);
  const ok = validatePaymentAccount({
    payment_method: "jazzcash",
    account_title: "Bilawal",
    mobile_number: "03111234567",
  });
  assert.deepEqual(ok, []);
});

test("cash and empty methods do not require account fields", () => {
  assert.deepEqual(validatePaymentAccount({ payment_method: "cash" }), []);
  assert.deepEqual(validatePaymentAccount({}), []);
});

test("summary shows the fields staff need to pay an officer", () => {
  assert.equal(
    formatPaymentAccountSummary({
      payment_method: "bank_account",
      bank_name: "Meezan Bank",
      account_name: "Miraj",
      account_number: "998877",
    }),
    "Bank Account · Meezan Bank · Miraj · 998877"
  );
  assert.equal(
    formatPaymentAccountSummary({
      payment_method: "easypaisa",
      account_name: "Saad",
      payment_mobile: "03001234567",
    }),
    "Easypaisa · Saad · 03001234567"
  );
  assert.equal(
    formatPaymentAccountSummary({
      payment_method: "nayapay",
      nayapay_account_name: "Aliyan Khan",
      nayapay_number: "03001234567",
      nayapay_iban: "PK12NAYA0000001234567890",
    }),
    "NayaPay · Aliyan Khan · 03001234567 · PK12NAYA0000001234567890"
  );
});

test("NayaPay requires account name and mobile and keeps Bank IBAN separate", () => {
  const errors = validatePaymentAccount({ payment_method: "nayapay" });
  assert.equal(errors.some((e) => /NayaPay account name/i.test(e)), true);
  assert.equal(errors.some((e) => /NayaPay number/i.test(e)), true);
  const ok = validatePaymentAccount({
    payment_method: "nayapay",
    nayapay_account_name: "Saad",
    nayapay_number: "03001234567",
    iban: "PK77HABB0005507901740003",
  });
  assert.deepEqual(ok, []);
  const parsed = paymentAccountFromBody({
    payment_method: "nayapay",
    nayapay_account_name: "Saad",
    nayapay_number: "0300-1234567",
    nayapay_iban: "PK12 NAYA 0000 0012 3456 7890",
    iban: "PK77HABB0005507901740003",
  });
  assert.equal(isNayaPayMethod(parsed.payment_method), true);
  assert.equal(parsed.iban, "PK77HABB0005507901740003");
  assert.equal(parsed.nayapay_iban, "PK12NAYA0000001234567890");
  assert.equal(parsed.nayapay_number, "03001234567");
});

test("Easypaisa IBAN is stored separately from Bank IBAN and mobile", () => {
  const parsed = paymentAccountFromBody({
    payment_method: "easypaisa",
    account_name: "Saad",
    payment_mobile: "03198153737",
    iban: "PK77HABB0005507901740003",
    easypaisa_iban: "PK12 TBLP 0000 0012 3456 7890",
  });
  assert.equal(parsed.iban, "PK77HABB0005507901740003");
  assert.equal(parsed.easypaisa_iban, "PK12TBLP0000001234567890");
  assert.equal(parsed.payment_mobile, "03198153737");
  assert.equal(
    formatPaymentAccountSummary({
      payment_method: "easypaisa",
      account_name: "Saad",
      payment_mobile: "03198153737",
      easypaisa_iban: "PK12TBLP0000001234567890",
      iban: "PK77HABB0005507901740003",
    }),
    "Easypaisa · Saad · 03198153737 · PK12TBLP0000001234567890"
  );
  assert.deepEqual(
    validatePaymentAccount({
      payment_method: "jazzcash",
      account_title: "Bilawal",
      mobile_number: "03111234567",
    }),
    []
  );
});

test("adding payment columns does not change existing officer rows", () => {
  const file = path.join(os.tmpdir(), `officerflow-pay-${Date.now()}.db`);
  const database = new DatabaseSync(file);
  try {
    database.exec(`
      CREATE TABLE officers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        officer_code TEXT NOT NULL UNIQUE,
        salary REAL NOT NULL DEFAULT 0,
        payment_method TEXT
      )
    `);
    database.prepare(
      "INSERT INTO officers (name, officer_code, salary, payment_method) VALUES (?, ?, ?, ?)"
    ).run("Saad", "EMP001", 45000, "cash");
    const columns = [
      ["account_name", "TEXT"],
      ["bank_name", "TEXT"],
      ["account_number", "TEXT"],
      ["iban", "TEXT"],
      ["payment_mobile", "TEXT"],
      ["nayapay_account_name", "TEXT"],
      ["nayapay_number", "TEXT"],
      ["nayapay_iban", "TEXT"],
      ["easypaisa_iban", "TEXT"],
    ];
    const existingNames = database.prepare("PRAGMA table_info(officers)").all().map((c) => c.name);
    for (const [name, def] of columns) {
      if (!existingNames.includes(name)) {
        database.exec(`ALTER TABLE officers ADD COLUMN ${name} ${def}`);
      }
    }
    const row = database.prepare("SELECT * FROM officers WHERE officer_code = 'EMP001'").get();
    assert.equal(row.name, "Saad");
    assert.equal(row.salary, 45000);
    assert.equal(row.payment_method, "cash");
    assert.equal(row.account_name, null);
    assert.equal(row.iban, null);
    assert.equal(row.nayapay_iban, null);
    assert.equal(row.easypaisa_iban, null);
    assert.equal(database.prepare("SELECT COUNT(*) AS c FROM officers").get().c, 1);
  } finally {
    database.close();
    fs.unlinkSync(file);
  }
});
