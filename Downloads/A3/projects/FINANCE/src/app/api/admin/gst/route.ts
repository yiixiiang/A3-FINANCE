import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Payload = {
  action?:
    | "save_settings"
    | "save_tax_code"
    | "create_period"
    | "refresh_period"
    | "review_source"
    | "save_adjustment"
    | "void_adjustment"
    | "mark_reviewed"
    | "file_period"
    | "reopen_period";
  id?: number;
  company_id?: number;
  gst_registered?: boolean;
  gst_no?: string;
  gst_rate?: number;
  gst_reporting_frequency?: string;
  gst_accounting_basis?: string;
  gst_effective_from?: string;
  gst_deregistered_on?: string;
  gst_submission_due_days?: number;
  gst_financial_year_start_month?: number;
  code?: string;
  name?: string;
  transaction_type?: string;
  treatment?: string;
  rate?: number;
  recoverable_percentage?: number;
  box_no?: number | null;
  is_default_sales?: boolean;
  is_default_purchase?: boolean;
  is_active?: boolean;
  sort_order?: number;
  description?: string;
  period_label?: string;
  period_from?: string;
  period_to?: string;
  due_date?: string;
  period_id?: number;
  source_type?: "customer_invoice" | "supplier_bill";
  source_id?: number;
  tax_code_id?: number | null;
  reportable?: boolean;
  review_status?: string;
  review_notes?: string;
  input_tax_recoverable_percentage?: number;
  adjustment_date?: string;
  adjustment_type?: string;
  taxable_amount?: number;
  gst_amount?: number;
  reference?: string;
  reason?: string;
  notes?: string;
  filed_reference?: string;
  reopened_reason?: string;
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

  if (profile?.role !== "administrator" || profile.status !== "active") {
    return null;
  }

  return { supabase, user };
}

async function getPeriod(admin: ReturnType<typeof createAdminClient>, periodId: number) {
  const { data, error } = await admin
    .from("gst_filing_periods")
    .select("*")
    .eq("id", periodId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("GST filing period was not found.");
  return data;
}

export async function GET(request: NextRequest) {
  const session = await administratorSession();
  if (!session) return failure("Administrator access is required.", 403);

  const admin = createAdminClient();
  const periodId = integer(request.nextUrl.searchParams.get("period_id"));

  if (periodId) {
    const [period, entries] = await Promise.all([
      admin
        .from("gst_filing_periods")
        .select("*,companies(*)")
        .eq("id", periodId)
        .maybeSingle(),
      admin
        .from("gst_period_entries")
        .select("*")
        .eq("period_id", periodId)
        .order("box_no", { ascending: true, nullsFirst: false })
        .order("source_date")
        .order("id"),
    ]);

    const error = period.error ?? entries.error;
    if (error) return failure(error.message, 500);
    if (!period.data) return failure("GST filing period was not found.", 404);

    return NextResponse.json({ period: period.data, entries: entries.data ?? [] });
  }

  const [companies, taxCodes, periods, adjustments, invoices, bills] = await Promise.all([
    admin
      .from("companies")
      .select(
        "id,name,status,base_currency,gst_registered,gst_enabled,gst_no,gst_rate,gst_reporting_frequency,gst_accounting_basis,gst_effective_from,gst_deregistered_on,gst_submission_due_days,gst_financial_year_start_month,company_address,address,uen,logo_path",
      )
      .order("name"),
    admin.from("gst_tax_codes").select("*").order("company_id").order("sort_order").order("code"),
    admin.from("gst_filing_periods").select("*").order("period_from", { ascending: false }).order("id", { ascending: false }),
    admin.from("gst_adjustments").select("*").order("adjustment_date", { ascending: false }).order("id", { ascending: false }),
    admin
      .from("customer_invoices")
      .select(
        "id,company_id,invoice_no,invoice_date,customer_name,subtotal,service_charge_amount,gst_rate,gst_amount,total_amount,status,gst_tax_code_id,gst_treatment,gst_reportable,gst_review_status,gst_review_notes,gst_reviewed_at",
      )
      .order("invoice_date", { ascending: false })
      .order("id", { ascending: false }),
    admin
      .from("supplier_bills")
      .select(
        "id,company_id,bill_no,bill_date,supplier_name,supplier_invoice_no,subtotal,gst_amount,total_amount,status,gst_tax_code_id,gst_treatment,gst_reportable,gst_review_status,gst_review_notes,input_tax_recoverable_percentage,recoverable_gst_amount,gst_reviewed_at",
      )
      .order("bill_date", { ascending: false })
      .order("id", { ascending: false }),
  ]);

  const error =
    companies.error ?? taxCodes.error ?? periods.error ?? adjustments.error ?? invoices.error ?? bills.error;
  if (error) return failure(error.message, 500);

  return NextResponse.json({
    companies: companies.data ?? [],
    tax_codes: taxCodes.data ?? [],
    periods: periods.data ?? [],
    adjustments: adjustments.data ?? [],
    invoices: invoices.data ?? [],
    bills: bills.data ?? [],
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

  try {
    if (body.action === "save_settings") {
      const companyId = integer(body.company_id);
      if (!companyId) return failure("Company is required.");
      const reportingFrequency = clean(body.gst_reporting_frequency) ?? "quarterly";
      const accountingBasis = clean(body.gst_accounting_basis) ?? "invoice";
      if (!["monthly", "quarterly", "half_yearly", "annual"].includes(reportingFrequency)) {
        return failure("Invalid GST reporting frequency.");
      }
      if (!["invoice", "payment"].includes(accountingBasis)) {
        return failure("Invalid GST accounting basis.");
      }

      const { data, error } = await admin
        .from("companies")
        .update({
          gst_registered: Boolean(body.gst_registered),
          gst_enabled: Boolean(body.gst_registered),
          gst_no: clean(body.gst_no),
          gst_rate: Math.min(Math.max(decimal(body.gst_rate), 0), 100),
          gst_reporting_frequency: reportingFrequency,
          gst_accounting_basis: accountingBasis,
          gst_effective_from: validDate(body.gst_effective_from),
          gst_deregistered_on: validDate(body.gst_deregistered_on),
          gst_submission_due_days: Math.max(0, Math.round(Number(body.gst_submission_due_days ?? 30))),
          gst_financial_year_start_month: Math.min(
            12,
            Math.max(1, Math.round(Number(body.gst_financial_year_start_month ?? 1))),
          ),
          updated_at: new Date().toISOString(),
        })
        .eq("id", companyId)
        .select("*")
        .single();
      if (error) return failure(error.message, 500);
      return NextResponse.json({ company: data });
    }

    if (body.action === "save_tax_code") {
      const companyId = integer(body.company_id);
      if (!companyId) return failure("Company is required.");
      if (!clean(body.code) || !clean(body.name)) return failure("Tax code and name are required.");

      const record = {
        company_id: companyId,
        code: clean(body.code),
        name: clean(body.name),
        transaction_type: clean(body.transaction_type) ?? "both",
        treatment: clean(body.treatment) ?? "standard_rated",
        rate: Math.min(Math.max(decimal(body.rate), 0), 100),
        recoverable_percentage: Math.min(Math.max(decimal(body.recoverable_percentage), 0), 100),
        box_no: body.box_no ? Math.min(8, Math.max(1, Number(body.box_no))) : null,
        is_default_sales: Boolean(body.is_default_sales),
        is_default_purchase: Boolean(body.is_default_purchase),
        is_active: body.is_active !== false,
        sort_order: Math.round(Number(body.sort_order ?? 100)),
        description: clean(body.description),
        updated_by: session.user.id,
      };

      if (record.is_default_sales) {
        await admin.from("gst_tax_codes").update({ is_default_sales: false }).eq("company_id", companyId);
      }
      if (record.is_default_purchase) {
        await admin.from("gst_tax_codes").update({ is_default_purchase: false }).eq("company_id", companyId);
      }

      const id = integer(body.id);
      const result = id
        ? await admin.from("gst_tax_codes").update(record).eq("id", id).eq("company_id", companyId).select("*").single()
        : await admin
            .from("gst_tax_codes")
            .insert({ ...record, created_by: session.user.id })
            .select("*")
            .single();
      if (result.error) return failure(result.error.message, 500);
      return NextResponse.json({ tax_code: result.data });
    }

    if (body.action === "create_period") {
      const companyId = integer(body.company_id);
      const periodFrom = validDate(body.period_from);
      const periodTo = validDate(body.period_to);
      if (!companyId || !periodFrom || !periodTo) return failure("Company and period dates are required.");
      if (periodTo < periodFrom) return failure("Period end date cannot be before the start date.");

      const { data: company, error: companyError } = await admin
        .from("companies")
        .select("gst_submission_due_days")
        .eq("id", companyId)
        .maybeSingle();
      if (companyError) return failure(companyError.message, 500);
      if (!company) return failure("Company was not found.");

      const dueDate = validDate(body.due_date) ?? (() => {
        const date = new Date(`${periodTo}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + Number(company.gst_submission_due_days ?? 30));
        return date.toISOString().slice(0, 10);
      })();

      const { data, error } = await admin
        .from("gst_filing_periods")
        .insert({
          company_id: companyId,
          period_label: clean(body.period_label) ?? `${periodFrom} to ${periodTo}`,
          period_from: periodFrom,
          period_to: periodTo,
          due_date: dueDate,
          status: "draft",
          notes: clean(body.notes),
          created_by: session.user.id,
        })
        .select("*")
        .single();
      if (error) return failure(error.message, 500);
      return NextResponse.json({ period: data });
    }

    if (body.action === "refresh_period") {
      const periodId = integer(body.period_id);
      if (!periodId) return failure("GST filing period is required.");
      const { data, error } = await session.supabase.rpc("refresh_gst_filing_period", {
        p_period_id: periodId,
      });
      if (error) return failure(error.message, 500);
      return NextResponse.json({ summary: data });
    }

    if (body.action === "review_source") {
      const sourceId = integer(body.source_id);
      if (!sourceId || !body.source_type) return failure("GST source document is required.");
      const taxCodeId = body.tax_code_id ? integer(body.tax_code_id) : null;
      const treatment = clean(body.treatment) ?? "standard_rated";
      const reviewStatus = clean(body.review_status) ?? "reviewed";
      const reportable = body.reportable !== false;
      if (!["pending", "reviewed", "excluded"].includes(reviewStatus)) return failure("Invalid review status.");

      let taxCodeCompanyId: number | null = null;
      let taxCodeTreatment: string | null = null;
      let taxCodeRecoverablePercentage: number | null = null;
      if (taxCodeId) {
        const { data: taxCode, error: taxCodeError } = await admin
          .from("gst_tax_codes")
          .select("id,company_id,treatment,recoverable_percentage")
          .eq("id", taxCodeId)
          .maybeSingle();
        if (taxCodeError) return failure(taxCodeError.message, 500);
        if (!taxCode) return failure("GST tax code was not found.");
        taxCodeCompanyId = Number(taxCode.company_id);
        taxCodeTreatment = String(taxCode.treatment);
        taxCodeRecoverablePercentage = Number(taxCode.recoverable_percentage);
      }

      if (body.source_type === "customer_invoice") {
        const { data: source, error: sourceError } = await admin
          .from("customer_invoices")
          .select("id,company_id")
          .eq("id", sourceId)
          .maybeSingle();
        if (sourceError) return failure(sourceError.message, 500);
        if (!source) return failure("Customer invoice was not found.");
        if (taxCodeCompanyId && taxCodeCompanyId !== Number(source.company_id)) {
          return failure("The GST tax code does not belong to the invoice company.");
        }
        const { data, error } = await admin
          .from("customer_invoices")
          .update({
            gst_tax_code_id: taxCodeId,
            gst_treatment: taxCodeTreatment ?? treatment,
            gst_reportable: reportable,
            gst_review_status: reviewStatus,
            gst_review_notes: clean(body.review_notes),
            gst_reviewed_by: session.user.id,
            gst_reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", sourceId)
          .select("*")
          .single();
        if (error) return failure(error.message, 500);
        return NextResponse.json({ source: data });
      }

      const { data: source, error: sourceError } = await admin
        .from("supplier_bills")
        .select("id,company_id")
        .eq("id", sourceId)
        .maybeSingle();
      if (sourceError) return failure(sourceError.message, 500);
      if (!source) return failure("Supplier bill was not found.");
      if (taxCodeCompanyId && taxCodeCompanyId !== Number(source.company_id)) {
        return failure("The GST tax code does not belong to the supplier bill company.");
      }
      const recoverablePercentage = Math.min(
        Math.max(
          decimal(
            body.input_tax_recoverable_percentage ??
              taxCodeRecoverablePercentage ??
              100,
          ),
          0,
        ),
        100,
      );
      const { data, error } = await admin
        .from("supplier_bills")
        .update({
          gst_tax_code_id: taxCodeId,
          gst_treatment: taxCodeTreatment ?? treatment,
          gst_reportable: reportable,
          gst_review_status: reviewStatus,
          gst_review_notes: clean(body.review_notes),
          input_tax_recoverable_percentage: recoverablePercentage,
          gst_reviewed_by: session.user.id,
          gst_reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", sourceId)
        .select("*")
        .single();
      if (error) return failure(error.message, 500);
      return NextResponse.json({ source: data });
    }

    if (body.action === "save_adjustment") {
      const companyId = integer(body.company_id);
      if (!companyId) return failure("Company is required.");
      if (!validDate(body.adjustment_date)) return failure("Adjustment date is required.");
      if (!clean(body.reason)) return failure("Adjustment reason is required.");
      const adjustmentType = clean(body.adjustment_type) ?? "output_tax";
      if (!["output_tax", "input_tax"].includes(adjustmentType)) return failure("Invalid adjustment type.");

      const record = {
        company_id: companyId,
        adjustment_date: validDate(body.adjustment_date),
        adjustment_type: adjustmentType,
        treatment: clean(body.treatment) ?? "standard_rated",
        taxable_amount: decimal(body.taxable_amount),
        gst_amount: decimal(body.gst_amount),
        reference: clean(body.reference),
        reason: clean(body.reason),
        status: "posted",
        notes: clean(body.notes),
        updated_at: new Date().toISOString(),
      };
      const id = integer(body.id);
      const result = id
        ? await admin.from("gst_adjustments").update(record).eq("id", id).eq("status", "posted").select("*").single()
        : await admin
            .from("gst_adjustments")
            .insert({ ...record, created_by: session.user.id })
            .select("*")
            .single();
      if (result.error) return failure(result.error.message, 500);
      return NextResponse.json({ adjustment: result.data });
    }

    if (body.action === "void_adjustment") {
      const id = integer(body.id);
      if (!id || !clean(body.reason)) return failure("Adjustment and void reason are required.");
      const { data, error } = await admin
        .from("gst_adjustments")
        .update({
          status: "void",
          void_reason: clean(body.reason),
          voided_by: session.user.id,
          voided_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "posted")
        .select("*")
        .single();
      if (error) return failure(error.message, 500);
      return NextResponse.json({ adjustment: data });
    }

    if (body.action === "mark_reviewed") {
      const periodId = integer(body.period_id);
      if (!periodId) return failure("GST filing period is required.");
      const period = await getPeriod(admin, periodId);
      if (period.status === "filed") return failure("Reopen the filed period first.");
      const { data, error } = await admin
        .from("gst_filing_periods")
        .update({ status: "reviewed", notes: clean(body.notes), updated_at: new Date().toISOString() })
        .eq("id", periodId)
        .select("*")
        .single();
      if (error) return failure(error.message, 500);
      return NextResponse.json({ period: data });
    }

    if (body.action === "file_period") {
      const periodId = integer(body.period_id);
      if (!periodId) return failure("GST filing period is required.");
      const period = await getPeriod(admin, periodId);
      if (!period.source_snapshot_at) return failure("Refresh the GST period before filing.");
      if (period.status !== "reviewed") return failure("Mark the GST period reviewed before filing.");
      const { data, error } = await admin
        .from("gst_filing_periods")
        .update({
          status: "filed",
          filed_reference: clean(body.filed_reference),
          filed_at: new Date().toISOString(),
          filed_by: session.user.id,
          reopened_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", periodId)
        .select("*")
        .single();
      if (error) return failure(error.message, 500);
      return NextResponse.json({ period: data });
    }

    if (body.action === "reopen_period") {
      const periodId = integer(body.period_id);
      const reason = clean(body.reopened_reason);
      if (!periodId || !reason) return failure("GST filing period and reopening reason are required.");
      const { data, error } = await admin
        .from("gst_filing_periods")
        .update({
          status: "reviewed",
          reopened_reason: reason,
          filed_at: null,
          filed_by: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", periodId)
        .eq("status", "filed")
        .select("*")
        .single();
      if (error) return failure(error.message, 500);
      return NextResponse.json({ period: data });
    }

    return failure("Unsupported GST action.");
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Unable to complete GST action.", 500);
  }
}
