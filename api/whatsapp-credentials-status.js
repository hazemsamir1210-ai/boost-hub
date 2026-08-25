// GET /api/whatsapp-credentials-status?academyId=...
// Returns: { configured: boolean, templateName: string|null } — never
// returns the access token itself.

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const academyId = req.query?.academyId;
  if (!serviceKey || !supabaseUrl) return res.status(500).json({ error: "Server isn't configured yet" });
  if (!academyId) return res.status(400).json({ error: "Missing academyId" });

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/academies?id=eq.${academyId}&select=whatsapp_phone_number_id,whatsapp_access_token,whatsapp_template_name,whatsapp_reminder_days_before`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    const rows = await response.json();
    const row = rows[0] || {};
    return res.status(200).json({
      configured: !!(row.whatsapp_phone_number_id && row.whatsapp_access_token && row.whatsapp_template_name),
      templateName: row.whatsapp_template_name || null,
      reminderDaysBefore: row.whatsapp_reminder_days_before ?? 3,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Could not check status" });
  }
};
