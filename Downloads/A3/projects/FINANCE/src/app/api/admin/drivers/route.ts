import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type DriverStatus = "active" | "inactive";
type PayNowType = "mobile" | "nric" | "uen" | "other" | "";
type DocumentKind =
  | "profile_photo_path"
  | "licence_front_path"
  | "licence_back_path"
  | "identity_document_path";

type DriverPayload = {
  action?:
    | "create"
    | "update"
    | "create_login"
    | "reset_password"
    | "delete"
    | "update_document";
  driver_id?: number;
  company_id?: number;
  full_name?: string;
  phone?: string;
  contact_email?: string;
  login_email?: string;
  password?: string;
  create_login?: boolean;
  address?: string;
  nric_passport?: string;
  nationality?: string;
  date_of_birth?: string;
  licence_no?: string;
  licence_class?: string;
  licence_expiry?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_plate?: string;
  vehicle_type?: string;
  bank_name?: string;
  bank_account_name?: string;
  bank_account_no?: string;
  paynow_type?: PayNowType;
  paynow_no?: string;
  status?: DriverStatus;
  notes?: string;
  document_kind?: DocumentKind;
  document_path?: string | null;
};

const validStatuses = new Set<DriverStatus>(["active", "inactive"]);
const validPayNowTypes = new Set(["", "mobile", "nric", "uen", "other"]);
const validDocumentKinds = new Set<DocumentKind>([
  "profile_photo_path",
  "licence_front_path",
  "licence_back_path",
  "identity_document_path",
]);

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function cleanText(value: unknown): string | null {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function cleanEmail(value: unknown): string | null {
  const cleaned = String(value ?? "").trim().toLowerCase();
  return cleaned || null;
}

function cleanDate(value: unknown): string | null {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

async function requireAdministrator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "administrator" || profile.status !== "active") return null;
  return user;
}

async function ensureCompanyExists(
  admin: ReturnType<typeof createAdminClient>,
  companyId: number,
) {
  const { data, error } = await admin
    .from("companies")
    .select("id, name, status")
    .eq("id", companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Assigned company was not found.");
  return data;
}

async function replaceDriverCompanyAccess(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  companyId: number,
) {
  const { error: deleteError } = await admin
    .from("user_company_access")
    .delete()
    .eq("user_id", userId);

  if (deleteError) throw new Error(deleteError.message);

  const { error: insertError } = await admin.from("user_company_access").insert({
    user_id: userId,
    company_id: companyId,
    can_view: true,
    can_create: false,
    can_edit: false,
    can_delete: false,
  });

  if (insertError) throw new Error(insertError.message);
}

async function writeAudit(
  admin: ReturnType<typeof createAdminClient>,
  actorUserId: string,
  action: string,
  driverId: number | null,
  details: Record<string, unknown> = {},
) {
  await admin.from("audit_logs").insert({
    actor_user_id: actorUserId,
    action,
    target_table: "drivers",
    target_record_id: driverId ? String(driverId) : null,
    details,
  });
}

function driverRecord(body: DriverPayload, currentUserId: string) {
  const status = body.status ?? "active";
  const payNowType = body.paynow_type ?? "";

  return {
    company_id: Number(body.company_id),
    full_name: String(body.full_name ?? "").trim(),
    phone: cleanText(body.phone),
    contact_email: cleanEmail(body.contact_email),
    address: cleanText(body.address),
    nric_passport: cleanText(body.nric_passport),
    nationality: cleanText(body.nationality),
    date_of_birth: cleanDate(body.date_of_birth),
    licence_no: cleanText(body.licence_no),
    licence_class: cleanText(body.licence_class),
    licence_expiry: cleanDate(body.licence_expiry),
    emergency_contact_name: cleanText(body.emergency_contact_name),
    emergency_contact_phone: cleanText(body.emergency_contact_phone),
    vehicle_make: cleanText(body.vehicle_make),
    vehicle_model: cleanText(body.vehicle_model),
    vehicle_plate: cleanText(body.vehicle_plate)?.toUpperCase() ?? null,
    vehicle_type: cleanText(body.vehicle_type),
    bank_name: cleanText(body.bank_name),
    bank_account_name: cleanText(body.bank_account_name),
    bank_account_no: cleanText(body.bank_account_no),
    paynow_type: payNowType || null,
    paynow_no: cleanText(body.paynow_no),
    status,
    notes: cleanText(body.notes),
    updated_by: currentUserId,
  };
}

async function createDriverLogin(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    email: string;
    password: string;
    fullName: string;
    phone: string | null;
    status: DriverStatus;
    companyId: number;
  },
) {
  const { data: existingProfile, error: existingProfileError } = await admin
    .from("profiles")
    .select("id, role")
    .ilike("email", args.email)
    .maybeSingle();

  if (existingProfileError) throw new Error(existingProfileError.message);

  if (existingProfile) {
    if (existingProfile.role === "administrator") {
      throw new Error("This email belongs to an administrator account and cannot be converted to a driver login.");
    }

    const { data: existingDriver, error: existingDriverError } = await admin
      .from("drivers")
      .select("id")
      .eq("auth_user_id", existingProfile.id)
      .maybeSingle();

    if (existingDriverError) throw new Error(existingDriverError.message);
    if (existingDriver) {
      throw new Error("This login account is already linked to another driver.");
    }

    const { error: authUpdateError } = await admin.auth.admin.updateUserById(
      existingProfile.id,
      {
        password: args.password,
        user_metadata: { full_name: args.fullName, account_type: "driver" },
        ban_duration: args.status === "inactive" ? "876000h" : "none",
      },
    );

    if (authUpdateError) throw new Error(authUpdateError.message);

    const { error: profileUpdateError } = await admin
      .from("profiles")
      .update({
        email: args.email,
        full_name: args.fullName,
        phone: args.phone,
        job_title: "Driver",
        role: "driver",
        status: args.status,
        active_company_id: args.companyId,
      })
      .eq("id", existingProfile.id);

    if (profileUpdateError) throw new Error(profileUpdateError.message);

    await replaceDriverCompanyAccess(admin, existingProfile.id, args.companyId);
    return existingProfile.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: args.email,
    password: args.password,
    email_confirm: true,
    user_metadata: { full_name: args.fullName, account_type: "driver" },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Unable to create the driver login account.");
  }

  const userId = data.user.id;
  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
    email: args.email,
    full_name: args.fullName,
    phone: args.phone,
    job_title: "Driver",
    role: "driver",
    status: args.status,
    active_company_id: args.companyId,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    throw new Error(profileError.message);
  }

  await replaceDriverCompanyAccess(admin, userId, args.companyId);

  if (args.status === "inactive") {
    await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  }

  return userId;
}

export async function GET() {
  const currentUser = await requireAdministrator();
  if (!currentUser) return jsonError("Administrator access is required.", 403);

  try {
    const admin = createAdminClient();
    const [driversResult, companiesResult, jobsResult, payoutsResult] = await Promise.all([
      admin.from("drivers").select("*").order("full_name"),
      admin
        .from("companies")
        .select("id, name, company_type, status")
        .order("name"),
      admin
        .from("driver_jobs")
        .select("driver_id, gross_amount, driver_amount, status"),
      admin
        .from("driver_payouts")
        .select("driver_id, amount_paid, outstanding_amount, status"),
    ]);

    if (driversResult.error) return jsonError(driversResult.error.message, 500);
    if (companiesResult.error) return jsonError(companiesResult.error.message, 500);
    if (jobsResult.error) return jsonError(jobsResult.error.message, 500);
    if (payoutsResult.error) return jsonError(payoutsResult.error.message, 500);

    const jobSummary = new Map<
      number,
      { completed_jobs: number; gross_fares: number; driver_earnings: number }
    >();
    for (const job of jobsResult.data ?? []) {
      const current = jobSummary.get(job.driver_id) ?? {
        completed_jobs: 0,
        gross_fares: 0,
        driver_earnings: 0,
      };
      if (job.status === "completed") current.completed_jobs += 1;
      current.gross_fares += Number(job.gross_amount ?? 0);
      current.driver_earnings += Number(job.driver_amount ?? 0);
      jobSummary.set(job.driver_id, current);
    }

    const payoutSummary = new Map<
      number,
      { total_paid: number; outstanding_payout: number }
    >();
    for (const payout of payoutsResult.data ?? []) {
      const current = payoutSummary.get(payout.driver_id) ?? {
        total_paid: 0,
        outstanding_payout: 0,
      };
      current.total_paid += Number(payout.amount_paid ?? 0);
      if (payout.status !== "cancelled") {
        current.outstanding_payout += Number(payout.outstanding_amount ?? 0);
      }
      payoutSummary.set(payout.driver_id, current);
    }

    const drivers = (driversResult.data ?? []).map((driver) => ({
      ...driver,
      summary: {
        ...(jobSummary.get(driver.id) ?? {
          completed_jobs: 0,
          gross_fares: 0,
          driver_earnings: 0,
        }),
        ...(payoutSummary.get(driver.id) ?? {
          total_paid: 0,
          outstanding_payout: 0,
        }),
      },
    }));

    return NextResponse.json({
      drivers,
      companies: companiesResult.data ?? [],
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to load drivers.", 500);
  }
}

export async function POST(request: Request) {
  const currentUser = await requireAdministrator();
  if (!currentUser) return jsonError("Administrator access is required.", 403);

  let body: DriverPayload;
  try {
    body = (await request.json()) as DriverPayload;
  } catch {
    return jsonError("Invalid request body.");
  }

  const admin = createAdminClient();
  const action = body.action;

  try {
    if (action === "create") {
      const companyId = Number(body.company_id);
      const fullName = String(body.full_name ?? "").trim();
      const status = body.status ?? "active";
      const loginEmail = cleanEmail(body.login_email);
      const password = String(body.password ?? "");
      const shouldCreateLogin = Boolean(body.create_login);

      if (!Number.isInteger(companyId) || companyId <= 0) {
        return jsonError("Select an assigned company.");
      }
      if (!fullName) return jsonError("Driver name is required.");
      if (!validStatuses.has(status)) return jsonError("Invalid driver status.");
      if (!validPayNowTypes.has(body.paynow_type ?? "")) {
        return jsonError("Invalid PayNow type.");
      }
      await ensureCompanyExists(admin, companyId);

      let authUserId: string | null = null;
      if (shouldCreateLogin) {
        if (!loginEmail || !loginEmail.includes("@")) {
          return jsonError("Enter a valid driver login email.");
        }
        if (password.length < 8) {
          return jsonError("Temporary password must contain at least 8 characters.");
        }
        authUserId = await createDriverLogin(admin, {
          email: loginEmail,
          password,
          fullName,
          phone: cleanText(body.phone),
          status,
          companyId,
        });
      }

      const { data: created, error: createError } = await admin
        .from("drivers")
        .insert({
          ...driverRecord(body, currentUser.id),
          auth_user_id: authUserId,
          login_email: shouldCreateLogin ? loginEmail : null,
          login_enabled: shouldCreateLogin,
          created_by: currentUser.id,
        })
        .select("id")
        .single();

      if (createError || !created) {
        if (authUserId) await admin.auth.admin.deleteUser(authUserId);
        return jsonError(createError?.message ?? "Unable to create driver.", 500);
      }

      await writeAudit(admin, currentUser.id, "driver_created", created.id, {
        company_id: companyId,
        login_created: shouldCreateLogin,
      });

      return NextResponse.json({ success: true, driver_id: created.id });
    }

    if (action === "update") {
      const driverId = Number(body.driver_id);
      const companyId = Number(body.company_id);
      const fullName = String(body.full_name ?? "").trim();
      const status = body.status ?? "active";

      if (!Number.isInteger(driverId) || driverId <= 0) {
        return jsonError("Driver ID is required.");
      }
      if (!Number.isInteger(companyId) || companyId <= 0) {
        return jsonError("Select an assigned company.");
      }
      if (!fullName) return jsonError("Driver name is required.");
      if (!validStatuses.has(status)) return jsonError("Invalid driver status.");
      if (!validPayNowTypes.has(body.paynow_type ?? "")) {
        return jsonError("Invalid PayNow type.");
      }
      await ensureCompanyExists(admin, companyId);

      const { data: existing, error: existingError } = await admin
        .from("drivers")
        .select("auth_user_id, login_email")
        .eq("id", driverId)
        .maybeSingle();

      if (existingError) return jsonError(existingError.message, 500);
      if (!existing) return jsonError("Driver was not found.", 404);

      const { error: updateError } = await admin
        .from("drivers")
        .update(driverRecord(body, currentUser.id))
        .eq("id", driverId);

      if (updateError) return jsonError(updateError.message, 500);

      if (existing.auth_user_id) {
        const { error: profileError } = await admin
          .from("profiles")
          .update({
            full_name: fullName,
            phone: cleanText(body.phone),
            role: "driver",
            status,
            active_company_id: companyId,
            job_title: "Driver",
          })
          .eq("id", existing.auth_user_id);

        if (profileError) return jsonError(profileError.message, 500);

        const { error: authError } = await admin.auth.admin.updateUserById(
          existing.auth_user_id,
          {
            user_metadata: { full_name: fullName, account_type: "driver" },
            ban_duration: status === "inactive" ? "876000h" : "none",
          },
        );
        if (authError) return jsonError(authError.message, 500);

        await replaceDriverCompanyAccess(admin, existing.auth_user_id, companyId);
      }

      await writeAudit(admin, currentUser.id, "driver_updated", driverId, {
        company_id: companyId,
        status,
      });

      return NextResponse.json({ success: true });
    }

    if (action === "create_login") {
      const driverId = Number(body.driver_id);
      const loginEmail = cleanEmail(body.login_email);
      const password = String(body.password ?? "");

      if (!Number.isInteger(driverId) || driverId <= 0) {
        return jsonError("Driver ID is required.");
      }
      if (!loginEmail || !loginEmail.includes("@")) {
        return jsonError("Enter a valid driver login email.");
      }
      if (password.length < 8) {
        return jsonError("Temporary password must contain at least 8 characters.");
      }

      const { data: driver, error: driverError } = await admin
        .from("drivers")
        .select("id, auth_user_id, full_name, phone, company_id, status")
        .eq("id", driverId)
        .maybeSingle();

      if (driverError) return jsonError(driverError.message, 500);
      if (!driver) return jsonError("Driver was not found.", 404);
      if (driver.auth_user_id) return jsonError("This driver already has a login account.");

      const authUserId = await createDriverLogin(admin, {
        email: loginEmail,
        password,
        fullName: driver.full_name,
        phone: driver.phone,
        status: driver.status,
        companyId: driver.company_id,
      });

      const { error: linkError } = await admin
        .from("drivers")
        .update({
          auth_user_id: authUserId,
          login_email: loginEmail,
          login_enabled: true,
          updated_by: currentUser.id,
        })
        .eq("id", driverId);

      if (linkError) {
        await admin.auth.admin.deleteUser(authUserId);
        return jsonError(linkError.message, 500);
      }

      await writeAudit(admin, currentUser.id, "driver_login_created", driverId, {
        auth_user_id: authUserId,
      });

      return NextResponse.json({ success: true });
    }

    if (action === "reset_password") {
      const driverId = Number(body.driver_id);
      const password = String(body.password ?? "");
      if (!Number.isInteger(driverId) || driverId <= 0) {
        return jsonError("Driver ID is required.");
      }
      if (password.length < 8) {
        return jsonError("New password must contain at least 8 characters.");
      }

      const { data: driver, error: driverError } = await admin
        .from("drivers")
        .select("auth_user_id")
        .eq("id", driverId)
        .maybeSingle();

      if (driverError) return jsonError(driverError.message, 500);
      if (!driver?.auth_user_id) return jsonError("This driver does not have a login account.");

      const { error } = await admin.auth.admin.updateUserById(driver.auth_user_id, {
        password,
      });
      if (error) return jsonError(error.message, 500);

      await writeAudit(admin, currentUser.id, "driver_password_reset", driverId);
      return NextResponse.json({ success: true });
    }

    if (action === "update_document") {
      const driverId = Number(body.driver_id);
      const documentKind = body.document_kind;
      if (!Number.isInteger(driverId) || driverId <= 0) {
        return jsonError("Driver ID is required.");
      }
      if (!documentKind || !validDocumentKinds.has(documentKind)) {
        return jsonError("Invalid document type.");
      }

      const { error } = await admin
        .from("drivers")
        .update({
          [documentKind]: body.document_path ?? null,
          updated_by: currentUser.id,
        })
        .eq("id", driverId);

      if (error) return jsonError(error.message, 500);
      await writeAudit(admin, currentUser.id, "driver_document_updated", driverId, {
        document_kind: documentKind,
        has_document: Boolean(body.document_path),
      });
      return NextResponse.json({ success: true });
    }

    if (action === "delete") {
      const driverId = Number(body.driver_id);
      if (!Number.isInteger(driverId) || driverId <= 0) {
        return jsonError("Driver ID is required.");
      }

      const { data: driver, error: driverError } = await admin
        .from("drivers")
        .select(
          "auth_user_id, full_name, profile_photo_path, licence_front_path, licence_back_path, identity_document_path",
        )
        .eq("id", driverId)
        .maybeSingle();

      if (driverError) return jsonError(driverError.message, 500);
      if (!driver) return jsonError("Driver was not found.", 404);

      const documentPaths = [
        driver.profile_photo_path,
        driver.licence_front_path,
        driver.licence_back_path,
        driver.identity_document_path,
      ].filter((path): path is string => Boolean(path));

      const { error: deleteError } = await admin.from("drivers").delete().eq("id", driverId);
      if (deleteError) return jsonError(deleteError.message, 500);

      if (documentPaths.length > 0) {
        await admin.storage.from("driver-documents").remove(documentPaths);
      }
      if (driver.auth_user_id) {
        await admin.auth.admin.deleteUser(driver.auth_user_id);
      }

      await writeAudit(admin, currentUser.id, "driver_deleted", driverId, {
        full_name: driver.full_name,
        login_deleted: Boolean(driver.auth_user_id),
      });
      return NextResponse.json({ success: true });
    }

    return jsonError("Unsupported action.");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Driver operation failed.", 500);
  }
}
