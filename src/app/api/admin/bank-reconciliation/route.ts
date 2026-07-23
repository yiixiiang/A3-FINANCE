import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type StatementLineInput = {
  transaction_date?: string;
  value_date?: string;
  description?: string;
  reference?: string;
  amount?: number;
  running_balance?: number | null;
};

type Payload = {
  action?:
    | "save_account"
    | "create_batch"
    | "import_lines"
    | "sync_cashbook"
    | "save_cashbook"
    | "void_cashbook"
    | "match"
    | "remove_match"
    | "auto_match"
    | "ignore_line"
    | "unignore_line"
    | "close_batch"
    | "reopen_batch";
  id?: number;
  company_id?: number;
  bank_account_id?: number;
  account_code?: string;
  account_name?: string;
  bank_name?: string;
  account_no?: string;
  currency?: string;
  opening_balance?: number;
  opening_balance_date?: string;
  is_active?: boolean;
  notes?: string;
  batch_id?: number;
  statement_reference?: string;
  period_from?: string;
  period_to?: string;
  closing_balance?: number;
  lines?: StatementLineInput[];
  replace?: boolean;
  entry_date?: string;
  value_date?: string;
  entry_type?: string;
  reference?: string;
  description?: string;
  amount?: number;
  reason?: string;
  statement_line_id?: number;
  cashbook_entry_id?: number;
  match_id?: number;
};

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function clean(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function integer(value: unknown): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function decimal(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function validDate(value: unknown): string | null {
  const text = clean(value);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

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

async function assertDraftBatch(admin: ReturnType<typeof createAdminClient>, batchId: number) {
  const { data, error } = await admin
    .from("bank_statement_batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Reconciliation batch was not found.");
  if (data.status !== "draft") {
    throw new Error("Reopen the reconciliation before making changes.");
  }
  return data;
}

export async function GET(request: NextRequest) {
  const session = await administratorSession();
  if (!session) return fail("Administrator access is required.", 403);

  const admin = createAdminClient();
  const batchId = integer(request.nextUrl.searchParams.get("batch_id"));

  if (batchId) {
    const [batch, lines, entries, matches] = await Promise.all([
      admin
        .from("bank_statement_batches")
        .select("*,companies(*),bank_accounts(*)")
        .eq("id", batchId)
        .maybeSingle(),
      admin
        .from("bank_statement_lines")
        .select("*")
        .eq("batch_id", batchId)
        .order("sequence_no"),
      admin
        .from("bank_cashbook_entries")
        .select("*")
        .order("entry_date")
        .order("id"),
      admin
        .from("bank_reconciliation_matches")
        .select("*")
        .order("id"),
    ]);

    const error = batch.error ?? lines.error ?? entries.error ?? matches.error;
    if (error) return fail(error.message, 500);
    if (!batch.data) return fail("Reconciliation batch was not found.", 404);

    const accountEntries = (entries.data ?? []).filter(
      (entry) =>
        entry.bank_account_id === batch.data.bank_account_id &&
        entry.company_id === batch.data.company_id,
    );
    const lineIds = new Set((lines.data ?? []).map((line) => line.id));
    const relevantMatches = (matches.data ?? []).filter((match) =>
      lineIds.has(match.statement_line_id),
    );

    return NextResponse.json({
      batch: batch.data,
      lines: lines.data ?? [],
      entries: accountEntries,
      matches: relevantMatches,
    });
  }

  const [companies, accounts, batches, lines, entries, matches] = await Promise.all([
    admin
      .from("companies")
      .select(
        "id,name,status,base_currency,company_address,address,uen,gst_no,company_phone,phone,company_email,email,logo_path",
      )
      .order("name"),
    admin.from("bank_accounts").select("*").order("account_name"),
    admin
      .from("bank_statement_batches")
      .select("*")
      .order("period_to", { ascending: false })
      .order("id", { ascending: false }),
    admin
      .from("bank_statement_lines")
      .select("*")
      .order("transaction_date", { ascending: false })
      .order("id", { ascending: false }),
    admin
      .from("bank_cashbook_entries")
      .select("*")
      .order("entry_date", { ascending: false })
      .order("id", { ascending: false }),
    admin.from("bank_reconciliation_matches").select("*").order("id"),
  ]);

  const error =
    companies.error ??
    accounts.error ??
    batches.error ??
    lines.error ??
    entries.error ??
    matches.error;
  if (error) return fail(error.message, 500);

  return NextResponse.json({
    companies: companies.data ?? [],
    accounts: accounts.data ?? [],
    batches: batches.data ?? [],
    lines: lines.data ?? [],
    entries: entries.data ?? [],
    matches: matches.data ?? [],
  });
}

export async function POST(request: Request) {
  const session = await administratorSession();
  if (!session) return fail("Administrator access is required.", 403);

  let body: Payload;
  try {
    body = (await request.json()) as Payload;
  } catch {
    return fail("Invalid request body.");
  }

  const admin = createAdminClient();

  try {
    if (body.action === "save_account") {
      const accountId = integer(body.id);
      const companyId = integer(body.company_id);
      const accountName = clean(body.account_name);
      const currency = (clean(body.currency) ?? "SGD").toUpperCase();
      if (!companyId) return fail("Company is required.");
      if (!accountName) return fail("Account name is required.");
      if (!/^[A-Z]{3}$/.test(currency)) return fail("Currency must use a three-letter code.");

      const record = {
        company_id: companyId,
        account_code: clean(body.account_code),
        account_name: accountName,
        bank_name: clean(body.bank_name),
        account_no: clean(body.account_no),
        currency,
        opening_balance: decimal(body.opening_balance),
        opening_balance_date: validDate(body.opening_balance_date),
        is_active: body.is_active !== false,
        notes: clean(body.notes),
        updated_by: session.user.id,
        updated_at: new Date().toISOString(),
      };

      const result = accountId
        ? await admin
            .from("bank_accounts")
            .update(record)
            .eq("id", accountId)
            .eq("company_id", companyId)
            .select("*")
            .maybeSingle()
        : await admin
            .from("bank_accounts")
            .insert({ ...record, created_by: session.user.id })
            .select("*")
            .single();

      if (result.error) return fail(result.error.message, 500);
      if (!result.data) return fail("Bank account was not found.", 404);
      return NextResponse.json({ account: result.data });
    }

    if (body.action === "create_batch") {
      const companyId = integer(body.company_id);
      const accountId = integer(body.bank_account_id);
      const periodFrom = validDate(body.period_from);
      const periodTo = validDate(body.period_to);
      if (!companyId || !accountId) return fail("Company and bank account are required.");
      if (!periodFrom || !periodTo) return fail("Statement period is required.");
      if (periodTo < periodFrom) return fail("Statement end date cannot be before the start date.");

      const { data: account, error: accountError } = await admin
        .from("bank_accounts")
        .select("id,company_id")
        .eq("id", accountId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (accountError) return fail(accountError.message, 500);
      if (!account) return fail("The bank account does not belong to the selected company.");

      const { data, error } = await admin
        .from("bank_statement_batches")
        .insert({
          company_id: companyId,
          bank_account_id: accountId,
          statement_reference: clean(body.statement_reference),
          period_from: periodFrom,
          period_to: periodTo,
          opening_balance: decimal(body.opening_balance),
          closing_balance: decimal(body.closing_balance),
          status: "draft",
          notes: clean(body.notes),
          created_by: session.user.id,
        })
        .select("*")
        .single();
      if (error) return fail(error.message, 500);
      return NextResponse.json({ batch: data });
    }

    if (body.action === "import_lines") {
      const batchId = integer(body.batch_id);
      if (!batchId) return fail("Reconciliation batch is required.");
      const batch = await assertDraftBatch(admin, batchId);
      const lines = (body.lines ?? [])
        .map((line) => ({
          transaction_date: validDate(line.transaction_date),
          value_date: validDate(line.value_date),
          description: clean(line.description),
          reference: clean(line.reference),
          amount: decimal(line.amount),
          running_balance:
            line.running_balance === null || line.running_balance === undefined
              ? null
              : decimal(line.running_balance),
        }))
        .filter(
          (line) => line.transaction_date && line.description && Math.abs(line.amount) > 0,
        );
      if (!lines.length) return fail("No valid statement lines were supplied.");

      if (body.replace !== false) {
        const { data: existingLines, error: existingLinesError } = await admin
          .from("bank_statement_lines")
          .select("id")
          .eq("batch_id", batchId);
        if (existingLinesError) return fail(existingLinesError.message, 500);
        const existingLineIds = (existingLines ?? []).map((line) => line.id);
        if (existingLineIds.length) {
          const { count, error: matchCountError } = await admin
            .from("bank_reconciliation_matches")
            .select("id", { count: "exact", head: true })
            .in("statement_line_id", existingLineIds);
          if (matchCountError) return fail(matchCountError.message, 500);
          if ((count ?? 0) > 0) return fail("Remove existing matches before replacing statement lines.");
        }
        const { error: deleteError } = await admin
          .from("bank_statement_lines")
          .delete()
          .eq("batch_id", batchId);
        if (deleteError) return fail(deleteError.message, 500);
      }

      const { data: existing } = await admin
        .from("bank_statement_lines")
        .select("sequence_no")
        .eq("batch_id", batchId)
        .order("sequence_no", { ascending: false })
        .limit(1);
      const start = Number(existing?.[0]?.sequence_no ?? 0);
      const records = lines.map((line, index) => ({
        batch_id: batchId,
        company_id: batch.company_id,
        bank_account_id: batch.bank_account_id,
        sequence_no: start + index + 1,
        transaction_date: line.transaction_date,
        value_date: line.value_date,
        description: line.description,
        reference: line.reference,
        amount: line.amount,
        running_balance: line.running_balance,
        match_status: "unmatched",
      }));
      const { data, error } = await admin
        .from("bank_statement_lines")
        .insert(records)
        .select("*");
      if (error) return fail(error.message, 500);
      return NextResponse.json({ lines: data ?? [], imported: data?.length ?? 0 });
    }

    if (body.action === "sync_cashbook") {
      const companyId = integer(body.company_id);
      const accountId = integer(body.bank_account_id);
      if (!companyId || !accountId) return fail("Company and bank account are required.");

      const { data: account, error: accountError } = await admin
        .from("bank_accounts")
        .select("id,company_id,currency")
        .eq("id", accountId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (accountError) return fail(accountError.message, 500);
      if (!account) return fail("The bank account does not belong to the selected company.");

      const [receipts, supplierPayments, driverPayouts, existing] = await Promise.all([
        admin
          .from("customer_payments")
          .select("id,company_id,customer_name,payment_date,currency,amount,payment_method,payment_reference,receipt_no,status,notes")
          .eq("company_id", companyId)
          .eq("currency", account.currency)
          .eq("status", "posted"),
        admin
          .from("supplier_payments")
          .select("id,company_id,supplier_name,payment_date,currency,amount,payment_method,payment_reference,voucher_no,status,notes")
          .eq("company_id", companyId)
          .eq("currency", account.currency)
          .eq("status", "posted"),
        admin
          .from("driver_payouts")
          .select("id,company_id,payout_no,payment_date,payment_method,amount_paid,status,notes,drivers(full_name)")
          .eq("company_id", companyId)
          .gt("amount_paid", 0)
          .in("status", ["partial", "paid"]),
        admin
          .from("bank_cashbook_entries")
          .select("source_type,source_id")
          .not("source_type", "is", null)
          .not("source_id", "is", null),
      ]);

      const sourceError =
        receipts.error ?? supplierPayments.error ?? driverPayouts.error ?? existing.error;
      if (sourceError) return fail(sourceError.message, 500);

      const existingKeys = new Set(
        (existing.data ?? []).map((row) => `${row.source_type}:${row.source_id}`),
      );
      const records: Array<Record<string, unknown>> = [];

      for (const payment of receipts.data ?? []) {
        if (/^cash$/i.test(String(payment.payment_method ?? "").trim())) continue;
        const key = `customer_payment:${payment.id}`;
        if (existingKeys.has(key)) continue;
        records.push({
          company_id: companyId,
          bank_account_id: accountId,
          entry_date: payment.payment_date,
          entry_type: "receipt",
          source_type: "customer_payment",
          source_id: payment.id,
          reference: payment.payment_reference || payment.receipt_no,
          description: `Customer receipt - ${payment.customer_name}`,
          amount: decimal(payment.amount),
          notes: payment.notes,
          created_by: session.user.id,
        });
        existingKeys.add(key);
      }

      for (const payment of supplierPayments.data ?? []) {
        if (/^cash$/i.test(String(payment.payment_method ?? "").trim())) continue;
        const key = `supplier_payment:${payment.id}`;
        if (existingKeys.has(key)) continue;
        records.push({
          company_id: companyId,
          bank_account_id: accountId,
          entry_date: payment.payment_date,
          entry_type: "payment",
          source_type: "supplier_payment",
          source_id: payment.id,
          reference: payment.payment_reference || payment.voucher_no,
          description: `Supplier payment - ${payment.supplier_name}`,
          amount: -Math.abs(decimal(payment.amount)),
          notes: payment.notes,
          created_by: session.user.id,
        });
        existingKeys.add(key);
      }

      for (const payout of driverPayouts.data ?? []) {
        const key = `driver_payout:${payout.id}`;
        if (existingKeys.has(key)) continue;
        const driverRelation = payout.drivers as unknown as { full_name?: string | null } | null;
        records.push({
          company_id: companyId,
          bank_account_id: accountId,
          entry_date: payout.payment_date || new Date().toISOString().slice(0, 10),
          entry_type: "payment",
          source_type: "driver_payout",
          source_id: payout.id,
          reference: payout.payout_no,
          description: `Driver payout - ${driverRelation?.full_name || "Driver"}`,
          amount: -Math.abs(decimal(payout.amount_paid)),
          notes: payout.notes,
          created_by: session.user.id,
        });
        existingKeys.add(key);
      }

      if (!records.length) return NextResponse.json({ imported: 0, entries: [] });
      const { data, error } = await admin
        .from("bank_cashbook_entries")
        .insert(records)
        .select("*");
      if (error) return fail(error.message, 500);
      return NextResponse.json({ imported: data?.length ?? 0, entries: data ?? [] });
    }

    if (body.action === "save_cashbook") {
      const entryId = integer(body.id);
      const companyId = integer(body.company_id);
      const accountId = integer(body.bank_account_id);
      const entryDate = validDate(body.entry_date);
      const description = clean(body.description);
      const amount = decimal(body.amount);
      const entryTypes = new Set([
        "receipt",
        "payment",
        "bank_fee",
        "interest",
        "transfer",
        "adjustment",
      ]);
      const entryType = entryTypes.has(String(body.entry_type))
        ? String(body.entry_type)
        : "adjustment";
      if (!companyId || !accountId) return fail("Company and bank account are required.");
      if (!entryDate || !description) return fail("Entry date and description are required.");
      if (amount === 0) return fail("Cash-book amount cannot be zero.");

      const record = {
        company_id: companyId,
        bank_account_id: accountId,
        entry_date: entryDate,
        value_date: validDate(body.value_date),
        entry_type: entryType,
        reference: clean(body.reference),
        description,
        amount,
        notes: clean(body.notes),
        updated_at: new Date().toISOString(),
      };
      const result = entryId
        ? await admin
            .from("bank_cashbook_entries")
            .update(record)
            .eq("id", entryId)
            .eq("status", "posted")
            .select("*")
            .maybeSingle()
        : await admin
            .from("bank_cashbook_entries")
            .insert({ ...record, status: "posted", created_by: session.user.id })
            .select("*")
            .single();
      if (result.error) return fail(result.error.message, 500);
      if (!result.data) return fail("Cash-book entry was not found.", 404);
      return NextResponse.json({ entry: result.data });
    }

    if (body.action === "void_cashbook") {
      const entryId = integer(body.id);
      const reason = clean(body.reason);
      if (!entryId || !reason) return fail("Cash-book entry and reversal reason are required.");
      const { count, error: countError } = await admin
        .from("bank_reconciliation_matches")
        .select("id", { count: "exact", head: true })
        .eq("cashbook_entry_id", entryId);
      if (countError) return fail(countError.message, 500);
      if ((count ?? 0) > 0) return fail("Remove reconciliation matches before reversing this entry.");
      const { data, error } = await admin
        .from("bank_cashbook_entries")
        .update({
          status: "void",
          void_reason: reason,
          voided_by: session.user.id,
          voided_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", entryId)
        .eq("status", "posted")
        .select("*")
        .maybeSingle();
      if (error) return fail(error.message, 500);
      if (!data) return fail("Posted cash-book entry was not found.", 404);
      return NextResponse.json({ entry: data });
    }

    if (body.action === "match") {
      const lineId = integer(body.statement_line_id);
      const entryId = integer(body.cashbook_entry_id);
      if (!lineId || !entryId) return fail("Statement line and cash-book entry are required.");
      const { data, error } = await admin.rpc("a3_match_bank_transaction", {
        p_actor: session.user.id,
        p_statement_line_id: lineId,
        p_cashbook_entry_id: entryId,
        p_amount: body.amount === undefined ? null : Math.abs(decimal(body.amount)),
      });
      if (error) return fail(error.message, 500);
      return NextResponse.json({ match_id: data });
    }

    if (body.action === "remove_match") {
      const matchId = integer(body.match_id);
      if (!matchId) return fail("Reconciliation match is required.");
      const { data, error } = await admin.rpc("a3_remove_bank_match", {
        p_actor: session.user.id,
        p_match_id: matchId,
      });
      if (error) return fail(error.message, 500);
      return NextResponse.json({ removed: Boolean(data) });
    }

    if (body.action === "ignore_line" || body.action === "unignore_line") {
      const lineId = integer(body.statement_line_id);
      if (!lineId) return fail("Statement line is required.");
      const { data: line, error: lineError } = await admin
        .from("bank_statement_lines")
        .select("id,batch_id")
        .eq("id", lineId)
        .maybeSingle();
      if (lineError) return fail(lineError.message, 500);
      if (!line) return fail("Statement line was not found.", 404);
      await assertDraftBatch(admin, line.batch_id);

      if (body.action === "ignore_line") {
        const reason = clean(body.reason);
        if (!reason) return fail("An ignore reason is required.");
        const { count } = await admin
          .from("bank_reconciliation_matches")
          .select("id", { count: "exact", head: true })
          .eq("statement_line_id", lineId);
        if ((count ?? 0) > 0) return fail("Remove existing matches before ignoring this line.");
        const { error } = await admin
          .from("bank_statement_lines")
          .update({
            match_status: "ignored",
            ignored_reason: reason,
            ignored_by: session.user.id,
            ignored_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", lineId);
        if (error) return fail(error.message, 500);
      } else {
        const { error } = await admin
          .from("bank_statement_lines")
          .update({
            match_status: "unmatched",
            ignored_reason: null,
            ignored_by: null,
            ignored_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", lineId);
        if (error) return fail(error.message, 500);
      }
      return NextResponse.json({ updated: true });
    }

    if (body.action === "auto_match") {
      const batchId = integer(body.batch_id);
      if (!batchId) return fail("Reconciliation batch is required.");
      const batch = await assertDraftBatch(admin, batchId);
      const [lineResult, entryResult, matchResult] = await Promise.all([
        admin
          .from("bank_statement_lines")
          .select("*")
          .eq("batch_id", batchId)
          .in("match_status", ["unmatched", "partial"])
          .order("transaction_date")
          .order("id"),
        admin
          .from("bank_cashbook_entries")
          .select("*")
          .eq("bank_account_id", batch.bank_account_id)
          .eq("status", "posted")
          .order("entry_date")
          .order("id"),
        admin.from("bank_reconciliation_matches").select("*"),
      ]);
      const error = lineResult.error ?? entryResult.error ?? matchResult.error;
      if (error) return fail(error.message, 500);

      const matches = matchResult.data ?? [];
      const lineUsed = new Map<number, number>();
      const entryUsed = new Map<number, number>();
      for (const match of matches) {
        lineUsed.set(
          match.statement_line_id,
          (lineUsed.get(match.statement_line_id) ?? 0) + Number(match.matched_amount || 0),
        );
        entryUsed.set(
          match.cashbook_entry_id,
          (entryUsed.get(match.cashbook_entry_id) ?? 0) + Number(match.matched_amount || 0),
        );
      }

      let matched = 0;
      for (const line of lineResult.data ?? []) {
        const lineRemaining = Math.round(
          (Math.abs(Number(line.amount)) - (lineUsed.get(line.id) ?? 0)) * 100,
        ) / 100;
        if (lineRemaining <= 0) continue;
        const lineDate = new Date(`${line.transaction_date}T00:00:00Z`).getTime();
        const lineReference = String(line.reference ?? "").toLowerCase();
        const candidates = (entryResult.data ?? [])
          .map((entry) => {
            const remaining = Math.round(
              (Math.abs(Number(entry.amount)) - (entryUsed.get(entry.id) ?? 0)) * 100,
            ) / 100;
            const entryDate = new Date(`${entry.entry_date}T00:00:00Z`).getTime();
            const dateDifference = Math.abs(lineDate - entryDate) / 86_400_000;
            const entryReference = String(entry.reference ?? "").toLowerCase();
            const referenceBonus =
              lineReference && entryReference &&
              (lineReference.includes(entryReference) || entryReference.includes(lineReference))
                ? -10
                : 0;
            return { entry, remaining, dateDifference, score: dateDifference + referenceBonus };
          })
          .filter(
            (candidate) =>
              candidate.remaining === lineRemaining &&
              candidate.dateDifference <= 3 &&
              Math.sign(Number(candidate.entry.amount)) === Math.sign(Number(line.amount)),
          )
          .sort((a, b) => a.score - b.score || a.entry.id - b.entry.id);

        const candidate = candidates[0];
        if (!candidate) continue;
        const result = await admin.rpc("a3_match_bank_transaction", {
          p_actor: session.user.id,
          p_statement_line_id: line.id,
          p_cashbook_entry_id: candidate.entry.id,
          p_amount: lineRemaining,
        });
        if (!result.error) {
          matched += 1;
          lineUsed.set(line.id, (lineUsed.get(line.id) ?? 0) + lineRemaining);
          entryUsed.set(
            candidate.entry.id,
            (entryUsed.get(candidate.entry.id) ?? 0) + lineRemaining,
          );
        }
      }
      return NextResponse.json({ matched });
    }

    if (body.action === "close_batch" || body.action === "reopen_batch") {
      const batchId = integer(body.batch_id);
      if (!batchId) return fail("Reconciliation batch is required.");
      const rpc =
        body.action === "close_batch"
          ? "a3_close_bank_reconciliation"
          : "a3_reopen_bank_reconciliation";
      const { data, error } = await admin.rpc(rpc, {
        p_actor: session.user.id,
        p_batch_id: batchId,
      });
      if (error) return fail(error.message, 500);
      return NextResponse.json({ result: data });
    }

    return fail("Unsupported bank reconciliation action.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Bank reconciliation request failed.", 500);
  }
}
