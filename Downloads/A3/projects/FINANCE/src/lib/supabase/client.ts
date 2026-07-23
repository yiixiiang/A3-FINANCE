import { createBrowserClient } from "@supabase/ssr";

const FALLBACK_URL = "https://placeholder.supabase.co";
const FALLBACK_ANON_KEY = "placeholder-anon-key";

function isValidHttpUrl(value: string | undefined): value is string {
  if (!value) return false;

  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function hasRealValue(value: string | undefined): value is string {
  return Boolean(
    value && !value.startsWith("your_") && !value.includes("<project-ref>"),
  );
}

/**
 * Creates the browser Supabase client.
 *
 * Client Components are evaluated while Next.js prerenders pages. Missing or
 * placeholder environment values must not crash that server-side evaluation.
 * A non-networked placeholder client is therefore used only during prerendering.
 * In the browser, invalid configuration still produces a clear actionable error.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const invalidConfig = !isValidHttpUrl(url) || !hasRealValue(anonKey);

  if (invalidConfig) {
    if (typeof window === "undefined") {
      return createBrowserClient(FALLBACK_URL, FALLBACK_ANON_KEY);
    }

    throw new Error(
      "Invalid Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL to a complete HTTP/HTTPS project URL and set NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
    );
  }

  return createBrowserClient(url, anonKey);
}
