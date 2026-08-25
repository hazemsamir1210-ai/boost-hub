// POST /api/save-sms-credentials
// Body: { academyId, smsAccountSid?, smsAuthToken?, smsFromNumber? }
// Write-only, same reasoning as save-payment-credentials.js — the browser
// (using the public anon key) should never be able to read these back.

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    return res.status(500).json({ error: "Server isn't configured yet — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel first." });
  }

  const { academyId, smsAccountSid, smsAuthToken, smsFromNumber } = req.body || {};
  if (!academyId) return res.status(400).json({ error: "Missing academyId" });

  const update = {};
  if (smsAccountSid) update.sms_account_sid = smsAccountSid;
  if (smsAuthToken) update.sms_auth_token = smsAuthToken;
  if (smsFromNumber) update.sms_from_number = smsFromNumber;
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
