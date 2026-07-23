import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { buildCashFlow, type CashFlowActivity } from "@/lib/finance-reporting";

export const dynamic = "force-dynamic";

type Payload = {
  action?: "save_mapping" | "delete_mapping" | "classify_entry" | "clear_classification" | "save_snapshot" | "finalise_snapshot" | "reopen_snapshot";
  id?: number;
  company_id?: number;
  source_type?: string;
  entry_type?: string;
  activity?: CashFlowActivity;
  line_name?: string;
  priority?: number;
  is_active?: boolean;
  notes?: string;
  reason?: string;
  from?: string;
  to?: string;
  comparison_from?: string;
  comparison_to?: string;
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
const validActivities = new Set<CashFlowActivity>(["operating", "investing", "financing", "excluded"]);

async function administratorSession() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
  if (profile?.role !== "administrator" || profile.status !== "active") return null;
  return { supabase, user };
}

async function audit(admin: ReturnType<typeof createAdminClient>, companyId: number, userId: string, eventType: string, description: string, details: Record<string, unknown>) {
  await admin.from("finance_audit_events").insert({ company_id: companyId, event_type: eventType, module_name: "cash_flow", description, details, actor_user_id: userId });
}

export async function GET(request: NextRequest) {
  const session = await administratorSession();
  if (!session) return fail("Administrator access is required.", 403);
  const companyId = integer(request.nextUrl.searchParams.get("company_id"));
  const from = dateValue(request.nextUrl.searchParams.get("from"));
  const to = dateValue(request.nextUrl.searchParams.get("to"));
  const comparisonFrom = dateValue(request.nextUrl.searchParams.get("comparison_from"));
  const comparisonTo = dateValue(request.nextUrl.searchParams.get("comparison_to"));
  try {
    const admin = createAdminClient();
    if (!companyId || !from || !to || !comparisonFrom || !comparisonTo) {
      const [companies, mappings, snapshots] = await Promise.all([
        admin.from("companies").select("id,name,status,base_currency,company_type").order("name"),
        admin.from("cash_flow_mappings").select("*").order("company_id").order("priority").order("id"),
        admin.from("cash_flow_report_snapshots").select("*").order("period_to", { ascending: false }).limit(200),
      ]);
      const error = companies.error ?? mappings.error ?? snapshots.error;
      if (error) return fail(error.message, 500);
      return NextResponse.json({ companies: companies.data ?? [], mappings: mappings.data ?? [], snapshots: snapshots.data ?? [] });
    }
    if (to < from || comparisonTo < comparisonFrom) return fail("Report period dates are invalid.");
    const report = await buildCashFlow(admin, companyId, from, to, comparisonFrom, comparisonTo);
    return NextResponse.json({ report });
  } catch (error) {
    console.error("Cash Flow API error", error);
    return fail(error instanceof Error ? error.message : "Unable to prepare the Cash Flow Statement.", 500);
  }
}

export async function POST(request: NextRequest) {
  const session = await administratorSession();
  if (!session) return fail("Administrator access is required.", 403);
  let body: Payload;
  try { body = await request.json() as Payload; } catch { return fail("Invalid request body."); }
  const admin = createAdminClient();
  const companyId = integer(body.company_id);

  try {
    if (body.action === "save_mapping") {
      if (!companyId || !body.activity || !validActivities.has(body.activity) || !text(body.line_name)) return fail("Company, activity and line name are required.");
      const id = integer(body.id);
      const record = {
        company_id: companyId,
        source_type: text(body.source_type).toLowerCase() || "*",
        entry_type: text(body.entry_type).toLowerCase() || "*",
        activity: body.activity,
        line_name: text(body.line_name),
        priority: Number(body.priority ?? 100),
        is_active: body.is_active !== false,
        notes: text(body.notes) || null,
        updated_by: session.user.id,
      };
      const query = id
        ? admin.from("cash_flow_mappings").update(record).eq("id", id).eq("company_id", companyId)
        : admin.from("cash_flow_mappings").insert({ ...record, created_by: session.user.id });
      const { data, error } = await query.select("id").single();
      if (error || !data) return fail(error?.message ?? "Unable to save the cash-flow mapping.", 500);
      await audit(admin, companyId, session.user.id, id ? "cash_flow_mapping_updated" : "cash_flow_mapping_created", "Cash-flow mapping saved.", { mapping_id: data.id });
      return NextResponse.json({ success: true, id: data.id });
    }

    if (body.action === "delete_mapping") {
      const id = integer(body.id);
      if (!companyId || !id) return fail("Company and mapping are required.");
      const { error } = await admin.from("cash_flow_mappings").delete().eq("id", id).eq("company_id", companyId);
      if (error) return fail(error.message, 500);
      await audit(admin, companyId, session.user.id, "cash_flow_mapping_deleted", "Cash-flow mapping deleted.", { mapping_id: id });
      return NextResponse.json({ success: true });
    }

    if (["classify_entry", "clear_classification"].includes(String(body.action))) {
      const id = integer(body.id);
      if (!companyId || !id) return fail("Company and cash-book entry are required.");
      if (body.action === "classify_entry" && (!body.activity || !validActivities.has(body.activity) || !text(body.line_name))) {
        return fail("Activity and line name are required.");
      }
      const { error } = await admin.from("bank_cashbook_entries").update({
        cash_flow_activity: body.action === "clear_classification" ? null : body.activity,
        cash_flow_line: body.action === "clear_classification" ? null : text(body.line_name),
      }).eq("id", id).eq("company_id", companyId);
      if (error) return fail(error.message, 500);
      await audit(admin, companyId, session.user.id, body.action === "clear_classification" ? "cash_flow_classification_cleared" : "cash_flow_entry_classified", body.action === "clear_classification" ? "Cash-flow classification cleared." : "Cash-book entry classified for Cash Flow.", { entry_id: id, activity: body.activity, line_name: text(body.line_name) });
      return NextResponse.json({ success: true });
    }

    if (["save_snapshot", "finalise_snapshot"].includes(String(body.action))) {
      const from = dateValue(body.from);
      const to = dateValue(body.to);
      const comparisonFrom = dateValue(body.comparison_from) ?? from;
      const comparisonTo = dateValue(body.comparison_to) ?? to;
      if (!companyId || !from || !to || !comparisonFrom || !comparisonTo) return fail("Company and report dates are required.");
      const report = await buildCashFlow(admin, companyId, from, to, comparisonFrom, comparisonTo);
      const final = body.action === "finalise_snapshot";
      if (final && Math.abs(report.summary.reconciliation_difference) > 0.01) return fail("Cash Flow must reconcile before finalisation.");
      const { data, error } = await admin.from("cash_flow_report_snapshots").upsert({
        company_id: companyId,
        period_from: from,
        period_to: to,
        status: final ? "final" : "draft",
        operating_cash: report.summary.operating_cash,
        investing_cash: report.summary.investing_cash,
        financing_cash: report.summary.financing_cash,
        net_cash_change: report.summary.net_cash_change,
        opening_cash: report.summary.opening_cash,
        closing_cash: report.summary.closing_cash,
        reconciliation_difference: report.summary.reconciliation_difference,
        report_data: report,
        notes: text(body.notes) || null,
        finalised_by: final ? session.user.id : null,
        finalised_at: final ? new Date().toISOString() : null,
        created_by: session.user.id,
      }, { onConflict: "company_id,period_from,period_to" }).select("id").single();
      if (error || !data) return fail(error?.message ?? "Unable to save the Cash Flow snapshot.", 500);
      await audit(admin, companyId, session.user.id, final ? "cash_flow_snapshot_finalised" : "cash_flow_snapshot_saved", final ? "Cash Flow snapshot finalised." : "Cash Flow snapshot saved.", { snapshot_id: data.id, period_from: from, period_to: to });
      return NextResponse.json({ success: true, id: data.id });
    }

    if (body.action === "reopen_snapshot") {
      const id = integer(body.id);
      if (!id || !text(body.reason)) return fail("Snapshot and reopen reason are required.");
      const { data, error } = await admin.from("cash_flow_report_snapshots").update({ status: "draft", finalised_by: null, finalised_at: null, notes: text(body.notes) || `Reopened: ${text(body.reason)}` }).eq("id", id).select("company_id").single();
      if (error || !data) return fail(error?.message ?? "Unable to reopen the Cash Flow snapshot.", 500);
      await audit(admin, Number(data.company_id), session.user.id, "cash_flow_snapshot_reopened", "Cash Flow snapshot reopened.", { snapshot_id: id, reason: text(body.reason) });
      return NextResponse.json({ success: true });
    }

    return fail("Unknown action.");
  } catch (error) {
    console.error("Cash Flow write error", error);
    return fail(error instanceof Error ? error.message : "Unable to update Cash Flow.", 500);
  }
}
