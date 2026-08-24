// GET /api/payment-credentials-status?academyId=...
// Returns: { fawry: boolean, paymob: boolean } — whether this academy has
// saved its own credentials for each gateway, WITHOUT ever returning the
// actual secret values to the browser.

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const academyId = req.query?.academyId;
  if (!serviceKey || !supabaseUrl) return res.status(500).json({ error: "Server isn't configured yet" });
  if (!academyId) return res.status(400).json({ error: "Missing academyId" });

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/academies?id=eq.${academyId}&select=fawry_merchant_code,fawry_secure_key,paymob_secret_key,paymob_public_key,paymob_integration_id`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    const rows = await response.json();
    const row = rows[0] || {};
    return res.status(200).json({
      fawry: !!(row.fawry_merchant_code && row.fawry_secure_key),
      paymob: !!(row.paymob_secret_key && row.paymob_public_key && row.paymob_integration_id),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Could not check status" });
  }
};
