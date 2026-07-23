import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

async function signedUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string | null,
) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from("driver-documents")
    .createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

async function getDriverProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Please sign in.", 401);

  const driverSelect = `
      id,
      driver_no,
      company_id,
      auth_user_id,
      full_name,
      phone,
      contact_email,
      login_email,
      address,
      nric_passport,
      nationality,
      date_of_birth,
      licence_no,
      licence_class,
      licence_expiry,
      emergency_contact_name,
      emergency_contact_phone,
      vehicle_make,
      vehicle_model,
      vehicle_plate,
      vehicle_type,
      bank_name,
      bank_account_name,
      bank_account_no,
      paynow_type,
      paynow_no,
      profile_photo_path,
      licence_front_path,
      licence_back_path,
      identity_document_path,
      status,
      notes,
      companies(name, company_type)
      `;

  let { data: driver, error } = await supabase
    .from("drivers")
    .select(driverSelect)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);

  // Repair older/imported records where the driver email exists but auth_user_id
  // was never populated. Exact email matching and role checks prevent a login
  // from claiming an unrelated driver profile.
  if (!driver && user.email) {
    const normalizedEmail = user.email.trim().toLowerCase();
    const admin = createAdminClient();

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) return jsonError(profileError.message, 500);

    const canClaimDriverProfile =
      !profile || profile.role === "user" || profile.role === "driver";

    if (canClaimDriverProfile) {
      const { data: candidate, error: candidateError } = await admin
        .from("drivers")
        .select("id, company_id, full_name, phone, status, auth_user_id")
        .ilike("login_email", normalizedEmail)
        .maybeSingle();

      if (candidateError) return jsonError(candidateError.message, 500);

      if (candidate && !candidate.auth_user_id) {
        const { data: linked, error: linkError } = await admin
          .from("drivers")
          .update({
            auth_user_id: user.id,
            login_email: normalizedEmail,
            login_enabled: true,
          })
          .eq("id", candidate.id)
          .is("auth_user_id", null)
          .select("id")
          .maybeSingle();

        if (linkError) return jsonError(linkError.message, 500);

        if (linked) {
          const { error: linkedProfileError } = await admin.from("profiles").upsert({
            id: user.id,
            email: normalizedEmail,
            full_name: candidate.full_name,
            phone: candidate.phone,
            job_title: "Driver",
            role: "driver",
            status: candidate.status,
            active_company_id: candidate.company_id,
          });

          if (linkedProfileError) return jsonError(linkedProfileError.message, 500);

          const { error: accessError } = await admin
            .from("user_company_access")
            .upsert(
              {
                user_id: user.id,
                company_id: candidate.company_id,
                can_view: true,
                can_create: false,
                can_edit: false,
                can_delete: false,
              },
              { onConflict: "user_id,company_id" },
            );

          if (accessError) return jsonError(accessError.message, 500);

          ({ data: driver, error } = await supabase
            .from("drivers")
            .select(driverSelect)
            .eq("auth_user_id", user.id)
            .maybeSingle());

          if (error) return jsonError(error.message, 500);
        }
      }
    }
  }

  if (!driver) {
    return jsonError(
      "Driver profile is not linked to this login. Ask an administrator to open Drivers and create or link the login using the same email address.",
      404,
    );
  }

  const [profilePhotoUrl, licenceFrontUrl, licenceBackUrl, identityDocumentUrl] =
    await Promise.all([
      signedUrl(supabase, driver.profile_photo_path),
      signedUrl(supabase, driver.licence_front_path),
      signedUrl(supabase, driver.licence_back_path),
      signedUrl(supabase, driver.identity_document_path),
    ]);

  const [jobsResult, payoutsResult, companyLinksResult, customerLinksResult, vehicleDocumentsResult] = await Promise.all([
    supabase
      .from("driver_jobs")
      .select("id, job_reference, job_date, service_type, gross_amount, driver_amount, status")
      .eq("driver_id", driver.id)
      .order("job_date", { ascending: false })
      .limit(20),
    supabase
      .from("driver_payouts")
      .select(
        "id, payout_no, period_start, period_end, gross_earnings, deductions, advances, net_payout, amount_paid, outstanding_amount, payment_date, status",
      )
      .eq("driver_id", driver.id)
      .order("period_end", { ascending: false })
      .limit(20),
    supabase
      .from("driver_company_links")
      .select("company_id,is_primary,membership_status,joined_at,companies(name,company_type)")
      .eq("driver_id", driver.id)
      .eq("membership_status", "active")
      .order("is_primary", { ascending: false }),
    supabase
      .from("driver_customer_links")
      .select("company_id,customer_id,relationship_type,link_status,customers(customer_name,customer_type,contact_person,phone,email)")
      .eq("driver_id", driver.id)
      .eq("link_status", "active")
      .order("relationship_type"),
    supabase
      .from("driver_application_documents")
      .select("id,application_id,company_id,document_type,storage_path,original_filename,mime_type,size_bytes,upload_status,uploaded_at")
      .eq("driver_id", driver.id)
      .in("upload_status", ["uploaded", "verified"])
      .order("created_at", { ascending: false }),
  ]);

  const relatedError =
    jobsResult.error ??
    payoutsResult.error ??
    companyLinksResult.error ??
    customerLinksResult.error ??
    vehicleDocumentsResult.error;
  if (relatedError) return jsonError(relatedError.message, 500);

  const vehicleDocuments = await Promise.all(
    (vehicleDocumentsResult.data ?? []).map(async (document) => ({
      ...document,
      signed_url: await signedUrl(supabase, document.storage_path),
    })),
  );

  return NextResponse.json({
    driver: {
      ...driver,
      document_urls: {
        profile_photo: profilePhotoUrl,
        licence_front: licenceFrontUrl,
        licence_back: licenceBackUrl,
        identity_document: identityDocumentUrl,
      },
    },
    jobs: jobsResult.data ?? [],
    payouts: payoutsResult.data ?? [],
    company_links: companyLinksResult.data ?? [],
    customer_links: customerLinksResult.data ?? [],
    vehicle_documents: vehicleDocuments,
  });
}

async function updateDriverProfile(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("Please sign in.", 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid request body.");
  }

  const payNowType = clean(body.paynow_type);
  if (payNowType && !["mobile", "nric", "uen", "other"].includes(payNowType)) {
    return jsonError("Invalid PayNow type.");
  }

  const { data, error } = await supabase.rpc("update_own_driver_profile", {
    p_phone: clean(body.phone),
    p_contact_email: clean(body.contact_email),
    p_address: clean(body.address),
    p_emergency_contact_name: clean(body.emergency_contact_name),
    p_emergency_contact_phone: clean(body.emergency_contact_phone),
    p_vehicle_make: clean(body.vehicle_make),
    p_vehicle_model: clean(body.vehicle_model),
    p_vehicle_plate: clean(body.vehicle_plate),
    p_vehicle_type: clean(body.vehicle_type),
    p_bank_name: clean(body.bank_name),
    p_bank_account_name: clean(body.bank_account_name),
    p_bank_account_no: clean(body.bank_account_no),
    p_paynow_type: payNowType,
    p_paynow_no: clean(body.paynow_no),
    p_notes: clean(body.notes),
  });

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ success: true, driver_id: data });
}


export async function GET() {
  try {
    return await getDriverProfile();
  } catch (error) {
    console.error("Driver profile GET failed:", error);
    return jsonError("Unable to load the driver profile because the server connection failed.", 500);
  }
}

export async function POST(request: Request) {
  try {
    return await updateDriverProfile(request);
  } catch (error) {
    console.error("Driver profile POST failed:", error);
    return jsonError("Unable to update the driver profile because the server connection failed.", 500);
  }
}
