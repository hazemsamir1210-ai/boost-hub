// POST /api/send-sms
// Body: { academyId: string, to: string, message: string }
// Returns: { sent: true } on success, or { error } on failure.
//
// Uses Twilio's Programmable Messaging API (https://www.twilio.com/docs/messaging).
// Each academy has its own Twilio Account SID / Auth Token / From number
// (saved via Settings, stored server-side only) — same reasoning as the
// Fawry/Paymob/WhatsApp integrations: an academy's messages should go out
// under THEIR own sender, not a shared platform-wide one.
//
// Needs SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (same as the other
// webhook/credential functions) to look up the academy's saved keys.

async function getAcademySmsCredentials(academyId) {
  const response = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/academies?id=eq.${academyId}&select=sms_account_sid,sms_auth_token,sms_from_number`,
    { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  const rows = await response.json();
  const row = rows[0];
  return row ? { accountSid: row.sms_account_sid, authToken: row.sms_auth_token, fromNumber: row.sms_from_number } : null;
}

// Egyptian numbers are usually stored as "01XXXXXXXXX" — Twilio wants
// E.164 format (e.g. "+201XXXXXXXXX").
function toE164Egypt(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("20")) return "+" + digits;
  if (digits.startsWith("0")) return "+20" + digits.slice(1);
  if (digits.startsWith("+")) return digits;
  return "+" + digits;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { academyId, to, message } = req.body || {};
  if (!academyId || !to || !message) return res.status(400).json({ error: "Missing required fields" });

  const creds = await getAcademySmsCredentials(academyId);
  if (!creds?.accountSid || !creds?.authToken || !creds?.fromNumber) {
    return res.status(400).json({ error: "This academy hasn't set up SMS yet — ask them to add it from Settings." });
  }

  try {
    const basicAuth = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64");
    const body = new URLSearchParams({
      To: toE164Egypt(to),
      From: creds.fromNumber,
      Body: message,
    });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Twilio rejected the request");
    return res.status(200).json({ sent: true, sid: data.sid });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Could not send SMS" });
  }
};
