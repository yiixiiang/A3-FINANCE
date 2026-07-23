import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function allowed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,status")
    .eq("id", user.id)
    .maybeSingle();

  return (
    profile?.status === "active" &&
    ["administrator", "admin"].includes(String(profile.role))
  );
}

async function assetUrl(
  admin: ReturnType<typeof createAdminClient>,
  path: string | null | undefined,
) {
  if (!path) return null;
  const { data } = await admin.storage
    .from("company-assets")
    .createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await allowed())) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const { id } = await params;
  const quotationId = Number(id);
  if (!Number.isInteger(quotationId) || quotationId <= 0) {
    return NextResponse.json(
      { error: "Invalid quotation ID." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: quotation, error } = await admin
    .from("quotations")
    .select("*,quotation_items(*),customers(*),companies(*)")
    .eq("id", quotationId)
    .single();

  if (error || !quotation) {
    return NextResponse.json(
      { error: error?.message || "Quotation was not found." },
      { status: 404 },
    );
  }

  let paymentGateways: Record<string, unknown>[] = [];
  if (quotation.payment_gateway_code) {
    const { data: gateways, error: gatewayError } = await admin
      .from("company_payment_gateways")
      .select(
        "id,company_id,gateway_code,display_name,enabled,fee_type,fee_value,fee_borne_by,minimum_amount,payment_instructions",
      )
      .eq("company_id", quotation.company_id)
      .eq("gateway_code", quotation.payment_gateway_code);

    if (gatewayError) {
      return NextResponse.json(
        { error: gatewayError.message },
        { status: 500 },
      );
    }
    paymentGateways = gateways ?? [];
  }

  const company = quotation.companies as
    | { logo_path?: string | null; company_chop_path?: string | null }
    | null;
  const [logoUrl, chopUrl] = await Promise.all([
    assetUrl(admin, company?.logo_path),
    assetUrl(admin, company?.company_chop_path),
  ]);

  return NextResponse.json({
    quotation: {
      ...quotation,
      company_payment_gateways: paymentGateways,
    },
    branding: {
      logo_url: logoUrl,
      chop_url: chopUrl,
    },
  });
}
