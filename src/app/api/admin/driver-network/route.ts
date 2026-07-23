import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { areCompaniesInScope, isCompanyInScope, requireAdministratorScope } from "@/lib/admin-scope";

export const dynamic = "force-dynamic";

type NetworkAction =
  | "save_driver_network"
  | "create_signup_link"
  | "set_signup_link_status"
  | "approve_application"
  | "reject_application";

type RequestPayload = {
  action?: NetworkAction;
  driver_id?: number;
  primary_company_id?: number;
  company_ids?: number[];
  customer_ids?: number[];
  company_id?: number;
  link_name?: string;
  expires_at?: string | null;
  max_applications?: number | null;
  signup_link_id?: string;
  status?: "active" | "inactive";
  application_id?: number;
  review_notes?: string;
};

type AdminClient = ReturnType<typeof createAdminClient>;
type DriverDocumentRow = {
  id: string;
  application_id: number;
  company_id: number;
  driver_id: number | null;
  document_type: string;
  storage_bucket: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  upload_status: string;
  uploaded_at: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
};

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function clean(value: unknown): string | null {
  const result = String(value ?? "").trim();
  return result || null;
}

function cleanEmail(value: unknown): string | null {
  const result = String(value ?? "").trim().toLowerCase();
  return result || null;
}

function positiveIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

async function writeAudit(
  admin: AdminClient,
  actorId: string,
  action: string,
  targetTable: string,
  targetId: string | number | null,
  details: Record<string, unknown>,
) {
  await admin.from("audit_logs").insert({
    actor_user_id: actorId,
    action,
    target_table: targetTable,
    target_record_id: targetId === null ? null : String(targetId),
    details,
  });
}


async function signDriverDocuments(admin: AdminClient, rows: DriverDocumentRow[]) {
  return await Promise.all(
    rows.map(async (document) => {
      const { data } = await admin.storage
        .from(document.storage_bucket || "driver-documents")
        .createSignedUrl(document.storage_path, 60 * 60);
      return { ...document, signed_url: data?.signedUrl ?? null };
    }),
  );
}

async function validateLimousineCompanies(admin: AdminClient, companyIds: number[]) {
  if (companyIds.length === 0) throw new Error("Select at least one limousine company.");

  const { data, error } = await admin
    .from("companies")
    .select("id,name,company_type,status")
    .in("id", companyIds);

  if (error) throw new Error(error.message);
  if ((data ?? []).length !== companyIds.length) {
    throw new Error("One or more selected companies were not found.");
  }

  const invalid = (data ?? []).find(
    (company) => company.company_type !== "limousine" || company.status !== "active",
  );
  if (invalid) throw new Error(`${invalid.name} is not an active limousine company.`);

  return data ?? [];
}

async function syncDriverLoginAccess(
  admin: AdminClient,
  authUserId: string | null,
  primaryCompanyId: number,
  companyIds: number[],
  managedCompanyIds: number[],
) {
  if (!authUserId) return;

  const accessRows = companyIds.map((companyId) => ({
    user_id: authUserId,
    company_id: companyId,
    can_view: true,
    can_create: false,
    can_edit: false,
    can_delete: false,
  }));

  const { error: upsertError } = await admin
    .from("user_company_access")
    .upsert(accessRows, { onConflict: "user_id,company_id" });
  if (upsertError) throw new Error(upsertError.message);

  const { data: existingAccess, error: accessError } = await admin
    .from("user_company_access")
    .select("id,company_id")
    .eq("user_id", authUserId);
  if (accessError) throw new Error(accessError.message);

  const removeIds = (existingAccess ?? [])
    .filter(
      (row) =>
        managedCompanyIds.includes(Number(row.company_id)) &&
        !companyIds.includes(Number(row.company_id)),
    )
    .map((row) => Number(row.id));
  if (removeIds.length > 0) {
    const { error: deleteError } = await admin
      .from("user_company_access")
      .delete()
      .in("id", removeIds);
    if (deleteError) throw new Error(deleteError.message);
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ active_company_id: primaryCompanyId })
    .eq("id", authUserId);
  if (profileError) throw new Error(profileError.message);
}


function generateTemporaryPassword() {
  return `${randomBytes(9).toString("base64url")}Aa1!`;
}

async function createOrAttachDriverLogin(
  admin: AdminClient,
  args: {
    driverId: number;
    companyId: number;
    email: string;
    fullName: string;
    phone: string | null;
  },
) {
  const temporaryPassword = generateTemporaryPassword();
  const { data: existingProfile, error: profileLookupError } = await admin
    .from("profiles")
    .select("id,role")
    .ilike("email", args.email)
    .limit(1)
    .maybeSingle();
  if (profileLookupError) throw new Error(profileLookupError.message);

  let authUserId: string;
  let accountCreated = false;

  if (existingProfile) {
    if (!["driver", "user"].includes(String(existingProfile.role))) {
      throw new Error(
        "This email belongs to a staff account and cannot be converted into a driver login.",
      );
    }

    const { data: linkedDriver, error: linkedDriverError } = await admin
      .from("drivers")
      .select("id")
      .eq("auth_user_id", existingProfile.id)
      .neq("id", args.driverId)
      .limit(1)
      .maybeSingle();
    if (linkedDriverError) throw new Error(linkedDriverError.message);
    if (linkedDriver) throw new Error("This login email is already linked to another driver.");

    authUserId = existingProfile.id;
    const { error: authUpdateError } = await admin.auth.admin.updateUserById(authUserId, {
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: args.fullName, account_type: "driver" },
      ban_duration: "none",
    });
    if (authUpdateError) throw new Error(authUpdateError.message);
  } else {
    const { data: authResult, error: authCreateError } = await admin.auth.admin.createUser({
      email: args.email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: args.fullName, account_type: "driver" },
    });
    if (authCreateError || !authResult.user) {
      throw new Error(authCreateError?.message ?? "Unable to create the driver login account.");
    }
    authUserId = authResult.user.id;
    accountCreated = true;
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: authUserId,
    email: args.email,
    full_name: args.fullName,
    phone: args.phone,
    job_title: "Driver",
    role: "driver",
    status: "active",
    active_company_id: args.companyId,
  });
  if (profileError) {
    if (accountCreated) await admin.auth.admin.deleteUser(authUserId);
    throw new Error(profileError.message);
  }

  const { error: accessError } = await admin.from("user_company_access").upsert(
    {
      user_id: authUserId,
      company_id: args.companyId,
      can_view: true,
      can_create: false,
      can_edit: false,
      can_delete: false,
    },
    { onConflict: "user_id,company_id" },
  );
  if (accessError) throw new Error(accessError.message);

  const { error: driverLinkError } = await admin
    .from("drivers")
    .update({
      auth_user_id: authUserId,
      login_email: args.email,
      login_enabled: true,
    })
    .eq("id", args.driverId);
  if (driverLinkError) throw new Error(driverLinkError.message);

  return {
    authUserId,
    loginEmail: args.email,
    temporaryPassword,
    accountCreated,
  };
}

export async function GET() {
  const scope = await requireAdministratorScope();
  if (!scope) return fail("Administrator access is required.", 403);
  if (scope.companyIds.length === 0) {
    return fail("No company is assigned to this administrator.", 403);
  }

  try {
    const admin = createAdminClient();
    const [companies, customers, companyLinks, customerLinks, signupLinks, applications, documents] =
      await Promise.all([
        admin
          .from("companies")
          .select("id,name,company_type,status,phone,email,logo_path")
          .in("id", scope.companyIds)
          .eq("company_type", "limousine")
          .order("name"),
        admin
          .from("customers")
          .select(
            "id,company_id,customer_no,customer_type,customer_name,contact_person,phone,email,status",
          )
          .in("company_id", scope.companyIds)
          .order("customer_name"),
        admin
          .from("driver_company_links")
          .select("id,driver_id,company_id,is_primary,membership_status,joined_at,notes")
          .in("company_id", scope.companyIds)
          .order("is_primary", { ascending: false }),
        admin
          .from("driver_customer_links")
          .select("id,driver_id,company_id,customer_id,relationship_type,link_status,notes")
          .in("company_id", scope.companyIds),
        admin
          .from("driver_signup_links")
          .select(
            "id,company_id,public_token,short_code,link_name,status,expires_at,max_applications,application_count,created_at",
          )
          .in("company_id", scope.companyIds)
          .order("created_at", { ascending: false }),
        admin
          .from("driver_signup_applications")
          .select(
            "id,application_no,signup_link_id,company_id,status,driver_id,full_name,phone,contact_email,address,nationality,date_of_birth,emergency_contact_name,emergency_contact_phone,vehicle_make,vehicle_model,vehicle_plate,vehicle_type,bank_name,bank_account_name,bank_account_no,paynow_type,paynow_no,notes,consent_confirmed,reviewed_at,review_notes,submitted_at,upload_completed_at",
          )
          .in("company_id", scope.companyIds)
          .neq("status", "uploading")
          .order("submitted_at", { ascending: false }),
        admin
          .from("driver_application_documents")
          .select(
            "id,application_id,company_id,driver_id,document_type,storage_bucket,storage_path,original_filename,mime_type,size_bytes,upload_status,uploaded_at,reviewed_at,review_notes,created_at",
          )
          .in("company_id", scope.companyIds)
          .neq("upload_status", "pending")
          .order("created_at"),
      ]);

    const firstError =
      companies.error ??
      customers.error ??
      companyLinks.error ??
      customerLinks.error ??
      signupLinks.error ??
      applications.error ??
      documents.error;
    if (firstError) return fail(firstError.message, 500);

    const linkedDriverIds = [...new Set((companyLinks.data ?? []).map((link) => Number(link.driver_id)))];
    const [primaryDrivers, linkedDrivers] = await Promise.all([
      admin
        .from("drivers")
        .select(
          "id,driver_no,company_id,auth_user_id,full_name,phone,contact_email,nationality,vehicle_make,vehicle_model,vehicle_plate,vehicle_type,status,created_at",
        )
        .in("company_id", scope.companyIds)
        .order("full_name"),
      linkedDriverIds.length > 0
        ? admin
            .from("drivers")
            .select(
              "id,driver_no,company_id,auth_user_id,full_name,phone,contact_email,nationality,vehicle_make,vehicle_model,vehicle_plate,vehicle_type,status,created_at",
            )
            .in("id", linkedDriverIds)
            .order("full_name")
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (primaryDrivers.error) return fail(primaryDrivers.error.message, 500);
    if (linkedDrivers.error) return fail(linkedDrivers.error.message, 500);

    const driverMap = new Map<number, Record<string, any>>();
    for (const driver of [...(primaryDrivers.data ?? []), ...(linkedDrivers.data ?? [])]) {
      driverMap.set(Number(driver.id), driver);
    }

    const companyLinkRows = companyLinks.data ?? [];
    const customerLinkRows = customerLinks.data ?? [];
    const signedDocuments = await signDriverDocuments(
      admin,
      (documents.data ?? []) as DriverDocumentRow[],
    );

    const enrichedDrivers: Array<Record<string, any>> = [...driverMap.values()].map(
      (driver) => ({
        ...driver,
        company_links: companyLinkRows.filter((link) => link.driver_id === driver.id),
        customer_links: customerLinkRows.filter((link) => link.driver_id === driver.id),
        vehicle_documents: signedDocuments.filter(
          (document) => document.driver_id === driver.id,
        ),
      }),
    );
    enrichedDrivers.sort((a, b) =>
      String(a.full_name).localeCompare(String(b.full_name)),
    );
    const enrichedApplications = (applications.data ?? []).map((application) => ({
      ...application,
      vehicle_documents: signedDocuments.filter(
        (document) => document.application_id === application.id,
      ),
    }));

    return NextResponse.json({
      drivers: enrichedDrivers,
      companies: companies.data ?? [],
      customers: customers.data ?? [],
      signup_links: signupLinks.data ?? [],
      applications: enrichedApplications,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to load Driver Network.", 500);
  }
}

export async function POST(request: Request) {
  const scope = await requireAdministratorScope();
  if (!scope) return fail("Administrator access is required.", 403);
  if (scope.companyIds.length === 0) {
    return fail("No company is assigned to this administrator.", 403);
  }
  const user = scope.user;

  let body: RequestPayload;
  try {
    body = (await request.json()) as RequestPayload;
  } catch {
    return fail("Invalid request body.");
  }

  const admin = createAdminClient();

  try {
    if (body.action === "save_driver_network") {
      const driverId = Number(body.driver_id);
      const primaryCompanyId = Number(body.primary_company_id);
      const companyIds = positiveIds(body.company_ids);
      const customerIds = positiveIds(body.customer_ids);

      if (!Number.isInteger(driverId) || driverId <= 0) return fail("Select a driver.");
      if (!companyIds.includes(primaryCompanyId)) {
        return fail("The primary company must be one of the linked limousine companies.");
      }
      if (!areCompaniesInScope(scope, companyIds)) {
        return fail("You can only manage driver links for your assigned companies.", 403);
      }

      await validateLimousineCompanies(admin, companyIds);

      const { data: driver, error: driverError } = await admin
        .from("drivers")
        .select("id,auth_user_id,company_id")
        .eq("id", driverId)
        .maybeSingle();
      if (driverError) throw new Error(driverError.message);
      if (!driver) return fail("Driver was not found.", 404);

      const { data: visibleDriverLink, error: visibleDriverLinkError } = await admin
        .from("driver_company_links")
        .select("id")
        .eq("driver_id", driverId)
        .in("company_id", scope.companyIds)
        .limit(1)
        .maybeSingle();
      if (visibleDriverLinkError) throw new Error(visibleDriverLinkError.message);
      if (!isCompanyInScope(scope, Number(driver.company_id)) && !visibleDriverLink) {
        return fail("Driver was not found in your assigned companies.", 404);
      }

      const { data: existingPrimaryLink, error: existingPrimaryLinkError } = await admin
        .from("driver_company_links")
        .select("company_id")
        .eq("driver_id", driverId)
        .eq("is_primary", true)
        .eq("membership_status", "active")
        .limit(1)
        .maybeSingle();
      if (existingPrimaryLinkError) throw new Error(existingPrimaryLinkError.message);
      if (
        existingPrimaryLink &&
        !isCompanyInScope(scope, Number(existingPrimaryLink.company_id))
      ) {
        return fail(
          "This driver's primary company is managed by another company administrator.",
          403,
        );
      }

      let customerRows: Array<{
        id: number;
        company_id: number;
        customer_type: string;
      }> = [];
      if (customerIds.length > 0) {
        const { data, error } = await admin
          .from("customers")
          .select("id,company_id,customer_type")
          .in("id", customerIds)
          .in("company_id", scope.companyIds);
        if (error) throw new Error(error.message);
        customerRows = (data ?? []) as typeof customerRows;
        if (customerRows.length !== customerIds.length) {
          return fail("One or more selected clients or customers were not found.");
        }
        const invalidCustomer = customerRows.find(
          (customer) => !companyIds.includes(Number(customer.company_id)),
        );
        if (invalidCustomer) {
          return fail("Every selected client or customer must belong to a linked company.");
        }
      }

      const orderedCompanies = [
        primaryCompanyId,
        ...companyIds.filter((companyId) => companyId !== primaryCompanyId),
      ];
      for (const companyId of orderedCompanies) {
        const { error } = await admin.from("driver_company_links").upsert(
          {
            driver_id: driverId,
            company_id: companyId,
            is_primary: companyId === primaryCompanyId,
            membership_status: "active",
            created_by: user.id,
          },
          { onConflict: "driver_id,company_id" },
        );
        if (error) throw new Error(error.message);
      }

      const { data: existingCompanyLinks, error: existingCompanyError } = await admin
        .from("driver_company_links")
        .select("id,company_id")
        .eq("driver_id", driverId)
        .in("company_id", scope.companyIds);
      if (existingCompanyError) throw new Error(existingCompanyError.message);
      const removeCompanyLinkIds = (existingCompanyLinks ?? [])
        .filter((link) => !companyIds.includes(Number(link.company_id)))
        .map((link) => Number(link.id));

      if (removeCompanyLinkIds.length > 0) {
        const { error: removeCustomersError } = await admin
          .from("driver_customer_links")
          .delete()
          .eq("driver_id", driverId)
          .in(
            "company_id",
            (existingCompanyLinks ?? [])
              .filter((link) => removeCompanyLinkIds.includes(Number(link.id)))
              .map((link) => Number(link.company_id)),
          );
        if (removeCustomersError) throw new Error(removeCustomersError.message);

        const { error: removeCompaniesError } = await admin
          .from("driver_company_links")
          .delete()
          .in("id", removeCompanyLinkIds);
        if (removeCompaniesError) throw new Error(removeCompaniesError.message);
      }

      for (const customer of customerRows) {
        const { error } = await admin.from("driver_customer_links").upsert(
          {
            driver_id: driverId,
            company_id: customer.company_id,
            customer_id: customer.id,
            relationship_type:
              customer.customer_type === "individual" ? "customer" : "client",
            link_status: "active",
            created_by: user.id,
          },
          { onConflict: "driver_id,customer_id" },
        );
        if (error) throw new Error(error.message);
      }

      const { data: existingCustomerLinks, error: existingCustomerError } = await admin
        .from("driver_customer_links")
        .select("id,customer_id")
        .eq("driver_id", driverId)
        .in("company_id", scope.companyIds);
      if (existingCustomerError) throw new Error(existingCustomerError.message);
      const removeCustomerLinkIds = (existingCustomerLinks ?? [])
        .filter((link) => !customerIds.includes(Number(link.customer_id)))
        .map((link) => Number(link.id));
      if (removeCustomerLinkIds.length > 0) {
        const { error } = await admin
          .from("driver_customer_links")
          .delete()
          .in("id", removeCustomerLinkIds);
        if (error) throw new Error(error.message);
      }

      const { error: driverUpdateError } = await admin
        .from("drivers")
        .update({ company_id: primaryCompanyId, updated_by: user.id })
        .eq("id", driverId);
      if (driverUpdateError) throw new Error(driverUpdateError.message);

      await syncDriverLoginAccess(
        admin,
        driver.auth_user_id,
        primaryCompanyId,
        companyIds,
        scope.companyIds,
      );

      await writeAudit(admin, user.id, "driver_network_updated", "drivers", driverId, {
        primary_company_id: primaryCompanyId,
        company_ids: companyIds,
        customer_ids: customerIds,
      });

      return NextResponse.json({ success: true });
    }

    if (body.action === "create_signup_link") {
      const companyId = Number(body.company_id);
      if (!isCompanyInScope(scope, companyId)) {
        return fail("You can only create signup links for your assigned companies.", 403);
      }
      await validateLimousineCompanies(admin, [companyId]);

      const maxApplicationsRaw = Number(body.max_applications || 0);
      const maxApplications = maxApplicationsRaw > 0 ? Math.trunc(maxApplicationsRaw) : null;
      const expiresAt = clean(body.expires_at);

      const { data, error } = await admin
        .from("driver_signup_links")
        .insert({
          company_id: companyId,
          link_name: clean(body.link_name) ?? "Driver Recruitment",
          expires_at: expiresAt,
          max_applications: maxApplications,
          status: "active",
          created_by: user.id,
        })
        .select(
          "id,company_id,public_token,short_code,link_name,status,expires_at,max_applications,application_count,created_at",
        )
        .single();

      if (error || !data) throw new Error(error?.message ?? "Unable to create signup link.");

      await writeAudit(admin, user.id, "driver_signup_link_created", "driver_signup_links", data.id, {
        company_id: companyId,
        expires_at: expiresAt,
        max_applications: maxApplications,
      });

      return NextResponse.json({ success: true, signup_link: data });
    }

    if (body.action === "set_signup_link_status") {
      const signupLinkId = clean(body.signup_link_id);
      const status = body.status === "inactive" ? "inactive" : "active";
      if (!signupLinkId) return fail("Signup link ID is required.");

      const { data, error } = await admin
        .from("driver_signup_links")
        .update({ status })
        .eq("id", signupLinkId)
        .in("company_id", scope.companyIds)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return fail("Signup link was not found.", 404);

      await writeAudit(admin, user.id, "driver_signup_link_status_changed", "driver_signup_links", signupLinkId, {
        status,
      });
      return NextResponse.json({ success: true });
    }

    if (body.action === "approve_application") {
      const applicationId = Number(body.application_id);
      if (!Number.isInteger(applicationId) || applicationId <= 0) {
        return fail("Application ID is required.");
      }

      const { data: application, error: applicationError } = await admin
        .from("driver_signup_applications")
        .select("*")
        .eq("id", applicationId)
        .in("company_id", scope.companyIds)
        .maybeSingle();
      if (applicationError) throw new Error(applicationError.message);
      if (!application) return fail("Application was not found.", 404);
      if (application.status !== "pending") return fail("Only pending applications can be approved.");

      const email = cleanEmail(application.contact_email);
      if (!email || !email.includes("@")) {
        return fail("A valid driver email is required to create the login account.");
      }
      let existingDriver: { id: number; auth_user_id: string | null } | null = null;
      if (email) {
        const { data, error } = await admin
          .from("drivers")
          .select("id,auth_user_id")
          .ilike("contact_email", email)
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(error.message);
        existingDriver = data;
      }
      if (!existingDriver && application.phone) {
        const { data, error } = await admin
          .from("drivers")
          .select("id,auth_user_id")
          .eq("phone", application.phone)
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(error.message);
        existingDriver = data;
      }
      if (!existingDriver && application.vehicle_plate) {
        const { data, error } = await admin
          .from("drivers")
          .select("id,auth_user_id")
          .eq("vehicle_plate", application.vehicle_plate)
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(error.message);
        existingDriver = data;
      }

      let driverId = existingDriver?.id ?? 0;
      if (!driverId) {
        const { data: createdDriver, error: createError } = await admin
          .from("drivers")
          .insert({
            company_id: application.company_id,
            full_name: application.full_name,
            phone: application.phone,
            contact_email: email,
            address: application.address,
            nric_passport: null,
            nationality: application.nationality,
            date_of_birth: application.date_of_birth,
            licence_no: null,
            licence_class: null,
            licence_expiry: null,
            emergency_contact_name: application.emergency_contact_name,
            emergency_contact_phone: application.emergency_contact_phone,
            vehicle_make: application.vehicle_make,
            vehicle_model: application.vehicle_model,
            vehicle_plate: application.vehicle_plate,
            vehicle_type: application.vehicle_type,
            bank_name: application.bank_name,
            bank_account_name: application.bank_account_name,
            bank_account_no: application.bank_account_no,
            paynow_type: application.paynow_type,
            paynow_no: application.paynow_no,
            status: "active",
            notes: application.notes,
            login_enabled: false,
            created_by: user.id,
            updated_by: user.id,
          })
          .select("id")
          .single();
        if (createError || !createdDriver) {
          throw new Error(createError?.message ?? "Unable to create driver from application.");
        }
        driverId = createdDriver.id;
      }

      const { data: primaryLink, error: primaryError } = await admin
        .from("driver_company_links")
        .select("id")
        .eq("driver_id", driverId)
        .eq("is_primary", true)
        .eq("membership_status", "active")
        .limit(1)
        .maybeSingle();
      if (primaryError) throw new Error(primaryError.message);

      const { error: linkError } = await admin.from("driver_company_links").upsert(
        {
          driver_id: driverId,
          company_id: application.company_id,
          is_primary: !primaryLink,
          membership_status: "active",
          joined_at: new Date().toISOString().slice(0, 10),
          notes: `Approved from ${application.application_no ?? "driver signup application"}.`,
          created_by: user.id,
        },
        { onConflict: "driver_id,company_id" },
      );
      if (linkError) throw new Error(linkError.message);

      let loginResult: Awaited<ReturnType<typeof createOrAttachDriverLogin>> | null = null;
      if (existingDriver?.auth_user_id) {
        const { error: accessError } = await admin.from("user_company_access").upsert(
          {
            user_id: existingDriver.auth_user_id,
            company_id: application.company_id,
            can_view: true,
            can_create: false,
            can_edit: false,
            can_delete: false,
          },
          { onConflict: "user_id,company_id" },
        );
        if (accessError) throw new Error(accessError.message);
      } else {
        loginResult = await createOrAttachDriverLogin(admin, {
          driverId,
          companyId: Number(application.company_id),
          email,
          fullName: String(application.full_name),
          phone: clean(application.phone),
        });
      }

      const { error: reviewError } = await admin
        .from("driver_signup_applications")
        .update({
          status: "approved",
          driver_id: driverId,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: clean(body.review_notes),
        })
        .eq("id", applicationId)
        .in("company_id", scope.companyIds);
      if (reviewError) throw new Error(reviewError.message);

      const { error: documentReviewError } = await admin
        .from("driver_application_documents")
        .update({
          driver_id: driverId,
          upload_status: "verified",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: clean(body.review_notes),
        })
        .eq("application_id", applicationId)
        .in("company_id", scope.companyIds);
      if (documentReviewError) throw new Error(documentReviewError.message);

      await writeAudit(admin, user.id, "driver_application_approved", "driver_signup_applications", applicationId, {
        company_id: application.company_id,
        driver_id: driverId,
        existing_driver_linked: Boolean(existingDriver),
        login_account_created: Boolean(loginResult),
      });

      return NextResponse.json({
        success: true,
        driver_id: driverId,
        login_email: email,
        temporary_password: loginResult?.temporaryPassword ?? null,
        account_created: Boolean(loginResult),
      });
    }

    if (body.action === "reject_application") {
      const applicationId = Number(body.application_id);
      if (!Number.isInteger(applicationId) || applicationId <= 0) {
        return fail("Application ID is required.");
      }

      const { data, error } = await admin
        .from("driver_signup_applications")
        .update({
          status: "rejected",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: clean(body.review_notes),
        })
        .eq("id", applicationId)
        .eq("status", "pending")
        .in("company_id", scope.companyIds)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return fail("Pending application was not found.", 404);

      const { error: documentRejectError } = await admin
        .from("driver_application_documents")
        .update({
          upload_status: "rejected",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: clean(body.review_notes),
        })
        .eq("application_id", applicationId)
        .in("company_id", scope.companyIds);
      if (documentRejectError) throw new Error(documentRejectError.message);

      await writeAudit(admin, user.id, "driver_application_rejected", "driver_signup_applications", applicationId, {
        review_notes: clean(body.review_notes),
      });
      return NextResponse.json({ success: true });
    }

    return fail("Unsupported Driver Network action.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to update Driver Network.", 500);
  }
}
