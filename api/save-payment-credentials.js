// POST /api/save-payment-credentials
// Body: {
//   academyId: string,
//   fawryMerchantCode?, fawrySecureKey?,
//   paymobSecretKey?, paymobPublicKey?, paymobIntegrationId?, paymobHmacSecret?,
// }
//
// Each academy's own merchant secret keys need somewhere to live that the
// browser can write to without ever being able to READ them back — the
// main app only ever uses the public Supabase anon key, and if these
// columns were selectable through that key, anyone could read another
// academy's secret keys straight out of the network tab. This endpoint
// uses the Supabase service_role key (server-side only, never sent to the
// browser) to write them instead, bypassing that exposure entirely.
//
// Needs the same SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY environment
// variables as the webhook functions.

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    return res.status(500).json({ error: "Server isn't configured yet — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel first." });
  }

  const { academyId, ...fields } = req.body || {};
  if (!academyId) return res.status(400).json({ error: "Missing academyId" });

  // Only ever writes a field if it was actually included in the request —
  // an admin re-saving their Fawry details shouldn't blank out Paymob's,
  // and leaving a field blank in the form should NOT be interpreted as
  // "clear this" (use the dedicated clear action for that instead, if you
  // add one — for now, blank fields are simply left untouched).
  const columnMap = {
    fawryMerchantCode: "fawry_merchant_code",
    fawrySecureKey: "fawry_secure_key",
    paymobSecretKey: "paymob_secret_key",
    paymobPublicKey: "paymob_public_key",
    paymobIntegrationId: "paymob_integration_id",
    paymobHmacSecret: "paymob_hmac_secret",
  };
  const update = {};
  for (const [key, column] of Object.entries(columnMap)) {
    if (fields[key] !== undefined && fields[key] !== "") update[column] = fields[key];
  }
  if (Object.keys(update).length === 0) return res.status(400).json({ error: "Nothing to save" });

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/academies?id=eq.${academyId}`, {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(update),
    });
    if (!response.ok) throw new Error(await response.text());
    return res.status(200).json({ saved: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Could not save" });
  }
};
