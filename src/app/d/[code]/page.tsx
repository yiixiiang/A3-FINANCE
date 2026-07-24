import { notFound } from "next/navigation";
import DriverSignupForm from "@/components/driver-signup-form";
import { createAdminClient } from "@/lib/supabase/admin";

type PageProps = { params: Promise<{ code: string }> };

export const dynamic = "force-dynamic";

export default async function ShortDriverSignupPage({ params }: PageProps) {
  const { code } = await params;
  const normalizedCode = String(code ?? "").trim();

  if (!/^[A-Za-z0-9]{6,64}$/.test(normalizedCode)) {
    notFound();
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("driver_signup_links")
    .select("public_token")
    .ilike("short_code", normalizedCode)
    .maybeSingle();

  if (error || !data?.public_token) {
    notFound();
  }

  return <DriverSignupForm accessKey={String(data.public_token)} />;
}
