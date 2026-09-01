// Shared by every /api/v1/*.js endpoint — looks up which academy (if any)
// a given API key belongs to. Keys are opaque random strings generated
// from Settings, stored directly on the academy row; there's no
// per-endpoint scoping yet (a key can read everything below), which is
// fine for a first version aimed at "one academy's own integrations",
// not a multi-tenant marketplace of third-party apps.

async function resolveAcademyByApiKey(apiKey) {
  if (!apiKey) return null;
  const response = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/academies?public_api_key=eq.${encodeURIComponent(apiKey)}&select=id,name,slug`,
    { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  const rows = await response.json();
  return rows[0] || null;
}

// Reads the key from either an "Authorization: Bearer xxx" header or an
// "x-api-key" header — whichever the calling tool finds easier to set.
function extractApiKey(req) {
  const auth = req.headers["authorization"] || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return req.headers["x-api-key"] || null;
}

module.exports = { resolveAcademyByApiKey, extractApiKey };
