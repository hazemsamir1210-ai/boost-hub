// GET /api/sms-credentials-status?academyId=...
// Returns: { configured: boolean, fromNumber: string|null } — fromNumber is
// safe to show back (it's not a secret, just their sender number), unlike
// the account SID / auth token.

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const academyId = req.query?.academyId;
  if (!serviceKey || !supabaseUrl) return res.status(500).json({ error: "Server isn't configured yet" });
  if (!academyId) return res.status(400).json({ error: "Missing academyId" });

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/academies?id=eq.${academyId}&select=sms_account_sid,sms_auth_token,sms_from_number`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    const rows = await response.json();
    const row = rows[0] || {};
    return res.status(200).json({
      configured: !!(row.sms_account_sid && row.sms_auth_token && row.sms_from_number),
      fromNumber: row.sms_from_number || null,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Could not check status" });
  }
};
