"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/login?error=Enter%20your%20email%20and%20password.");
  }

  const supabase = await createClient();
  const { data: signInResult, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !signInResult.user) {
    redirect(`/login?error=${encodeURIComponent(error?.message ?? "Unable to sign in.")}`);
  }

  await supabase.rpc("bootstrap_first_admin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("status, role")
    .eq("id", signInResult.user.id)
    .maybeSingle();

  if (profile?.status === "inactive") {
    await supabase.auth.signOut();
    redirect("/login?error=This%20account%20is%20inactive.%20Contact%20the%20administrator.");
  }

  if (profile?.role === "driver") {
    redirect("/driver/profile");
  }

  redirect("/dashboard");
}
