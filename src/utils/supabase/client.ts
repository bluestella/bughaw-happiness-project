import { createBrowserClient } from "@supabase/ssr";

function getSupabaseCredentials() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

export function createClient() {
  const { url, key } = getSupabaseCredentials();

  if (!url || !key) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createBrowserClient(
    url,
    key
  );
}