import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { buildBalanceSheet, buildCashFlow } from "@/lib/finance-reporting";

export const dynamic = "force-dynamic";

type Payload = {
  action?: "create_period" | "close_period" | "reopen_period" | "save_permission";
  id?: number;
  company_id?: number;
  period_name?: string;
  period_from?: string;
  period_to?: string;
  notes?: string;
  reason?: string;
  force?: boolean;
  role_name?: "administrator" | "finance" | "viewer" | "user";
  module_name?: string;
  can_view?: boolean;
  can_create?: boolean;
  can_edit?: boolean;
  can_approve?: boolean;
};

type HealthCheck = {
  key: string;
  title: string;
  status: "pass" | "warning" | "error" | "info";
  value: string | number;
  description: string;
  href?: string;
};

const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const integer = (value: unknown) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const dateValue = (value: unknown) => {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};
const text = (value: unknown) => String(value ?? "").trim();
const decimal = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
};

async function administratorSession() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
  if (profile?.role !== "administrator" || profile.status !== "active") return null;
  return { supabase, user };
}

function previousPeriod(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const length = Math.max(Math.round((end.getTime() - start.getTime()) / 86400000) + 1, 1);
  const previousEnd = new Date(start.getTime() - 86400000);
  const previousStart = new Date(previousEnd.getTime() - (length - 1) * 86400000);
  const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { from: iso(previousStart), to: iso(previousEnd) };
}

async function buildHealth(admin: ReturnType<typeof createAdminClient>, companyId: number, from: string, to: string) {
  const comparison = previousPeriod(from, to);
  const [
    balanceSheet,
    cashFlow,
    invoices,
    bills,
    customerPayments,
    supplierPayments,
    statementLines,
    statementBatches,
    gstPeriods,
    bsSnapshots,
    cfSnapshots,
    company,
  ] = await Promise.all([
    buildBalanceSheet(admin, companyId, to),
    buildCashFlow(admin, companyId, from, to, comparison.from, comparison.to),
    admin.from("customer_invoices").select("id,total_amount,amount_paid,status,due_date").eq("company_id", companyId).in("status", ["issued", "partial", "overdue"]),
    admin.from("supplier_bills").select("id,total_amount,amount_paid,credit_applied,status,due_date").eq("company_id", companyId).in("status", ["open", "partial", "overdue"]),
    admin.from("customer_payments").select("id,unallocated_amount").eq("company_id", companyId).eq("status", "posted"),
    admin.from("supplier_payments").select("id,unallocated_amount").eq("company_id", companyId).eq("status", "posted"),
    admin.from("bank_statement_lines").select("id", { count: "exact" }).eq("company_id", companyId).in("match_status", ["unmatched", "partial"]).gte("transaction_date", from).lte("transaction_date", to),
    admin.from("bank_statement_batches").select("id", { count: "exact" }).eq("company_id", companyId).eq("status", "draft").gte("period_to", from).lte("period_from", to),
    admin.from("gst_filing_periods").select("id,status,period_from,period_to").eq("company_id", companyId).gte("period_to", from).lte("period_from", to),
    admin.from("bs_report_snapshots").select("id,status,as_of_date").eq("company_id", companyId).eq("as_of_date", to).maybeSingle(),
    admin.from("cash_flow_report_snapshots").select("id,status,period_from,period_to").eq("company_id", companyId).eq("period_from", from).eq("period_to", to).maybeSingle(),
    admin.from("companies").select("*").eq("id", companyId).maybeSingle(),
  ]);
  const queryResults = [invoices, bills, customerPayments, supplierPayments, statementLines, statementBatches, gstPeriods, bsSnapshots, cfSnapshots, company];
  const error = queryResults.find((result) => result.error)?.error;
  if (error) throw new Error(error.message);

  const overdueReceivables = (invoices.data ?? []).filter((row) => row.due_date && row.due_date < to).length;
  const overduePayables = (bills.data ?? []).filter((row) => row.due_date && row.due_date < to).length;
  const unallocatedCustomer = (customerPayments.data ?? []).reduce((sum, row) => sum + decimal(row.unallocated_amount), 0);
  const unallocatedSupplier = (supplierPayments.data ?? []).reduce((sum, row) => sum + decimal(row.unallocated_amount), 0);
  const draftGst = (gstPeriods.data ?? []).filter((row) => row.status === "draft").length;
  const companyData = company.data as Record<string, unknown> | null;
  const missingProfile = !companyData?.uen || !(companyData?.address || companyData?.company_address);

  const checks: HealthCheck[] = [
    {
      key: "balance_sheet",
      title: "Balance Sheet equation",
      status: Math.abs(balanceSheet.summary.variance) <= 0.01 ? "pass" : "error",
      value: balanceSheet.summary.variance,
      description: Math.abs(balanceSheet.summary.variance) <= 0.01 ? "Assets equal liabilities plus equity." : "Opening capital, loans, fixed assets or manual balances require review.",
      href: "/balance-sheet",
    },
    {
      key: "cash_flow",
      title: "Cash Flow reconciliation",
      status: Math.abs(cashFlow.summary.reconciliation_difference) <= 0.01 ? "pass" : "error",
      value: cashFlow.summary.reconciliation_difference,
      description: Math.abs(cashFlow.summary.reconciliation_difference) <= 0.01 ? "Cash Flow reconciles to closing cash." : "Review excluded transfers and transaction classifications.",
      href: "/cash-flow",
    },
    {
      key: "bank_lines",
      title: "Unmatched bank lines",
      status: (statementLines.count ?? 0) === 0 ? "pass" : "error",
      value: statementLines.count ?? 0,
      description: "Unmatched or partially matched statement lines inside the selected period.",
      href: "/bank-reconciliation",
    },
    {
      key: "bank_batches",
      title: "Draft bank reconciliations",
      status: (statementBatches.count ?? 0) === 0 ? "pass" : "warning",
      value: statementBatches.count ?? 0,
      description: "Statement batches overlapping this period that are not completed.",
      href: "/bank-reconciliation",
    },
    {
      key: "gst",
      title: "GST filing readiness",
      status: draftGst === 0 ? "pass" : "error",
      value: draftGst,
      description: "Draft GST periods overlapping the selected financial period.",
      href: "/gst-reports",
    },
    {
      key: "receivables",
      title: "Overdue receivables",
      status: overdueReceivables === 0 ? "pass" : "warning",
      value: overdueReceivables,
      description: "Customer invoices currently overdue. Outstanding items remain valid at period close.",
      href: "/receivables",
    },
    {
      key: "payables",
      title: "Overdue payables",
      status: overduePayables === 0 ? "pass" : "warning",
      value: overduePayables,
      description: "Supplier bills currently overdue. Outstanding items remain valid at period close.",
      href: "/payables",
    },
    {
      key: "customer_credit",
      title: "Unallocated customer credit",
      status: Math.abs(unallocatedCustomer) <= 0.01 ? "pass" : "info",
      value: decimal(unallocatedCustomer),
      description: "Posted customer receipts not yet allocated to invoices.",
      href: "/receivables",
    },
    {
      key: "supplier_advance",
      title: "Unallocated supplier advances",
      status: Math.abs(unallocatedSupplier) <= 0.01 ? "pass" : "info",
      value: decimal(unallocatedSupplier),
      description: "Posted supplier payments not yet allocated to bills.",
      href: "/payables",
    },
    {
      key: "bs_snapshot",
      title: "Balance Sheet snapshot",
      status: bsSnapshots.data?.status === "final" ? "pass" : "warning",
      value: bsSnapshots.data?.status ?? "missing",
      description: "Final Balance Sheet snapshot for the period end date.",
      href: "/balance-sheet",
    },
    {
      key: "cf_snapshot",
      title: "Cash Flow snapshot",
      status: cfSnapshots.data?.status === "final" ? "pass" : "warning",
      value: cfSnapshots.data?.status ?? "missing",
      description: "Final Cash Flow snapshot for the selected period.",
      href: "/cash-flow",
    },
    {
      key: "company_profile",
      title: "Company profile completeness",
      status: missingProfile ? "warning" : "pass",
      value: missingProfile ? "Incomplete" : "Complete",
      description: "Company name, address and registration information used on reports.",
      href: "/companies",
    },
  ];

  return { checks, balance_sheet: balanceSheet, cash_flow: cashFlow };
}

async function exportBackup(admin: ReturnType<typeof createAdminClient>, companyId: number) {
  const companyResult = await admin.from("companies").select("*").eq("id", companyId).maybeSingle();
  if (companyResult.error) throw new Error(companyResult.error.message);
  if (!companyResult.data) throw new Error("Company was not found.");

  const companyTables = [
    "user_company_access", "drivers", "driver_company_links", "driver_customer_links", "driver_signup_links",
    "driver_signup_applications", "driver_jobs", "driver_payouts", "customers", "customer_invoices",
    "customer_payments", "quotations", "company_payment_gateways", "limousine_vehicle_types",
    "limousine_rate_cards", "limousine_extra_charge_rules", "customer_limousine_rates", "suppliers",
    "supplier_bills", "supplier_payments", "supplier_credit_notes", "bank_accounts",
    "bank_statement_batches", "bank_statement_lines", "bank_cashbook_entries", "gst_tax_codes",
    "gst_adjustments", "gst_filing_periods", "pl_accounts", "pl_source_mappings", "pl_budgets",
    "pl_manual_entries", "bs_accounts", "bs_manual_entries", "bs_report_snapshots", "cash_flow_mappings",
    "cash_flow_report_snapshots", "finance_periods", "finance_audit_events",
  ];
  const tables: Record<string, unknown[]> = {};
  const warnings: string[] = [];

  for (const table of companyTables) {
    const { data, error } = await admin.from(table).select("*").eq("company_id", companyId).limit(100000);
    if (error) warnings.push(`${table}: ${error.message}`);
    else tables[table] = data ?? [];
  }

  const dependentTables: Array<{
    table: string;
    foreignKey: string;
    parentTable: string;
  }> = [
    { table: "customer_invoice_items", foreignKey: "invoice_id", parentTable: "customer_invoices" },
    { table: "customer_payment_allocations", foreignKey: "payment_id", parentTable: "customer_payments" },
    { table: "quotation_items", foreignKey: "quotation_id", parentTable: "quotations" },
    { table: "driver_payout_items", foreignKey: "payout_id", parentTable: "driver_payouts" },
    { table: "supplier_bill_items", foreignKey: "bill_id", parentTable: "supplier_bills" },
    { table: "supplier_payment_allocations", foreignKey: "payment_id", parentTable: "supplier_payments" },
    { table: "supplier_credit_allocations", foreignKey: "credit_note_id", parentTable: "supplier_credit_notes" },
    { table: "bank_reconciliation_matches", foreignKey: "statement_line_id", parentTable: "bank_statement_lines" },
    { table: "gst_period_entries", foreignKey: "period_id", parentTable: "gst_filing_periods" },
  ];

  for (const dependent of dependentTables) {
    const parentIds = (tables[dependent.parentTable] ?? [])
      .map((row) => Number((row as { id?: unknown }).id))
      .filter((id) => Number.isInteger(id) && id > 0);
    if (parentIds.length === 0) {
      tables[dependent.table] = [];
      continue;
    }
    const { data, error } = await admin
      .from(dependent.table)
      .select("*")
      .in(dependent.foreignKey, parentIds)
      .limit(100000);
    if (error) warnings.push(`${dependent.table}: ${error.message}`);
    else tables[dependent.table] = data ?? [];
  }

  const permissionResult = await admin.from("finance_module_permissions").select("*").order("role_name").order("module_name");
  if (permissionResult.error) warnings.push(`finance_module_permissions: ${permissionResult.error.message}`);
  else tables.finance_module_permissions = permissionResult.data ?? [];

  return {
    backup_format: "A3_FINANCE_JSON_V1",
    generated_at: new Date().toISOString(),
    company: companyResult.data,
    tables,
    warnings,
  };
}

export async function GET(request: NextRequest) {
  const session = await administratorSession();
  if (!session) return fail("Administrator access is required.", 403);
  const companyId = integer(request.nextUrl.searchParams.get("company_id"));
  const mode = request.nextUrl.searchParams.get("mode");
  const from = dateValue(request.nextUrl.searchParams.get("from"));
  const to = dateValue(request.nextUrl.searchParams.get("to"));

  try {
    const admin = createAdminClient();
    if (mode === "backup") {
      if (!companyId) return fail("Company is required.");
      const backup = await exportBackup(admin, companyId);
      const companyName = String((backup.company as Record<string, unknown>).name ?? "company").replace(/[^A-Za-z0-9_-]+/g, "-");
      return new NextResponse(JSON.stringify(backup, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="A3-Finance-${companyName}-${new Date().toISOString().slice(0, 10)}.json"`,
        },
      });
    }

    const [companies, periods, permissions, auditEvents] = await Promise.all([
      admin.from("companies").select("id,name,status,base_currency,company_type").order("name"),
      admin.from("finance_periods").select("*").order("period_to", { ascending: false }).order("id", { ascending: false }).limit(250),
      admin.from("finance_module_permissions").select("*").order("role_name").order("module_name"),
      admin.from("finance_audit_events").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    const error = companies.error ?? periods.error ?? permissions.error ?? auditEvents.error;
    if (error) return fail(error.message, 500);

    let health: Awaited<ReturnType<typeof buildHealth>> | null = null;
    if (companyId && from && to) health = await buildHealth(admin, companyId, from, to);
    const modules = [
      { phase: 1, name: "Foundation and Multi-Company", href: "/companies", status: "complete" },
      { phase: 2, name: "Client Contract Rates", href: "/client-rates", status: "complete" },
      { phase: 3, name: "Accounts Receivable", href: "/receivables", status: "complete" },
      { phase: 4, name: "Accounts Payable", href: "/payables", status: "complete" },
      { phase: 5, name: "Bank Reconciliation", href: "/bank-reconciliation", status: "complete" },
      { phase: 6, name: "GST Reports", href: "/gst-reports", status: "complete" },
      { phase: 7, name: "Profit and Loss", href: "/profit-loss", status: "complete" },
      { phase: 8, name: "Balance Sheet", href: "/balance-sheet", status: "complete" },
      { phase: 9, name: "Cash Flow Statement", href: "/cash-flow", status: "complete" },
      { phase: 10, name: "Financial Control and Close", href: "/financial-control", status: "complete" },
      { phase: 11, name: "Driver Network and Recruitment", href: "/driver-network", status: "complete" },
    ];
    return NextResponse.json({
      companies: companies.data ?? [],
      periods: periods.data ?? [],
      permissions: permissions.data ?? [],
      audit_events: auditEvents.data ?? [],
      modules,
      health,
    });
  } catch (error) {
    console.error("Financial Control API error", error);
    return fail(error instanceof Error ? error.message : "Unable to load Financial Control.", 500);
  }
}

export async function POST(request: NextRequest) {
  const session = await administratorSession();
  if (!session) return fail("Administrator access is required.", 403);
  let body: Payload;
  try { body = await request.json() as Payload; } catch { return fail("Invalid request body."); }
  const admin = createAdminClient();

  try {
    if (body.action === "create_period") {
      const companyId = integer(body.company_id);
      const from = dateValue(body.period_from);
      const to = dateValue(body.period_to);
      if (!companyId || !from || !to || to < from) return fail("Company and valid period dates are required.");
      const { data: overlaps, error: overlapError } = await admin.from("finance_periods").select("id,period_name,period_from,period_to").eq("company_id", companyId).lte("period_from", to).gte("period_to", from);
      if (overlapError) return fail(overlapError.message, 500);
      if ((overlaps ?? []).length > 0) return fail("This period overlaps an existing financial period.");
      const { data, error } = await admin.from("finance_periods").insert({
        company_id: companyId,
        period_name: text(body.period_name) || `${from} to ${to}`,
        period_from: from,
        period_to: to,
        close_notes: text(body.notes) || null,
        created_by: session.user.id,
      }).select("id").single();
      if (error || !data) return fail(error?.message ?? "Unable to create the financial period.", 500);
      await admin.from("finance_audit_events").insert({ company_id: companyId, event_type: "period_created", module_name: "financial_control", target_table: "finance_periods", target_id: String(data.id), description: "Financial period created.", actor_user_id: session.user.id });
      return NextResponse.json({ success: true, id: data.id });
    }

    if (body.action === "close_period") {
      const id = integer(body.id);
      if (!id) return fail("Financial period is required.");
      const { data: period, error: periodError } = await admin.from("finance_periods").select("*").eq("id", id).maybeSingle();
      if (periodError) return fail(periodError.message, 500);
      if (!period || period.status !== "open") return fail("Open financial period was not found.");
      const health = await buildHealth(admin, Number(period.company_id), String(period.period_from), String(period.period_to));
      const blockers = health.checks.filter((check) => check.status === "error");
      if (blockers.length > 0 && !body.force) {
        return NextResponse.json({ error: "Resolve critical checks or use controlled override to close this period.", blockers }, { status: 409 });
      }
      if (body.force && !text(body.reason)) return fail("An override reason is required for forced period close.");
      const closeNotes = [text(body.notes), body.force ? `Controlled override: ${text(body.reason)}` : ""].filter(Boolean).join("\n");
      const { data, error } = await admin.from("finance_periods").update({
        status: "closed",
        close_notes: closeNotes || null,
        closed_by: session.user.id,
        closed_at: new Date().toISOString(),
        reopened_by: null,
        reopened_at: null,
        reopened_reason: null,
      }).eq("id", id).eq("status", "open").select("id").single();
      if (error || !data) return fail(error?.message ?? "Unable to close the financial period.", 500);
      await admin.from("finance_audit_events").insert({ company_id: period.company_id, event_type: body.force ? "period_force_closed" : "period_closed", module_name: "financial_control", target_table: "finance_periods", target_id: String(id), description: body.force ? "Financial period closed with controlled override." : "Financial period closed.", details: { blockers, reason: text(body.reason) || null }, actor_user_id: session.user.id });
      return NextResponse.json({ success: true, blockers });
    }

    if (body.action === "reopen_period") {
      const id = integer(body.id);
      if (!id || !text(body.reason)) return fail("Financial period and reopen reason are required.");
      const { data, error } = await admin.from("finance_periods").update({
        status: "open",
        reopened_by: session.user.id,
        reopened_at: new Date().toISOString(),
        reopened_reason: text(body.reason),
      }).eq("id", id).eq("status", "closed").select("company_id").single();
      if (error || !data) return fail(error?.message ?? "Unable to reopen the financial period.", 500);
      await admin.from("finance_audit_events").insert({ company_id: data.company_id, event_type: "period_reopened", module_name: "financial_control", target_table: "finance_periods", target_id: String(id), description: "Financial period reopened.", details: { reason: text(body.reason) }, actor_user_id: session.user.id });
      return NextResponse.json({ success: true });
    }

    if (body.action === "save_permission") {
      if (!body.role_name || !text(body.module_name)) return fail("Role and module are required.");
      if (body.role_name === "administrator") return fail("Administrator permissions are permanently unrestricted.");
      const { data, error } = await admin.from("finance_module_permissions").upsert({
        role_name: body.role_name,
        module_name: text(body.module_name).toLowerCase(),
        can_view: Boolean(body.can_view),
        can_create: Boolean(body.can_create),
        can_edit: Boolean(body.can_edit),
        can_approve: Boolean(body.can_approve),
        updated_by: session.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "role_name,module_name" }).select("id").single();
      if (error || !data) return fail(error?.message ?? "Unable to save module permissions.", 500);
      await admin.from("finance_audit_events").insert({ event_type: "permission_updated", module_name: "financial_control", target_table: "finance_module_permissions", target_id: String(data.id), description: "Finance module permission updated.", details: { role_name: body.role_name, module_name: text(body.module_name) }, actor_user_id: session.user.id });
      return NextResponse.json({ success: true, id: data.id });
    }

    return fail("Unknown action.");
  } catch (error) {
    console.error("Financial Control write error", error);
    return fail(error instanceof Error ? error.message : "Unable to update Financial Control.", 500);
  }
}
