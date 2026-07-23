import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type AccountGroup =
  | "revenue"
  | "cost_of_sales"
  | "operating_expense"
  | "other_income"
  | "other_expense";

type Payload = {
  action?:
    | "save_account"
    | "save_mapping"
    | "delete_mapping"
    | "save_budget"
    | "save_manual_entry"
    | "void_manual_entry"
    | "classify_source";
  id?: number;
  company_id?: number;
  account_id?: number;
  account_code?: string;
  account_name?: string;
  account_group?: AccountGroup;
  is_active?: boolean;
  sort_order?: number;
  description?: string;
  source_type?: string;
  source_category?: string;
  source_id?: number;
  priority?: number;
  notes?: string;
  budget_month?: string;
  amount?: number;
  entry_date?: string;
  reference?: string;
  direction?: "increase" | "decrease";
  reason?: string;
};

type Account = {
  id: number;
  company_id: number;
  account_code: string;
  account_name: string;
  account_group: AccountGroup;
  normal_side: "debit" | "credit";
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
  description?: string | null;
};

type Mapping = {
  id: number;
  company_id: number;
  source_type: string;
  source_category: string;
  account_id: number;
  priority: number;
  is_active: boolean;
  notes?: string | null;
};

type LedgerEntry = {
  key: string;
  source_type: string;
  source_id: number;
  source_no: string;
  source_date: string;
  counterparty: string;
  description: string;
  source_category: string;
  account_id: number;
  amount: number;
  supports_classification: boolean;
};

const failure = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status });

const clean = (value: unknown): string | null => {
  const text = String(value ?? "").trim();
  return text || null;
};

const integer = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const decimal = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
};

const validDate = (value: unknown): string | null => {
  const text = clean(value);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};

const inPeriod = (date: string, from: string, to: string) => date >= from && date <= to;

async function administratorSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,status")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "administrator" || profile.status !== "active") return null;
  return { supabase, user };
}

function resolveAccount(
  accounts: Account[],
  mappings: Mapping[],
  sourceType: string,
  sourceCategory: string,
  explicitAccountId: number | null | undefined,
  fallbackCode: string,
) {
  if (explicitAccountId && accounts.some((account) => account.id === explicitAccountId)) {
    return explicitAccountId;
  }
  const category = sourceCategory.trim().toLowerCase();
  const mapping = mappings
    .filter((item) => item.is_active && item.source_type === sourceType)
    .sort((a, b) => a.priority - b.priority)
    .find((item) => item.source_category === category);
  if (mapping) return mapping.account_id;
  const wildcard = mappings
    .filter((item) => item.is_active && item.source_type === sourceType && item.source_category === "*")
    .sort((a, b) => a.priority - b.priority)[0];
  if (wildcard) return wildcard.account_id;
  return accounts.find((account) => account.account_code === fallbackCode)?.id ?? accounts[0]?.id ?? 0;
}

async function buildReport(
  admin: ReturnType<typeof createAdminClient>,
  companyId: number,
  periodFrom: string,
  periodTo: string,
  comparisonFrom: string,
  comparisonTo: string,
) {
  const minDate = [periodFrom, comparisonFrom].sort()[0];
  const maxDate = [periodTo, comparisonTo].sort().at(-1) ?? periodTo;

  const [companyResult, accountsResult, mappingsResult, budgetsResult, invoicesResult, billsResult, payoutsResult, cashbookResult, manualResult] =
    await Promise.all([
      admin.from("companies").select("*").eq("id", companyId).maybeSingle(),
      admin
        .from("pl_accounts")
        .select("*")
        .eq("company_id", companyId)
        .order("sort_order")
        .order("account_code"),
      admin
        .from("pl_source_mappings")
        .select("*")
        .eq("company_id", companyId)
        .order("priority")
        .order("id"),
      admin
        .from("pl_budgets")
        .select("*")
        .eq("company_id", companyId)
        .gte("budget_month", `${periodFrom.slice(0, 7)}-01`)
        .lte("budget_month", periodTo),
      admin
        .from("customer_invoices")
        .select("id,company_id,invoice_no,invoice_date,customer_name,subtotal,service_charge_amount,status,pl_account_id")
        .eq("company_id", companyId)
        .gte("invoice_date", minDate)
        .lte("invoice_date", maxDate),
      admin
        .from("supplier_bills")
        .select("id,company_id,bill_no,bill_date,supplier_name,supplier_invoice_no,subtotal,gst_amount,recoverable_gst_amount,status,expense_category,description,pl_account_id")
        .eq("company_id", companyId)
        .gte("bill_date", minDate)
        .lte("bill_date", maxDate),
      admin
        .from("driver_payouts")
        .select("id,company_id,payout_no,period_end,payment_date,gross_earnings,deductions,advances,net_payout,status,pl_account_id,drivers(full_name)")
        .eq("company_id", companyId)
        .gte("period_end", minDate)
        .lte("period_end", maxDate),
      admin
        .from("bank_cashbook_entries")
        .select("id,company_id,entry_no,entry_date,entry_type,source_type,reference,description,amount,status,pl_account_id")
        .eq("company_id", companyId)
        .in("entry_type", ["bank_fee", "interest", "adjustment"])
        .gte("entry_date", minDate)
        .lte("entry_date", maxDate),
      admin
        .from("pl_manual_entries")
        .select("*")
        .eq("company_id", companyId)
        .gte("entry_date", minDate)
        .lte("entry_date", maxDate)
        .order("entry_date", { ascending: false })
        .order("id", { ascending: false }),
    ]);

  const error =
    companyResult.error ??
    accountsResult.error ??
    mappingsResult.error ??
    budgetsResult.error ??
    invoicesResult.error ??
    billsResult.error ??
    payoutsResult.error ??
    cashbookResult.error ??
    manualResult.error;
  if (error) throw new Error(error.message);
  if (!companyResult.data) throw new Error("Company was not found.");

  const accounts = (accountsResult.data ?? []) as Account[];
  const mappings = (mappingsResult.data ?? []) as Mapping[];
  const entries: LedgerEntry[] = [];

  for (const invoice of invoicesResult.data ?? []) {
    if (!["issued", "partial", "paid", "overdue"].includes(String(invoice.status))) continue;
    const subtotal = decimal(invoice.subtotal);
    const serviceCharge = decimal(invoice.service_charge_amount);
    if (subtotal !== 0) {
      entries.push({
        key: `invoice-${invoice.id}-subtotal`,
        source_type: "customer_invoice",
        source_id: Number(invoice.id),
        source_no: String(invoice.invoice_no ?? `Invoice ${invoice.id}`),
        source_date: String(invoice.invoice_date),
        counterparty: String(invoice.customer_name ?? "Customer"),
        description: "Customer sales revenue",
        source_category: "invoice_subtotal",
        account_id: resolveAccount(
          accounts,
          mappings,
          "customer_invoice",
          "invoice_subtotal",
          invoice.pl_account_id ? Number(invoice.pl_account_id) : null,
          "4000",
        ),
        amount: subtotal,
        supports_classification: true,
      });
    }
    if (serviceCharge !== 0) {
      entries.push({
        key: `invoice-${invoice.id}-service`,
        source_type: "customer_invoice",
        source_id: Number(invoice.id),
        source_no: String(invoice.invoice_no ?? `Invoice ${invoice.id}`),
        source_date: String(invoice.invoice_date),
        counterparty: String(invoice.customer_name ?? "Customer"),
        description: "Service charge revenue",
        source_category: "service_charge",
        account_id: resolveAccount(accounts, mappings, "customer_invoice", "service_charge", null, "4100"),
        amount: serviceCharge,
        supports_classification: false,
      });
    }
  }

  for (const bill of billsResult.data ?? []) {
    if (!["open", "partial", "paid", "overdue"].includes(String(bill.status))) continue;
    const nonRecoverableGst = Math.max(decimal(bill.gst_amount) - decimal(bill.recoverable_gst_amount), 0);
    const amount = decimal(bill.subtotal) + nonRecoverableGst;
    if (amount === 0) continue;
    const category = clean(bill.expense_category) ?? "general expenses";
    entries.push({
      key: `bill-${bill.id}`,
      source_type: "supplier_bill",
      source_id: Number(bill.id),
      source_no: String(bill.bill_no ?? bill.supplier_invoice_no ?? `Bill ${bill.id}`),
      source_date: String(bill.bill_date),
      counterparty: String(bill.supplier_name ?? "Supplier"),
      description: clean(bill.description) ?? category,
      source_category: category.toLowerCase(),
      account_id: resolveAccount(
        accounts,
        mappings,
        "supplier_bill",
        category,
        bill.pl_account_id ? Number(bill.pl_account_id) : null,
        "6000",
      ),
      amount,
      supports_classification: true,
    });
  }

  for (const payout of payoutsResult.data ?? []) {
    if (!["approved", "partial", "paid"].includes(String(payout.status))) continue;
    const amount = decimal(payout.net_payout ?? decimal(payout.gross_earnings) - decimal(payout.deductions) - decimal(payout.advances));
    if (amount === 0 || !payout.period_end) continue;
    const driverData = Array.isArray(payout.drivers) ? payout.drivers[0] : payout.drivers;
    entries.push({
      key: `payout-${payout.id}`,
      source_type: "driver_payout",
      source_id: Number(payout.id),
      source_no: String(payout.payout_no ?? `Payout ${payout.id}`),
      source_date: String(payout.period_end),
      counterparty: String((driverData as { full_name?: string } | null)?.full_name ?? "Driver"),
      description: "Driver payout cost",
      source_category: "driver cost",
      account_id: resolveAccount(
        accounts,
        mappings,
        "driver_payout",
        "driver cost",
        payout.pl_account_id ? Number(payout.pl_account_id) : null,
        "5100",
      ),
      amount,
      supports_classification: true,
    });
  }

  for (const cashbook of cashbookResult.data ?? []) {
    if (cashbook.status !== "posted") continue;
    const rawAmount = decimal(cashbook.amount);
    if (rawAmount === 0) continue;
    let category = "adjustment_income";
    let fallback = "7000";
    if (cashbook.entry_type === "bank_fee") {
      category = "bank_fee";
      fallback = "6600";
    } else if (cashbook.entry_type === "interest") {
      category = rawAmount >= 0 ? "interest_income" : "interest_expense";
      fallback = rawAmount >= 0 ? "7100" : "8000";
    } else if (rawAmount < 0) {
      category = "adjustment_expense";
      fallback = "8000";
    }
    entries.push({
      key: `cashbook-${cashbook.id}`,
      source_type: "bank_cashbook",
      source_id: Number(cashbook.id),
      source_no: String(cashbook.entry_no ?? `Cash book ${cashbook.id}`),
      source_date: String(cashbook.entry_date),
      counterparty: "Bank / Cash Book",
      description: String(cashbook.description ?? cashbook.reference ?? "Cash-book adjustment"),
      source_category: category,
      account_id: resolveAccount(
        accounts,
        mappings,
        "bank_cashbook",
        category,
        cashbook.pl_account_id ? Number(cashbook.pl_account_id) : null,
        fallback,
      ),
      amount: Math.abs(rawAmount),
      supports_classification: true,
    });
  }

  for (const manual of manualResult.data ?? []) {
    if (manual.status !== "posted") continue;
    entries.push({
      key: `manual-${manual.id}`,
      source_type: "manual",
      source_id: Number(manual.id),
      source_no: String(manual.entry_no ?? `Manual ${manual.id}`),
      source_date: String(manual.entry_date),
      counterparty: "Manual Entry",
      description: String(manual.description ?? "Manual P&L entry"),
      source_category: "manual",
      account_id: Number(manual.account_id),
      amount: (manual.direction === "decrease" ? -1 : 1) * decimal(manual.amount),
      supports_classification: false,
    });
  }

  const budgetByAccount = new Map<number, number>();
  for (const budget of budgetsResult.data ?? []) {
    const id = Number(budget.account_id);
    budgetByAccount.set(id, decimal(budgetByAccount.get(id)) + decimal(budget.amount));
  }

  const rows = accounts.map((account) => {
    const current = entries
      .filter((entry) => entry.account_id === account.id && inPeriod(entry.source_date, periodFrom, periodTo))
      .reduce((sum, entry) => sum + entry.amount, 0);
    const comparison = entries
      .filter((entry) => entry.account_id === account.id && inPeriod(entry.source_date, comparisonFrom, comparisonTo))
      .reduce((sum, entry) => sum + entry.amount, 0);
    const budget = budgetByAccount.get(account.id) ?? 0;
    const variance = current - comparison;
    const variancePercentage = comparison === 0 ? null : (variance / Math.abs(comparison)) * 100;
    const incomeGroup = account.account_group === "revenue" || account.account_group === "other_income";
    const budgetVariance = incomeGroup ? current - budget : budget - current;
    return {
      ...account,
      current: decimal(current),
      comparison: decimal(comparison),
      variance: decimal(variance),
      variance_percentage: variancePercentage === null ? null : decimal(variancePercentage),
      budget: decimal(budget),
      budget_variance: decimal(budgetVariance),
    };
  });

  const groupTotal = (group: AccountGroup, field: "current" | "comparison" | "budget") =>
    rows.filter((row) => row.account_group === group).reduce((sum, row) => sum + decimal(row[field]), 0);

  const summaryFor = (field: "current" | "comparison" | "budget") => {
    const revenue = groupTotal("revenue", field);
    const costOfSales = groupTotal("cost_of_sales", field);
    const operatingExpenses = groupTotal("operating_expense", field);
    const otherIncome = groupTotal("other_income", field);
    const otherExpenses = groupTotal("other_expense", field);
    const grossProfit = revenue - costOfSales;
    const operatingProfit = grossProfit - operatingExpenses;
    const netProfit = operatingProfit + otherIncome - otherExpenses;
    return {
      revenue: decimal(revenue),
      cost_of_sales: decimal(costOfSales),
      gross_profit: decimal(grossProfit),
      operating_expenses: decimal(operatingExpenses),
      operating_profit: decimal(operatingProfit),
      other_income: decimal(otherIncome),
      other_expenses: decimal(otherExpenses),
      net_profit: decimal(netProfit),
      gross_margin_percentage: revenue === 0 ? 0 : decimal((grossProfit / revenue) * 100),
      net_margin_percentage: revenue === 0 ? 0 : decimal((netProfit / revenue) * 100),
    };
  };

  return {
    company: companyResult.data,
    period: { from: periodFrom, to: periodTo },
    comparison_period: { from: comparisonFrom, to: comparisonTo },
    accounts,
    mappings,
    budgets: budgetsResult.data ?? [],
    manual_entries: manualResult.data ?? [],
    rows,
    current: summaryFor("current"),
    comparison: summaryFor("comparison"),
    budget: summaryFor("budget"),
    ledger: entries
      .filter((entry) => inPeriod(entry.source_date, periodFrom, periodTo))
      .sort((a, b) => b.source_date.localeCompare(a.source_date) || b.key.localeCompare(a.key)),
  };
}

export async function GET(request: NextRequest) {
  const session = await administratorSession();
  if (!session) return failure("Administrator access is required.", 403);
  const admin = createAdminClient();

  const companyId = integer(request.nextUrl.searchParams.get("company_id"));
  const periodFrom = validDate(request.nextUrl.searchParams.get("from"));
  const periodTo = validDate(request.nextUrl.searchParams.get("to"));
  const comparisonFrom = validDate(request.nextUrl.searchParams.get("comparison_from"));
  const comparisonTo = validDate(request.nextUrl.searchParams.get("comparison_to"));

  if (companyId && periodFrom && periodTo && comparisonFrom && comparisonTo) {
    try {
      const report = await buildReport(admin, companyId, periodFrom, periodTo, comparisonFrom, comparisonTo);
      return NextResponse.json({ report });
    } catch (error) {
      console.error("Profit & Loss report error", error);
      return failure(error instanceof Error ? error.message : "Unable to prepare the P&L report.", 500);
    }
  }

  const [companies, accounts, mappings, budgets, manualEntries] = await Promise.all([
    admin.from("companies").select("id,name,status,base_currency,address,company_address,uen,gst_no,logo_path").order("name"),
    admin.from("pl_accounts").select("*").order("company_id").order("sort_order").order("account_code"),
    admin.from("pl_source_mappings").select("*").order("company_id").order("priority").order("id"),
    admin.from("pl_budgets").select("*").order("budget_month", { ascending: false }).order("id", { ascending: false }),
    admin.from("pl_manual_entries").select("*").order("entry_date", { ascending: false }).order("id", { ascending: false }),
  ]);
  const error = companies.error ?? accounts.error ?? mappings.error ?? budgets.error ?? manualEntries.error;
  if (error) return failure(error.message, 500);
  return NextResponse.json({
    companies: companies.data ?? [],
    accounts: accounts.data ?? [],
    mappings: mappings.data ?? [],
    budgets: budgets.data ?? [],
    manual_entries: manualEntries.data ?? [],
  });
}

export async function POST(request: Request) {
  const session = await administratorSession();
  if (!session) return failure("Administrator access is required.", 403);
  let body: Payload;
  try {
    body = await request.json();
  } catch {
    return failure("Invalid request body.");
  }

  const admin = createAdminClient();
  const companyId = integer(body.company_id);

  try {
    if (body.action === "save_account") {
      if (!companyId) return failure("Company is required.");
      const code = clean(body.account_code);
      const name = clean(body.account_name);
      const group = body.account_group ?? "operating_expense";
      if (!code || !name) return failure("Account code and name are required.");
      if (!["revenue", "cost_of_sales", "operating_expense", "other_income", "other_expense"].includes(group)) {
        return failure("Invalid account group.");
      }
      const record = {
        company_id: companyId,
        account_code: code,
        account_name: name,
        account_group: group,
        is_active: body.is_active !== false,
        sort_order: Math.round(Number(body.sort_order ?? 100)),
        description: clean(body.description),
        updated_by: session.user.id,
      };
      const id = integer(body.id);
      const result = id
        ? await admin.from("pl_accounts").update(record).eq("id", id).eq("company_id", companyId).select("*").single()
        : await admin.from("pl_accounts").insert({ ...record, created_by: session.user.id }).select("*").single();
      if (result.error) return failure(result.error.message, 500);
      return NextResponse.json({ account: result.data });
    }

    if (body.action === "save_mapping") {
      const accountId = integer(body.account_id);
      if (!companyId || !accountId) return failure("Company and P&L account are required.");
      const sourceType = clean(body.source_type) ?? "manual";
      if (!["customer_invoice", "supplier_bill", "driver_payout", "bank_cashbook", "manual"].includes(sourceType)) {
        return failure("Invalid source type.");
      }
      const { data: account } = await admin.from("pl_accounts").select("company_id").eq("id", accountId).maybeSingle();
      if (!account || Number(account.company_id) !== companyId) return failure("Account does not belong to the selected company.");
      const record = {
        company_id: companyId,
        source_type: sourceType,
        source_category: clean(body.source_category) ?? "*",
        account_id: accountId,
        priority: Math.round(Number(body.priority ?? 100)),
        is_active: body.is_active !== false,
        notes: clean(body.notes),
        updated_by: session.user.id,
      };
      const id = integer(body.id);
      const result = id
        ? await admin.from("pl_source_mappings").update(record).eq("id", id).eq("company_id", companyId).select("*").single()
        : await admin.from("pl_source_mappings").insert({ ...record, created_by: session.user.id }).select("*").single();
      if (result.error) return failure(result.error.message, 500);
      return NextResponse.json({ mapping: result.data });
    }

    if (body.action === "delete_mapping") {
      const id = integer(body.id);
      if (!id || !companyId) return failure("Mapping is required.");
      const { error } = await admin.from("pl_source_mappings").delete().eq("id", id).eq("company_id", companyId);
      if (error) return failure(error.message, 500);
      return NextResponse.json({ success: true });
    }

    if (body.action === "save_budget") {
      const accountId = integer(body.account_id);
      const budgetMonth = validDate(body.budget_month);
      if (!companyId || !accountId || !budgetMonth) return failure("Company, account and budget month are required.");
      const { data: account } = await admin.from("pl_accounts").select("company_id").eq("id", accountId).maybeSingle();
      if (!account || Number(account.company_id) !== companyId) return failure("Account does not belong to the selected company.");
      const month = `${budgetMonth.slice(0, 7)}-01`;
      const { data, error } = await admin
        .from("pl_budgets")
        .upsert(
          {
            company_id: companyId,
            account_id: accountId,
            budget_month: month,
            amount: Math.max(decimal(body.amount), 0),
            notes: clean(body.notes),
            created_by: session.user.id,
            updated_by: session.user.id,
          },
          { onConflict: "company_id,account_id,budget_month" },
        )
        .select("*")
        .single();
      if (error) return failure(error.message, 500);
      return NextResponse.json({ budget: data });
    }

    if (body.action === "save_manual_entry") {
      const accountId = integer(body.account_id);
      const entryDate = validDate(body.entry_date);
      const description = clean(body.description);
      if (!companyId || !accountId || !entryDate || !description) {
        return failure("Company, account, date and description are required.");
      }
      const { data: account } = await admin.from("pl_accounts").select("company_id").eq("id", accountId).maybeSingle();
      if (!account || Number(account.company_id) !== companyId) return failure("Account does not belong to the selected company.");
      const amount = Math.abs(decimal(body.amount));
      if (amount <= 0) return failure("Amount must be greater than zero.");
      const { data, error } = await admin
        .from("pl_manual_entries")
        .insert({
          company_id: companyId,
          account_id: accountId,
          entry_date: entryDate,
          description,
          reference: clean(body.reference),
          direction: body.direction === "decrease" ? "decrease" : "increase",
          amount,
          notes: clean(body.notes),
          created_by: session.user.id,
          updated_by: session.user.id,
        })
        .select("*")
        .single();
      if (error) return failure(error.message, 500);
      return NextResponse.json({ entry: data });
    }

    if (body.action === "void_manual_entry") {
      const id = integer(body.id);
      const reason = clean(body.reason);
      if (!id || !reason) return failure("Posted entry and void reason are required.");
      const { data, error } = await session.supabase.rpc("void_pl_manual_entry", {
        p_entry_id: id,
        p_reason: reason,
      });
      if (error) return failure(error.message, 500);
      return NextResponse.json({ entry: data });
    }

    if (body.action === "classify_source") {
      const sourceId = integer(body.source_id);
      const accountId = integer(body.account_id);
      const sourceType = clean(body.source_type);
      if (!companyId || !sourceId || !accountId || !sourceType) return failure("Source and P&L account are required.");
      const tables: Record<string, string> = {
        customer_invoice: "customer_invoices",
        supplier_bill: "supplier_bills",
        driver_payout: "driver_payouts",
        bank_cashbook: "bank_cashbook_entries",
      };
      const table = tables[sourceType];
      if (!table) return failure("This source cannot be classified directly.");
      const [{ data: account }, { data: source }] = await Promise.all([
        admin.from("pl_accounts").select("company_id").eq("id", accountId).maybeSingle(),
        admin.from(table).select("company_id").eq("id", sourceId).maybeSingle(),
      ]);
      if (!account || Number(account.company_id) !== companyId) return failure("Account does not belong to the selected company.");
      if (!source || Number(source.company_id) !== companyId) return failure("Source does not belong to the selected company.");
      const { error } = await admin.from(table).update({ pl_account_id: accountId }).eq("id", sourceId);
      if (error) return failure(error.message, 500);
      return NextResponse.json({ success: true });
    }

    return failure("Unknown action.");
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Unable to update Profit & Loss data.", 500);
  }
}
