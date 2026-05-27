import { createBrowserClient } from "@supabase/ssr";

// Call this inside Client Components to get a Supabase client with
// auth session management backed by cookies (required for App Router).
// Do not call at module level — createBrowserClient must run in the browser.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// Dev-only: log whether the required env vars are present and show the host.
// Removed automatically in production builds (NODE_ENV === 'production').
if (process.env.NODE_ENV === "development") {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let host = "(not set)";
  try {
    if (url) host = new URL(url).host;
  } catch {
    host = "(invalid URL)";
  }
  console.log(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL present:", !!url, "| host:", host,
  );
  console.log("[supabase] NEXT_PUBLIC_SUPABASE_ANON_KEY present:", !!key);
}
