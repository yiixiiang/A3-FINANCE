import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const documentBucket = "driver-documents";
const maxFiles = 6;
const maxFileSize = 10 * 1024 * 1024;
const uploadSessionLifetimeMs = 2 * 60 * 60 * 1000;
const allowedMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);

type RouteContext = { params: Promise<{ token: string }> };

type VehicleFileRequest = {
  name?: string;
  type?: string;
  size?: number;
};

type SignupBody = {
  action?: "start_application";
  full_name?: string;
  phone?: string;
  contact_email?: string;
  address?: string;
  nationality?: string;
  date_of_birth?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_plate?: string;
  vehicle_type?: string;
  bank_name?: string;
  bank_account_name?: string;
  bank_account_no?: string;
  paynow_type?: string;
  paynow_no?: string;
  notes?: string;
  consent_confirmed?: boolean;
  files?: VehicleFileRequest[];
};

type ApplicationActionBody = {
  action?: "finalize_application" | "cancel_application";
  application_id?: number;
  submission_token?: string;
};

type RequestBody = SignupBody | ApplicationActionBody;

type SignupLinkRecord = Record<string, any> & {
  id: string;
  company_id: number;
  companies?: Record<string, any> | Record<string, any>[] | null;
};

type UploadDocumentRow = {
  id: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
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

function cleanDate(value: unknown): string | null {
  const result = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : null;
}

function safeFileName(value: unknown) {
  const cleaned = String(value ?? "vehicle-document")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return cleaned || "vehicle-document";
}

function validateVehicleFiles(files: VehicleFileRequest[] | undefined) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("Upload at least one vehicle document or vehicle photo.");
  }
  if (files.length > maxFiles) {
    throw new Error(`Upload no more than ${maxFiles} vehicle files.`);
  }

  return files.map((file, index) => {
    const name = safeFileName(file.name);
    const type = clean(file.type);
    const size = Number(file.size);

    if (!type || !allowedMimeTypes.has(type)) {
      throw new Error(`Vehicle file ${index + 1} must be PNG, JPG, WEBP or PDF.`);
    }
    if (!Number.isFinite(size) || size <= 0 || size > maxFileSize) {
      throw new Error(`Vehicle file ${index + 1} must be 10 MB or smaller.`);
    }

    return { name, type, size: Math.trunc(size) };
  });
}

async function loadSignupLink(accessKey: string) {
  const admin = createAdminClient();
  const key = String(accessKey ?? "").trim();
  if (!/^[A-Za-z0-9-]{6,64}$/.test(key)) {
    return { admin, link: null as SignupLinkRecord | null };
  }

  const { data, error } = await admin
    .from("driver_signup_links")
    .select(
      "id,company_id,public_token,short_code,link_name,status,expires_at,max_applications,application_count,companies(id,name,company_type,status,address,phone,email,logo_path,primary_colour,secondary_colour,accent_colour)",
    )
    .or(`public_token.eq.${key},short_code.ilike.${key}`)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return { admin, link: data as SignupLinkRecord | null };
}

function linkAvailability(link: SignupLinkRecord | null) {
  if (!link) return { available: false, message: "This driver signup link was not found." };
  if (link.status !== "active") {
    return { available: false, message: "This driver signup link is currently inactive." };
  }
  if (link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) {
    return { available: false, message: "This driver signup link has expired." };
  }
  if (
    link.max_applications !== null &&
    Number(link.application_count || 0) >= Number(link.max_applications)
  ) {
    return { available: false, message: "This driver signup link has reached its application limit." };
  }

  const company = Array.isArray(link.companies) ? link.companies[0] : link.companies;
  if (!company || company.company_type !== "limousine" || company.status !== "active") {
    return { available: false, message: "The selected limousine company is not accepting applications." };
  }
  return { available: true, message: "" };
}

async function companyLogoUrl(
  admin: ReturnType<typeof createAdminClient>,
  logoPath: string | null | undefined,
) {
  if (!logoPath) return null;
  const { data } = await admin.storage
    .from("company-assets")
    .createSignedUrl(logoPath, 60 * 60);
  return data?.signedUrl ?? null;
}

async function removeApplicationFiles(
  admin: ReturnType<typeof createAdminClient>,
  documents: Array<{ storage_path: string }>,
) {
  const paths = documents.map((document) => document.storage_path).filter(Boolean);
  if (paths.length === 0) return;

  const { error } = await admin.storage.from(documentBucket).remove(paths);
  if (error) throw new Error(error.message);
}

async function cleanupExpiredUploadSessions(
  admin: ReturnType<typeof createAdminClient>,
  companyId: number,
  phone: string,
  email: string | null,
) {
  const cutoff = new Date(Date.now() - uploadSessionLifetimeMs).toISOString();
  const { data: staleApplications, error: staleError } = await admin
    .from("driver_signup_applications")
    .select("id,phone,contact_email")
    .eq("company_id", companyId)
    .eq("status", "uploading")
    .lt("submitted_at", cutoff)
    .limit(100);
  if (staleError) throw new Error(staleError.message);

  const staleIds = (staleApplications ?? [])
    .filter(
      (application) =>
        application.phone === phone ||
        Boolean(email && application.contact_email === email),
    )
    .map((application) => Number(application.id))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (staleIds.length === 0) return;

  const { data: documents, error: documentError } = await admin
    .from("driver_application_documents")
    .select("storage_path")
    .in("application_id", staleIds);
  if (documentError) throw new Error(documentError.message);

  await removeApplicationFiles(admin, documents ?? []);

  const { error: deleteError } = await admin
    .from("driver_signup_applications")
    .delete()
    .in("id", staleIds)
    .eq("status", "uploading");
  if (deleteError) throw new Error(deleteError.message);
}

async function cancelUploadSession(
  admin: ReturnType<typeof createAdminClient>,
  linkId: string,
  body: ApplicationActionBody,
) {
  const applicationId = Number(body.application_id);
  const submissionToken = clean(body.submission_token);
  if (!Number.isInteger(applicationId) || applicationId <= 0 || !submissionToken) {
    return fail("The vehicle upload session is invalid.");
  }

  const { data: application, error } = await admin
    .from("driver_signup_applications")
    .select("id,status")
    .eq("id", applicationId)
    .eq("signup_link_id", linkId)
    .eq("submission_token", submissionToken)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!application || application.status !== "uploading") {
    return NextResponse.json({ success: true });
  }

  const { data: documents, error: documentError } = await admin
    .from("driver_application_documents")
    .select("storage_path")
    .eq("application_id", applicationId);
  if (documentError) throw new Error(documentError.message);

  await removeApplicationFiles(admin, documents ?? []);
  const { error: deleteError } = await admin
    .from("driver_signup_applications")
    .delete()
    .eq("id", applicationId)
    .eq("status", "uploading");
  if (deleteError) throw new Error(deleteError.message);

  return NextResponse.json({ success: true });
}

async function finalizeUploadSession(
  admin: ReturnType<typeof createAdminClient>,
  link: SignupLinkRecord,
  body: ApplicationActionBody,
) {
  const applicationId = Number(body.application_id);
  const submissionToken = clean(body.submission_token);
  if (!Number.isInteger(applicationId) || applicationId <= 0 || !submissionToken) {
    return fail("The vehicle upload session is invalid.");
  }

  const availability = linkAvailability(link);
  if (!availability.available) return fail(availability.message, 410);

  const { data: application, error: applicationError } = await admin
    .from("driver_signup_applications")
    .select("id,application_no,status,company_id,submitted_at")
    .eq("id", applicationId)
    .eq("signup_link_id", link.id)
    .eq("submission_token", submissionToken)
    .maybeSingle();
  if (applicationError) throw new Error(applicationError.message);
  if (!application) return fail("Driver application upload session was not found.", 404);
  if (application.status !== "uploading") {
    if (application.status === "pending") {
      return NextResponse.json({
        success: true,
        application_no: application.application_no,
        submitted_at: application.submitted_at,
      });
    }
    return fail("This driver application can no longer be finalized.", 409);
  }

  const { data: documents, error: documentError } = await admin
    .from("driver_application_documents")
    .select("id,storage_path,original_filename,mime_type,size_bytes")
    .eq("application_id", applicationId)
    .order("created_at");
  if (documentError) throw new Error(documentError.message);
  const documentRows = (documents ?? []) as UploadDocumentRow[];
  if (documentRows.length === 0) {
    return fail("Upload at least one vehicle document before submitting.");
  }

  const folder = `applications/${application.company_id}/${applicationId}`;
  const { data: storedFiles, error: listError } = await admin.storage
    .from(documentBucket)
    .list(folder, { limit: maxFiles + 10 });
  if (listError) throw new Error(listError.message);

  const storedPaths = new Set(
    (storedFiles ?? [])
      .filter((file) => Boolean(file.name))
      .map((file) => `${folder}/${file.name}`),
  );
  const missing = documentRows.filter((document) => !storedPaths.has(document.storage_path));
  if (missing.length > 0) {
    return fail(
      `Vehicle upload is incomplete. Missing ${missing.length} file${missing.length === 1 ? "" : "s"}.`,
      409,
    );
  }

  const completedAt = new Date().toISOString();
  const { error: markDocumentsError } = await admin
    .from("driver_application_documents")
    .update({ upload_status: "uploaded", uploaded_at: completedAt })
    .eq("application_id", applicationId);
  if (markDocumentsError) throw new Error(markDocumentsError.message);

  const { data: finalized, error: finalizeError } = await admin
    .from("driver_signup_applications")
    .update({
      status: "pending",
      submitted_at: completedAt,
      upload_completed_at: completedAt,
    })
    .eq("id", applicationId)
    .eq("status", "uploading")
    .select("application_no,submitted_at")
    .maybeSingle();
  if (finalizeError) throw new Error(finalizeError.message);
  if (!finalized) return fail("The driver application was already finalized.", 409);

  return NextResponse.json({
    success: true,
    application_no: finalized.application_no,
    submitted_at: finalized.submitted_at,
    document_count: documentRows.length,
  });
}

async function startApplication(
  admin: ReturnType<typeof createAdminClient>,
  link: SignupLinkRecord,
  body: SignupBody,
) {
  const fullName = clean(body.full_name);
  const phone = clean(body.phone);
  const email = cleanEmail(body.contact_email);
  const emergencyName = clean(body.emergency_contact_name);
  const emergencyPhone = clean(body.emergency_contact_phone);
  const vehicleModel = clean(body.vehicle_model);
  const vehiclePlate = clean(body.vehicle_plate)?.toUpperCase() ?? null;
  const bankName = clean(body.bank_name);
  const bankAccountName = clean(body.bank_account_name);
  const bankAccountNo = clean(body.bank_account_no);
  const payNowType = clean(body.paynow_type);
  const payNowNo = clean(body.paynow_no);
  let files: ReturnType<typeof validateVehicleFiles>;
  try {
    files = validateVehicleFiles(body.files);
  } catch (validationError) {
    return fail(
      validationError instanceof Error
        ? validationError.message
        : "Invalid vehicle document selection.",
    );
  }

  if (!fullName || !phone) return fail("Name and contact number are required.");
  if (!email || !email.includes("@")) {
    return fail("A valid email address is required to create the driver login after approval.");
  }
  if (!vehicleModel || !vehiclePlate) return fail("Car model and car plate are required.");
  if (!emergencyName || !emergencyPhone) {
    return fail("Emergency contact name and contact number are required.");
  }
  if (!bankName || !bankAccountName || !bankAccountNo) {
    return fail("Bank name, account name and account number are required.");
  }
  if (!payNowType || !["mobile", "uen", "other"].includes(payNowType) || !payNowNo) {
    return fail("PayNow type and PayNow number are required.");
  }
  if (!body.consent_confirmed) {
    return fail("Confirm the information and privacy consent before submitting.");
  }

  await cleanupExpiredUploadSessions(
    admin,
    Number(link.company_id),
    phone,
    email,
  );

  if (email) {
    const { data: duplicate, error: duplicateError } = await admin
      .from("driver_signup_applications")
      .select("application_no,status")
      .eq("company_id", Number(link.company_id))
      .eq("contact_email", email)
      .in("status", ["uploading", "pending"])
      .limit(1)
      .maybeSingle();
    if (duplicateError) throw new Error(duplicateError.message);
    if (duplicate) {
      return fail(
        `An active application already exists for this email${
          duplicate.application_no ? ` (${duplicate.application_no})` : ""
        }.`,
        409,
      );
    }
  }

  const { data: duplicatePhone, error: duplicatePhoneError } = await admin
    .from("driver_signup_applications")
    .select("application_no,status")
    .eq("company_id", Number(link.company_id))
    .eq("phone", phone)
    .in("status", ["uploading", "pending"])
    .limit(1)
    .maybeSingle();
  if (duplicatePhoneError) throw new Error(duplicatePhoneError.message);
  if (duplicatePhone) {
    return fail(
      `An active application already exists for this contact number${
        duplicatePhone.application_no ? ` (${duplicatePhone.application_no})` : ""
      }.`,
      409,
    );
  }

  const { data: application, error: insertError } = await admin
    .from("driver_signup_applications")
    .insert({
      signup_link_id: link.id,
      company_id: link.company_id,
      full_name: fullName,
      phone,
      contact_email: email,
      address: clean(body.address),
      nric_passport: null,
      nationality: clean(body.nationality),
      date_of_birth: cleanDate(body.date_of_birth),
      licence_no: null,
      licence_class: null,
      licence_expiry: null,
      emergency_contact_name: emergencyName,
      emergency_contact_phone: emergencyPhone,
      vehicle_make: clean(body.vehicle_make),
      vehicle_model: vehicleModel,
      vehicle_plate: vehiclePlate,
      vehicle_type: clean(body.vehicle_type),
      bank_name: bankName,
      bank_account_name: bankAccountName,
      bank_account_no: bankAccountNo,
      paynow_type: payNowType,
      paynow_no: payNowNo,
      notes: clean(body.notes),
      consent_confirmed: true,
      status: "uploading",
    })
    .select("id,application_no,submission_token,submitted_at,company_id")
    .single();

  if (insertError || !application) {
    if (insertError?.message.toLowerCase().includes("pending_email")) {
      return fail("An active application already exists for this email.", 409);
    }
    throw new Error(insertError?.message ?? "Unable to start driver application.");
  }

  const documentRows: UploadDocumentRow[] = [];
  const signedUploads: Array<{
    document_id: string;
    path: string;
    token: string;
    original_filename: string;
  }> = [];

  try {
    for (const file of files) {
      const storagePath = `applications/${application.company_id}/${application.id}/${randomUUID()}-${file.name}`;
      const { data: signed, error: signedError } = await admin.storage
        .from(documentBucket)
        .createSignedUploadUrl(storagePath);
      if (signedError || !signed?.token) {
        throw new Error(signedError?.message ?? "Unable to prepare vehicle file upload.");
      }

      const documentId = randomUUID();
      documentRows.push({
        id: documentId,
        storage_path: storagePath,
        original_filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      });
      signedUploads.push({
        document_id: documentId,
        path: storagePath,
        token: signed.token,
        original_filename: file.name,
      });
    }

    const { error: documentInsertError } = await admin
      .from("driver_application_documents")
      .insert(
        documentRows.map((document) => ({
          ...document,
          application_id: application.id,
          company_id: application.company_id,
          document_type: "vehicle_document",
          storage_bucket: documentBucket,
          upload_status: "pending",
        })),
      );
    if (documentInsertError) throw new Error(documentInsertError.message);
  } catch (error) {
    await admin
      .from("driver_signup_applications")
      .delete()
      .eq("id", application.id)
      .eq("status", "uploading");
    throw error;
  }

  return NextResponse.json({
    success: true,
    application_id: application.id,
    application_no: application.application_no,
    submission_token: application.submission_token,
    uploads: signedUploads,
  });
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { token } = await params;
    const { admin, link } = await loadSignupLink(token);
    const availability = linkAvailability(link);
    if (!availability.available) return fail(availability.message, link ? 410 : 404);

    const company = Array.isArray(link?.companies) ? link.companies[0] : link?.companies;
    const logoUrl = await companyLogoUrl(admin, company?.logo_path);

    return NextResponse.json({
      signup: {
        link_name: link?.link_name,
        expires_at: link?.expires_at,
        company: {
          id: company?.id,
          name: company?.name,
          address: company?.address,
          phone: company?.phone,
          email: company?.email,
          primary_colour: company?.primary_colour,
          secondary_colour: company?.secondary_colour,
          accent_colour: company?.accent_colour,
          logo_url: logoUrl,
        },
        upload_rules: {
          required: true,
          max_files: maxFiles,
          max_file_size_mb: maxFileSize / 1024 / 1024,
          accepted: ["PNG", "JPG", "WEBP", "PDF"],
        },
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to open driver signup.", 500);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return fail("Invalid application details.");
  }

  try {
    const { token } = await params;
    const { admin, link } = await loadSignupLink(token);
    if (!link) return fail("This driver signup link was not found.", 404);

    if (body.action === "cancel_application") {
      return await cancelUploadSession(admin, link.id, body);
    }
    if (body.action === "finalize_application") {
      return await finalizeUploadSession(admin, link, body);
    }

    const availability = linkAvailability(link);
    if (!availability.available) return fail(availability.message, 410);
    return await startApplication(admin, link, body as SignupBody);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to submit driver application.", 500);
  }
}
