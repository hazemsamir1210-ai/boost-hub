// POST /api/save-whatsapp-credentials
// Body: { academyId, whatsappPhoneNumberId?, whatsappAccessToken?, whatsappTemplateName?, whatsappReminderDaysBefore? }
//
// Same reasoning as save-payment-credentials.js — the access token is a
// secret that should never be readable back through the browser's anon-key
// Supabase connection, so this writes it server-side with the service_role
// key instead.

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    return res.status(500).json({ error: "Server isn't configured yet — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel first." });
  }

  const { academyId, ...fields } = req.body || {};
  if (!academyId) return res.status(400).json({ error: "Missing academyId" });

  const columnMap = {
    whatsappPhoneNumberId: "whatsapp_phone_number_id",
    whatsappAccessToken: "whatsapp_access_token",
    whatsappTemplateName: "whatsapp_template_name",
    whatsappReminderDaysBefore: "whatsapp_reminder_days_before",
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
