const API_VERSION = "2024-01-01";

export function getSupabaseConfig(env = process.env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server credentials are not configured");
  return { url: url.replace(/\/$/, ""), key };
}

export async function supabaseRequest(path, options = {}, { fetchImpl = fetch, env = process.env } = {}) {
  const { url, key } = getSupabaseConfig(env);
  const response = await fetchImpl(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "Accept-Profile": "public",
      "Content-Profile": "public",
      "Accept": "application/json",
      "X-Client-Info": `knowvia/${API_VERSION}`,
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(payload?.message || `Supabase request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
}
