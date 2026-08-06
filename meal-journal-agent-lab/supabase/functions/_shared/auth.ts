import { createClient } from "npm:@supabase/supabase-js@2";

export function userClient(request: Request) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = request.headers.get("Authorization") || "";
  if (!url || !key || !authorization) throw new Error("AUTH_CONFIGURATION_MISSING");
  return createClient(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requirePermanentUser(client: ReturnType<typeof userClient>) {
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user || user.is_anonymous || !user.email) throw new Error("AUTH_REQUIRED");
  return user;
}
