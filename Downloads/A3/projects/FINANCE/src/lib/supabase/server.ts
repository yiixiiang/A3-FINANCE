import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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
      "Invalid NEXT_PUBLIC_SUPABASE_URL. It must be a complete HTTP or HTTPS URL, for example https://your-project-ref.supabase.co.",
    );
  }
}

function requireAnonKey(value: string | undefined) {
  if (!value || value.startsWith("your_")) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY. Add the project's anon or publishable key to .env.local.",
    );
  }
  return value;
}

export async function createClient() {
  const url = requireSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = requireAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot always write cookies. Server Actions can.
        }
      },
    },
  });
}
