import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type BalanceSheetGroup =
  | "current_asset"
  | "non_current_asset"
  | "current_liability"
  | "non_current_liability"
  | "equity";

export type BalanceSheetRow = {
  id: number;
  account_code: string;
  account_name: string;
  account_group: BalanceSheetGroup;
  normal_side: "debit" | "credit";
  is_contra: boolean;
  is_system: boolean;
  sort_order: number;
  balance: number;
  comparison_balance?: number;
  movement?: number;
  details: Array<{
    key: string;
    label: string;
    reference?: string | null;
    date?: string | null;
    amount: number;
    source_type: string;
  }>;
};

export type BalanceSheetReport = {
  company: Record<string, unknown>;
  as_of_date: string;
  accounts: Array<Record<string, unknown>>;
  manual_entries: Array<Record<string, unknown>>;
  snapshots: Array<Record<string, unknown>>;
  rows: BalanceSheetRow[];
  summary: {
    current_assets: number;
    non_current_assets: number;
    total_assets: number;
    current_liabilities: number;
    non_current_liabilities: number;
    total_liabilities: number;
    total_equity: number;
    liabilities_and_equity: number;
    variance: number;
    working_capital: number;
    current_ratio: number | null;
  };
  warnings: string[];
};

export type CashFlowActivity = "operating" | "investing" | "financing" | "excluded";

export type CashFlowEntry = {
  id: number;
  entry_no: string;
  entry_date: string;
  entry_type: string;
  source_type: string;
  reference: string;
  description: string;
  amount: number;
  bank_account_id: number;
  bank_account_name: string;
  activity: CashFlowActivity;
  line_name: string;
  explicit_classification: boolean;
};

export type CashFlowReport = {
  company: Record<string, unknown>;
  period: { from: string; to: string };
  comparison_period: { from: string; to: string };
  mappings: Array<Record<string, unknown>>;
  snapshots: Array<Record<string, unknown>>;
  entries: CashFlowEntry[];
  comparison_entries: CashFlowEntry[];
  lines: Array<{
    activity: Exclude<CashFlowActivity, "excluded">;
    line_name: string;
    current: number;
    comparison: number;
  }>;
  monthly: Array<{
    month: string;
    operating: number;
    investing: number;
    financing: number;
    net_change: number;
  }>;
  summary: {
    opening_cash: number;
    operating_cash: number;
    investing_cash: number;
    financing_cash: number;
    net_cash_change: number;
    excluded_cash_movements: number;
    closing_cash: number;
    calculated_closing_cash: number;
    reconciliation_difference: number;
  };
  comparison_summary: {
    opening_cash: number;
    operating_cash: number;
    investing_cash: number;
    financing_cash: number;
    net_cash_change: number;
    excluded_cash_movements: number;
    closing_cash: number;
    calculated_closing_cash: number;
    reconciliation_difference: number;
  };
  warnings: string[];
};

const decimal = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
};

const stringValue = (value: unknown, fallback = ""): string => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const dateInRange = (value: unknown, from: string, to: string): boolean => {
  const date = String(value ?? "");
  return date >= from && date <= to;
};

function sum<T>(rows: T[], select: (row: T) => number): number {
  return decimal(rows.reduce((total, row) => total + decimal(select(row)), 0));
}

function accountManualBalance(account: any, entries: any[]) {
  let total = 0;
  const details: BalanceSheetRow["details"] = [];
  for (const entry of entries) {
    if (Number(entry.account_id) !== Number(account.id) || entry.status !== "posted") continue;
    const amount = decimal(entry.amount);
    const normalIncrease = String(entry.entry_side) === String(account.normal_side);
    const signed = normalIncrease ? amount : -amount;
    total += signed;
    details.push({
      key: `manual-${entry.id}`,
      label: stringValue(entry.description, "Manual Balance Sheet entry"),
      reference: entry.reference,
      date: entry.entry_date,
      amount: decimal((account.is_contra ? -1 : 1) * signed),
      source_type: "manual",
    });
  }
  return { balance: decimal((account.is_contra ? -1 : 1) * total), details };
}

async function queryBalanceSheetData(admin: AdminClient, companyId: number, asOfDate: string) {
  const [
    companyResult,
    accountsResult,
    manualResult,
    snapshotsResult,
    bankAccountsResult,
    cashbookResult,
    invoicesResult,
    customerPaymentsResult,
    customerAllocationsResult,
    supplierBillsResult,
    supplierPaymentsResult,
    supplierPaymentAllocationsResult,
    supplierCreditsResult,
    supplierCreditAllocationsResult,
    gstAdjustmentsResult,
    payoutsResult,
    plAccountsResult,
    plManualResult,
  ] = await Promise.all([
    admin.from("companies").select("*").eq("id", companyId).maybeSingle(),
    admin.from("bs_accounts").select("*").eq("company_id", companyId).order("sort_order").order("account_code"),
    admin.from("bs_manual_entries").select("*").eq("company_id", companyId).lte("entry_date", asOfDate).order("entry_date", { ascending: false }).order("id", { ascending: false }),
    admin.from("bs_report_snapshots").select("*").eq("company_id", companyId).order("as_of_date", { ascending: false }).limit(24),
    admin.from("bank_accounts").select("*").eq("company_id", companyId).order("account_name"),
    admin.from("bank_cashbook_entries").select("*").eq("company_id", companyId).eq("status", "posted").lte("entry_date", asOfDate),
    admin.from("customer_invoices").select("*").eq("company_id", companyId).lte("invoice_date", asOfDate),
    admin.from("customer_payments").select("*").eq("company_id", companyId).eq("status", "posted").lte("payment_date", asOfDate),
    admin.from("customer_payment_allocations").select("*"),
    admin.from("supplier_bills").select("*").eq("company_id", companyId).lte("bill_date", asOfDate),
    admin.from("supplier_payments").select("*").eq("company_id", companyId).eq("status", "posted").lte("payment_date", asOfDate),
    admin.from("supplier_payment_allocations").select("*"),
    admin.from("supplier_credit_notes").select("*").eq("company_id", companyId).eq("status", "posted").lte("credit_date", asOfDate),
    admin.from("supplier_credit_allocations").select("*"),
    admin.from("gst_adjustments").select("*").eq("company_id", companyId).eq("status", "posted").lte("adjustment_date", asOfDate),
    admin.from("driver_payouts").select("*").eq("company_id", companyId).lte("period_end", asOfDate),
    admin.from("pl_accounts").select("*").eq("company_id", companyId),
    admin.from("pl_manual_entries").select("*").eq("company_id", companyId).eq("status", "posted").lte("entry_date", asOfDate),
  ]);

  const results = [
    companyResult,
    accountsResult,
    manualResult,
    snapshotsResult,
    bankAccountsResult,
    cashbookResult,
    invoicesResult,
    customerPaymentsResult,
    customerAllocationsResult,
    supplierBillsResult,
    supplierPaymentsResult,
    supplierPaymentAllocationsResult,
    supplierCreditsResult,
    supplierCreditAllocationsResult,
    gstAdjustmentsResult,
    payoutsResult,
    plAccountsResult,
    plManualResult,
  ];
  const error = results.find((result) => result.error)?.error;
  if (error) throw new Error(error.message);
  if (!companyResult.data) throw new Error("Company was not found.");

  return {
    company: companyResult.data as any,
    accounts: (accountsResult.data ?? []) as any[],
    manualEntries: (manualResult.data ?? []) as any[],
    snapshots: (snapshotsResult.data ?? []) as any[],
    bankAccounts: (bankAccountsResult.data ?? []) as any[],
    cashbook: (cashbookResult.data ?? []) as any[],
    invoices: (invoicesResult.data ?? []) as any[],
    customerPayments: (customerPaymentsResult.data ?? []) as any[],
    customerAllocations: (customerAllocationsResult.data ?? []) as any[],
    supplierBills: (supplierBillsResult.data ?? []) as any[],
    supplierPayments: (supplierPaymentsResult.data ?? []) as any[],
    supplierPaymentAllocations: (supplierPaymentAllocationsResult.data ?? []) as any[],
    supplierCredits: (supplierCreditsResult.data ?? []) as any[],
    supplierCreditAllocations: (supplierCreditAllocationsResult.data ?? []) as any[],
    gstAdjustments: (gstAdjustmentsResult.data ?? []) as any[],
    payouts: (payoutsResult.data ?? []) as any[],
    plAccounts: (plAccountsResult.data ?? []) as any[],
    plManualEntries: (plManualResult.data ?? []) as any[],
  };
}

export async function buildBalanceSheet(
  admin: AdminClient,
  companyId: number,
  asOfDate: string,
): Promise<BalanceSheetReport> {
  const data = await queryBalanceSheetData(admin, companyId, asOfDate);
  const warnings: string[] = [];
  const baseCurrency = stringValue(data.company.base_currency, "SGD");

  const postedPaymentIds = new Set(data.customerPayments.map((row) => Number(row.id)));
  const customerAllocations = data.customerAllocations.filter((row) => postedPaymentIds.has(Number(row.payment_id)));
  const paymentAllocationByInvoice = new Map<number, number>();
  const paymentAllocationByPayment = new Map<number, number>();
  for (const allocation of customerAllocations) {
    const invoiceId = Number(allocation.invoice_id);
    const paymentId = Number(allocation.payment_id);
    paymentAllocationByInvoice.set(invoiceId, decimal((paymentAllocationByInvoice.get(invoiceId) ?? 0) + decimal(allocation.allocated_amount)));
    paymentAllocationByPayment.set(paymentId, decimal((paymentAllocationByPayment.get(paymentId) ?? 0) + decimal(allocation.allocated_amount)));
  }

  const postedSupplierPaymentIds = new Set(data.supplierPayments.map((row) => Number(row.id)));
  const supplierPaymentAllocations = data.supplierPaymentAllocations.filter((row) => postedSupplierPaymentIds.has(Number(row.payment_id)));
  const paymentAllocationByBill = new Map<number, number>();
  const supplierAllocationByPayment = new Map<number, number>();
  for (const allocation of supplierPaymentAllocations) {
    const billId = Number(allocation.bill_id);
    const paymentId = Number(allocation.payment_id);
    paymentAllocationByBill.set(billId, decimal((paymentAllocationByBill.get(billId) ?? 0) + decimal(allocation.allocated_amount)));
    supplierAllocationByPayment.set(paymentId, decimal((supplierAllocationByPayment.get(paymentId) ?? 0) + decimal(allocation.allocated_amount)));
  }

  const postedCreditIds = new Set(data.supplierCredits.map((row) => Number(row.id)));
  const supplierCreditAllocations = data.supplierCreditAllocations.filter((row) => postedCreditIds.has(Number(row.credit_note_id)));
  const creditAllocationByBill = new Map<number, number>();
  const allocationByCredit = new Map<number, number>();
  for (const allocation of supplierCreditAllocations) {
    const billId = Number(allocation.bill_id);
    const creditId = Number(allocation.credit_note_id);
    creditAllocationByBill.set(billId, decimal((creditAllocationByBill.get(billId) ?? 0) + decimal(allocation.allocated_amount)));
    allocationByCredit.set(creditId, decimal((allocationByCredit.get(creditId) ?? 0) + decimal(allocation.allocated_amount)));
  }

  const activeBankAccounts = data.bankAccounts.filter((account) => account.is_active !== false);
  const bankDetails: BalanceSheetRow["details"] = activeBankAccounts.map((account) => {
    const openingDate = account.opening_balance_date ? String(account.opening_balance_date) : null;
    const opening = !openingDate || openingDate <= asOfDate ? decimal(account.opening_balance) : 0;
    const movement = sum(
      data.cashbook.filter((entry) => Number(entry.bank_account_id) === Number(account.id)),
      (entry) => decimal(entry.amount),
    );
    if (stringValue(account.currency, baseCurrency) !== baseCurrency) {
      warnings.push(`${stringValue(account.account_name, "Bank account")} is in ${account.currency}; no exchange-rate conversion was applied.`);
    }
    return {
      key: `bank-${account.id}`,
      label: stringValue(account.account_name, "Bank Account"),
      reference: stringValue(account.account_no) || stringValue(account.bank_name) || null,
      date: openingDate,
      amount: decimal(opening + movement),
      source_type: "bank_account",
    };
  });
  const cashAndBank = sum(bankDetails, (detail) => detail.amount);

  const eligibleInvoices = data.invoices.filter((invoice) =>
    ["issued", "partial", "paid", "overdue"].includes(String(invoice.status)),
  );
  const receivableDetails: BalanceSheetRow["details"] = [];
  let accountsReceivable = 0;
  for (const invoice of eligibleInvoices) {
    const outstanding = Math.max(
      decimal(invoice.total_amount) -
        decimal(invoice.payment_ledger_opening_amount) -
        decimal(paymentAllocationByInvoice.get(Number(invoice.id))),
      0,
    );
    if (outstanding <= 0) continue;
    accountsReceivable += outstanding;
    receivableDetails.push({
      key: `invoice-${invoice.id}`,
      label: stringValue(invoice.customer_name, "Customer"),
      reference: stringValue(invoice.invoice_no, `Invoice ${invoice.id}`),
      date: invoice.due_date ?? invoice.invoice_date,
      amount: decimal(outstanding),
      source_type: "customer_invoice",
    });
  }
  accountsReceivable = decimal(accountsReceivable);

  const customerCreditDetails: BalanceSheetRow["details"] = [];
  let customerCredits = 0;
  for (const payment of data.customerPayments) {
    const unallocated = Math.max(decimal(payment.amount) - decimal(paymentAllocationByPayment.get(Number(payment.id))), 0);
    if (unallocated <= 0) continue;
    customerCredits += unallocated;
    customerCreditDetails.push({
      key: `customer-credit-${payment.id}`,
      label: stringValue(payment.customer_name, "Customer"),
      reference: stringValue(payment.receipt_no, `Receipt ${payment.id}`),
      date: payment.payment_date,
      amount: decimal(unallocated),
      source_type: "customer_payment",
    });
  }
  customerCredits = decimal(customerCredits);

  const eligibleBills = data.supplierBills.filter((bill) =>
    ["open", "partial", "paid", "overdue"].includes(String(bill.status)),
  );
  const payableDetails: BalanceSheetRow["details"] = [];
  let accountsPayable = 0;
  for (const bill of eligibleBills) {
    const outstanding = Math.max(
      decimal(bill.total_amount) -
        decimal(bill.payment_ledger_opening_amount) -
        decimal(paymentAllocationByBill.get(Number(bill.id))) -
        decimal(creditAllocationByBill.get(Number(bill.id))),
      0,
    );
    if (outstanding <= 0) continue;
    accountsPayable += outstanding;
    payableDetails.push({
      key: `bill-${bill.id}`,
      label: stringValue(bill.supplier_name, "Supplier"),
      reference: stringValue(bill.bill_no || bill.supplier_invoice_no, `Bill ${bill.id}`),
      date: bill.due_date ?? bill.bill_date,
      amount: decimal(outstanding),
      source_type: "supplier_bill",
    });
  }
  accountsPayable = decimal(accountsPayable);

  const supplierAdvanceDetails: BalanceSheetRow["details"] = [];
  let supplierAdvances = 0;
  for (const payment of data.supplierPayments) {
    const unallocated = Math.max(decimal(payment.amount) - decimal(supplierAllocationByPayment.get(Number(payment.id))), 0);
    if (unallocated <= 0) continue;
    supplierAdvances += unallocated;
    supplierAdvanceDetails.push({
      key: `supplier-advance-${payment.id}`,
      label: stringValue(payment.supplier_name, "Supplier"),
      reference: stringValue(payment.voucher_no, `Payment ${payment.id}`),
      date: payment.payment_date,
      amount: decimal(unallocated),
      source_type: "supplier_payment",
    });
  }
  for (const credit of data.supplierCredits) {
    const unapplied = Math.max(decimal(credit.amount) - decimal(allocationByCredit.get(Number(credit.id))), 0);
    if (unapplied <= 0) continue;
    supplierAdvances += unapplied;
    supplierAdvanceDetails.push({
      key: `supplier-credit-${credit.id}`,
      label: stringValue(credit.supplier_name, "Supplier"),
      reference: stringValue(credit.credit_note_no, `Credit ${credit.id}`),
      date: credit.credit_date,
      amount: decimal(unapplied),
      source_type: "supplier_credit_note",
    });
  }
  supplierAdvances = decimal(supplierAdvances);

  const outputTax = sum(eligibleInvoices, (invoice) => decimal(invoice.gst_amount));
  const inputTax = sum(eligibleBills, (bill) => decimal(bill.recoverable_gst_amount));
  const outputAdjustments = sum(
    data.gstAdjustments.filter((row) => row.adjustment_type === "output_tax"),
    (row) => decimal(row.gst_amount),
  );
  const inputAdjustments = sum(
    data.gstAdjustments.filter((row) => row.adjustment_type === "input_tax"),
    (row) => decimal(row.gst_amount),
  );
  const netGst = decimal(outputTax + outputAdjustments - inputTax - inputAdjustments);
  const gstReceivable = netGst < 0 ? Math.abs(netGst) : 0;
  const gstPayable = netGst > 0 ? netGst : 0;

  const invoiceRevenue = sum(eligibleInvoices, (invoice) => decimal(invoice.subtotal) + decimal(invoice.service_charge_amount));
  const supplierExpense = sum(eligibleBills, (bill) =>
    decimal(bill.subtotal) + Math.max(decimal(bill.gst_amount) - decimal(bill.recoverable_gst_amount), 0),
  );
  const payoutExpense = sum(
    data.payouts.filter((payout) => ["approved", "partial", "paid"].includes(String(payout.status))),
    (payout) => decimal(payout.net_payout ?? decimal(payout.gross_earnings) - decimal(payout.deductions) - decimal(payout.advances)),
  );
  const driverPayoutDetails: BalanceSheetRow["details"] = [];
  let driverPayoutsPayable = 0;
  for (const payout of data.payouts.filter((row) => ["approved", "partial", "paid"].includes(String(row.status)))) {
    const netPayout = decimal(
      payout.net_payout ?? decimal(payout.gross_earnings) - decimal(payout.deductions) - decimal(payout.advances),
    );
    const outstanding = Math.max(decimal(payout.outstanding_amount ?? netPayout - decimal(payout.amount_paid)), 0);
    if (outstanding <= 0) continue;
    driverPayoutsPayable += outstanding;
    driverPayoutDetails.push({
      key: `driver-payout-${payout.id}`,
      label: stringValue(payout.payout_no, `Driver payout ${payout.id}`),
      reference: stringValue(payout.payment_method) || null,
      date: payout.period_end ?? payout.payment_date,
      amount: decimal(outstanding),
      source_type: "driver_payout",
    });
  }
  driverPayoutsPayable = decimal(driverPayoutsPayable);
  let cashbookIncome = 0;
  let cashbookExpense = 0;
  for (const entry of data.cashbook) {
    const amount = decimal(entry.amount);
    if (entry.entry_type === "bank_fee") cashbookExpense += Math.abs(amount);
    else if (entry.entry_type === "interest") {
      if (amount >= 0) cashbookIncome += amount;
      else cashbookExpense += Math.abs(amount);
    } else if (entry.entry_type === "adjustment") {
      if (amount >= 0) cashbookIncome += amount;
      else cashbookExpense += Math.abs(amount);
    }
  }

  const plAccountById = new Map(data.plAccounts.map((account) => [Number(account.id), account]));
  let manualIncome = 0;
  let manualExpense = 0;
  for (const entry of data.plManualEntries) {
    const account = plAccountById.get(Number(entry.account_id));
    if (!account) continue;
    const effect = (entry.direction === "decrease" ? -1 : 1) * decimal(entry.amount);
    if (["revenue", "other_income"].includes(String(account.account_group))) manualIncome += effect;
    else manualExpense += effect;
  }
  const retainedEarnings = decimal(
    invoiceRevenue + cashbookIncome + manualIncome - supplierExpense - payoutExpense - cashbookExpense - manualExpense,
  );

  const sourceBalances = new Map<string, { amount: number; details: BalanceSheetRow["details"] }>([
    ["1000", { amount: cashAndBank, details: bankDetails }],
    ["1100", { amount: accountsReceivable, details: receivableDetails }],
    ["1200", { amount: supplierAdvances, details: supplierAdvanceDetails }],
    ["1300", { amount: gstReceivable, details: gstReceivable ? [{ key: "gst-receivable", label: "Net recoverable GST", amount: gstReceivable, source_type: "gst" }] : [] }],
    ["2000", { amount: accountsPayable, details: payableDetails }],
    ["2100", { amount: customerCredits, details: customerCreditDetails }],
    ["2200", { amount: gstPayable, details: gstPayable ? [{ key: "gst-payable", label: "Net GST payable", amount: gstPayable, source_type: "gst" }] : [] }],
    ["2400", { amount: driverPayoutsPayable, details: driverPayoutDetails }],
    ["3200", { amount: retainedEarnings, details: [{ key: "retained-earnings", label: "Cumulative profit / (loss)", date: asOfDate, amount: retainedEarnings, source_type: "profit_loss" }] }],
  ]);

  const rows: BalanceSheetRow[] = data.accounts
    .filter((account) => account.is_active !== false)
    .map((account) => {
      const manual = accountManualBalance(account, data.manualEntries);
      const source = sourceBalances.get(String(account.account_code));
      const balance = decimal(manual.balance + decimal(source?.amount));
      return {
        id: Number(account.id),
        account_code: String(account.account_code),
        account_name: String(account.account_name),
        account_group: account.account_group as BalanceSheetGroup,
        normal_side: account.normal_side === "credit" ? "credit" : "debit",
        is_contra: Boolean(account.is_contra),
        is_system: Boolean(account.is_system),
        sort_order: Number(account.sort_order ?? 100),
        balance,
        details: [...(source?.details ?? []), ...manual.details],
      };
    });

  const groupTotal = (group: BalanceSheetGroup) => sum(rows.filter((row) => row.account_group === group), (row) => row.balance);
  const currentAssets = groupTotal("current_asset");
  const nonCurrentAssets = groupTotal("non_current_asset");
  const currentLiabilities = groupTotal("current_liability");
  const nonCurrentLiabilities = groupTotal("non_current_liability");
  const equity = groupTotal("equity");
  const totalAssets = decimal(currentAssets + nonCurrentAssets);
  const totalLiabilities = decimal(currentLiabilities + nonCurrentLiabilities);
  const liabilitiesAndEquity = decimal(totalLiabilities + equity);
  const variance = decimal(totalAssets - liabilitiesAndEquity);
  if (Math.abs(variance) > 0.01) {
    warnings.push("The Balance Sheet is not balanced. Review opening capital, fixed assets, loans and manual entries.");
  }

  return {
    company: data.company,
    as_of_date: asOfDate,
    accounts: data.accounts,
    manual_entries: data.manualEntries,
    snapshots: data.snapshots,
    rows,
    summary: {
      current_assets: currentAssets,
      non_current_assets: nonCurrentAssets,
      total_assets: totalAssets,
      current_liabilities: currentLiabilities,
      non_current_liabilities: nonCurrentLiabilities,
      total_liabilities: totalLiabilities,
      total_equity: equity,
      liabilities_and_equity: liabilitiesAndEquity,
      variance,
      working_capital: decimal(currentAssets - currentLiabilities),
      current_ratio: currentLiabilities === 0 ? null : decimal(currentAssets / currentLiabilities),
    },
    warnings,
  };
}

function resolveCashFlowClassification(entry: any, mappings: any[]) {
  if (entry.cash_flow_activity) {
    return {
      activity: entry.cash_flow_activity as CashFlowActivity,
      lineName: stringValue(entry.cash_flow_line, "Other cash movement"),
      explicit: true,
    };
  }
  const sourceType = stringValue(entry.source_type, "*").toLowerCase();
  const entryType = stringValue(entry.entry_type, "adjustment").toLowerCase();
  const candidates = mappings
    .filter((mapping) => mapping.is_active !== false)
    .filter((mapping) => [sourceType, "*"].includes(String(mapping.source_type)))
    .filter((mapping) => [entryType, "*"].includes(String(mapping.entry_type)))
    .sort((left, right) => {
      const leftSpecificity = (left.source_type === sourceType ? 2 : 0) + (left.entry_type === entryType ? 1 : 0);
      const rightSpecificity = (right.source_type === sourceType ? 2 : 0) + (right.entry_type === entryType ? 1 : 0);
      return rightSpecificity - leftSpecificity || Number(left.priority ?? 100) - Number(right.priority ?? 100);
    });
  const mapping = candidates[0];
  return {
    activity: (mapping?.activity ?? "operating") as CashFlowActivity,
    lineName: stringValue(mapping?.line_name, "Other operating cash movements"),
    explicit: false,
  };
}

function cashPosition(bankAccounts: any[], entries: any[], dateExclusiveOrInclusive: string, inclusive: boolean) {
  const opening = sum(bankAccounts, (account) => {
    const openingDate = account.opening_balance_date ? String(account.opening_balance_date) : null;
    if (openingDate && (inclusive ? openingDate > dateExclusiveOrInclusive : openingDate >= dateExclusiveOrInclusive)) return 0;
    return decimal(account.opening_balance);
  });
  const movement = sum(
    entries.filter((entry) => inclusive ? String(entry.entry_date) <= dateExclusiveOrInclusive : String(entry.entry_date) < dateExclusiveOrInclusive),
    (entry) => decimal(entry.amount),
  );
  return decimal(opening + movement);
}

function summariseCashFlow(entries: CashFlowEntry[], openingCash: number, actualClosingCash: number) {
  const operating = sum(entries.filter((entry) => entry.activity === "operating"), (entry) => entry.amount);
  const investing = sum(entries.filter((entry) => entry.activity === "investing"), (entry) => entry.amount);
  const financing = sum(entries.filter((entry) => entry.activity === "financing"), (entry) => entry.amount);
  const excluded = sum(entries.filter((entry) => entry.activity === "excluded"), (entry) => entry.amount);
  const net = decimal(operating + investing + financing);
  const calculatedClosing = decimal(openingCash + net);
  return {
    opening_cash: decimal(openingCash),
    operating_cash: operating,
    investing_cash: investing,
    financing_cash: financing,
    net_cash_change: net,
    excluded_cash_movements: excluded,
    closing_cash: decimal(actualClosingCash),
    calculated_closing_cash: calculatedClosing,
    reconciliation_difference: decimal(actualClosingCash - calculatedClosing),
  };
}

export async function buildCashFlow(
  admin: AdminClient,
  companyId: number,
  periodFrom: string,
  periodTo: string,
  comparisonFrom: string,
  comparisonTo: string,
): Promise<CashFlowReport> {
  const earliest = [periodFrom, comparisonFrom].sort()[0];
  const latest = [periodTo, comparisonTo].sort().at(-1) ?? periodTo;
  const [companyResult, accountsResult, cashbookResult, mappingsResult, snapshotsResult] = await Promise.all([
    admin.from("companies").select("*").eq("id", companyId).maybeSingle(),
    admin.from("bank_accounts").select("*").eq("company_id", companyId).order("account_name"),
    admin.from("bank_cashbook_entries").select("*").eq("company_id", companyId).eq("status", "posted").lte("entry_date", latest).order("entry_date").order("id"),
    admin.from("cash_flow_mappings").select("*").eq("company_id", companyId).order("priority").order("id"),
    admin.from("cash_flow_report_snapshots").select("*").eq("company_id", companyId).order("period_to", { ascending: false }).limit(24),
  ]);
  const error = [companyResult, accountsResult, cashbookResult, mappingsResult, snapshotsResult].find((result) => result.error)?.error;
  if (error) throw new Error(error.message);
  if (!companyResult.data) throw new Error("Company was not found.");

  const company = companyResult.data as any;
  const bankAccounts = (accountsResult.data ?? []) as any[];
  const cashbook = (cashbookResult.data ?? []) as any[];
  const mappings = (mappingsResult.data ?? []) as any[];
  const accountById = new Map(bankAccounts.map((account) => [Number(account.id), account]));
  const warnings: string[] = [];
  const baseCurrency = stringValue(company.base_currency, "SGD");
  for (const account of bankAccounts) {
    if (stringValue(account.currency, baseCurrency) !== baseCurrency) {
      warnings.push(`${stringValue(account.account_name, "Bank account")} is in ${account.currency}; no exchange-rate conversion was applied.`);
    }
  }

  const transform = (entry: any): CashFlowEntry => {
    const classification = resolveCashFlowClassification(entry, mappings);
    const account = accountById.get(Number(entry.bank_account_id));
    return {
      id: Number(entry.id),
      entry_no: stringValue(entry.entry_no, `Entry ${entry.id}`),
      entry_date: String(entry.entry_date),
      entry_type: stringValue(entry.entry_type, "adjustment"),
      source_type: stringValue(entry.source_type, "manual"),
      reference: stringValue(entry.reference),
      description: stringValue(entry.description, "Cash-book entry"),
      amount: decimal(entry.amount),
      bank_account_id: Number(entry.bank_account_id),
      bank_account_name: stringValue(account?.account_name, "Bank Account"),
      activity: classification.activity,
      line_name: classification.lineName,
      explicit_classification: classification.explicit,
    };
  };

  const currentEntries = cashbook.filter((entry) => dateInRange(entry.entry_date, periodFrom, periodTo)).map(transform);
  const comparisonEntries = cashbook.filter((entry) => dateInRange(entry.entry_date, comparisonFrom, comparisonTo)).map(transform);

  const openingCash = cashPosition(bankAccounts, cashbook, periodFrom, false);
  const closingCash = cashPosition(bankAccounts, cashbook, periodTo, true);
  const comparisonOpening = cashPosition(bankAccounts, cashbook, comparisonFrom, false);
  const comparisonClosing = cashPosition(bankAccounts, cashbook, comparisonTo, true);
  const summary = summariseCashFlow(currentEntries, openingCash, closingCash);
  const comparisonSummary = summariseCashFlow(comparisonEntries, comparisonOpening, comparisonClosing);

  const lineKeys = new Set<string>();
  for (const entry of [...currentEntries, ...comparisonEntries]) {
    if (entry.activity === "excluded") continue;
    lineKeys.add(`${entry.activity}||${entry.line_name}`);
  }
  const lines = [...lineKeys]
    .map((key) => {
      const [activity, lineName] = key.split("||") as [Exclude<CashFlowActivity, "excluded">, string];
      return {
        activity,
        line_name: lineName,
        current: sum(currentEntries.filter((entry) => entry.activity === activity && entry.line_name === lineName), (entry) => entry.amount),
        comparison: sum(comparisonEntries.filter((entry) => entry.activity === activity && entry.line_name === lineName), (entry) => entry.amount),
      };
    })
    .sort((left, right) => left.activity.localeCompare(right.activity) || left.line_name.localeCompare(right.line_name));

  const monthKeys: string[] = [];
  const cursor = new Date(`${periodFrom}T00:00:00`);
  const end = new Date(`${periodTo}T00:00:00`);
  while (cursor <= end && monthKeys.length < 120) {
    monthKeys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1, 1);
  }
  const monthly = monthKeys.map((month) => {
    const monthEntries = currentEntries.filter((entry) => entry.entry_date.startsWith(month));
    const operating = sum(monthEntries.filter((entry) => entry.activity === "operating"), (entry) => entry.amount);
    const investing = sum(monthEntries.filter((entry) => entry.activity === "investing"), (entry) => entry.amount);
    const financing = sum(monthEntries.filter((entry) => entry.activity === "financing"), (entry) => entry.amount);
    return { month, operating, investing, financing, net_change: decimal(operating + investing + financing) };
  });

  if (Math.abs(summary.reconciliation_difference) > 0.01) {
    warnings.push("Cash Flow does not reconcile to closing cash. Review excluded transfers and unclassified cash-book entries.");
  }
  if (cashbook.some((entry) => String(entry.entry_date) >= earliest && !entry.cash_flow_activity)) {
    warnings.push("Some cash-book entries use default mappings. Classify material investing or financing movements explicitly.");
  }

  return {
    company,
    period: { from: periodFrom, to: periodTo },
    comparison_period: { from: comparisonFrom, to: comparisonTo },
    mappings,
    snapshots: (snapshotsResult.data ?? []) as Array<Record<string, unknown>>,
    entries: currentEntries,
    comparison_entries: comparisonEntries,
    lines,
    monthly,
    summary,
    comparison_summary: comparisonSummary,
    warnings,
  };
}
