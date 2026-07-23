import { createClient } from "@supabase/supabase-js";

function requireSupabaseUrl(value: string | undefined) {
  if (!value || value.startsWith("your_") || value.includes("<project-ref>")) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL. Set it to your complete Supabase project URL in .env.local.",
    );
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    return value;
  } catch {
    throw new Error(
      "Invalid NEXT_PUBLIC_SUPABASE_URL. It must be a complete HTTP or HTTPS URL.",
    );
  }
}

export function createAdminClient() {
  const url = requireSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const secretKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secretKey || secretKey.startsWith("your_")) {
    throw new Error(
      "Missing SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in .env.local.",
    );
  }

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
