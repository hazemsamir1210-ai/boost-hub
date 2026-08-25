// GET /api/whatsapp-reminder-cron
// Triggered automatically once a day by Vercel Cron (see vercel.json) — not
// meant to be called directly, though it's safe to hit manually to test.
//
// For every academy that has WhatsApp set up (Settings → Online payments →
// WhatsApp), checks how many days are left in the current month. Once that
// reaches the academy's chosen "remind X days before month end" setting,
// every enrolled swimmer who hasn't paid for the current month yet (and
// hasn't already gotten a reminder this month) gets one WhatsApp message.
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (same as the other
// server-side functions) — this runs with no logged-in user at all, so it
// can only use the service_role key, never the browser's anon key.

const { sendWhatsAppTemplate } = require("./_whatsapp-utils");

async function supabaseRequest(path, options = {}) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${path}`;
  const r = await fetch(url, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`Supabase request failed: ${r.status} ${await r.text()}`);
  return r.json();
}

function daysLeftInMonth() {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return lastDay - now.getDate();
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

module.exports = async (req, res) => {
  const monthKey = currentMonthKey();
  const remaining = daysLeftInMonth();
  const results = { academiesChecked: 0, remindersSent: 0, errors: [] };

  try {
    const academies = await supabaseRequest(
      "academies?whatsapp_phone_number_id=not.is.null&whatsapp_access_token=not.is.null&whatsapp_template_name=not.is.null&select=id,name,whatsapp_phone_number_id,whatsapp_access_token,whatsapp_template_name,whatsapp_reminder_days_before"
    );

    for (const academy of academies) {
      results.academiesChecked++;
      const reminderDaysBefore = academy.whatsapp_reminder_days_before ?? 3;
      if (remaining > reminderDaysBefore) continue; // not time yet for this academy

      const swimmerRows = await supabaseRequest(`swimmers?academy_id=eq.${academy.id}&select=id,data`);
      for (const row of swimmerRows) {
        const swimmer = row.data;
        if (!swimmer?.day || !swimmer?.time) continue; // not actually enrolled
        const paidMonths = swimmer.paidMonths || [];
        if (paidMonths.includes(monthKey)) continue; // already paid
        if (swimmer.lastPaymentReminderSent === monthKey) continue; // already reminded this month
        if (!swimmer.phone) continue;

        try {
          await sendWhatsAppTemplate({
            phoneNumberId: academy.whatsapp_phone_number_id,
            accessToken: academy.whatsapp_access_token,
            to: swimmer.phone,
            templateName: academy.whatsapp_template_name,
            params: [swimmer.name, academy.name],
          });
          await supabaseRequest(`swimmers?id=eq.${row.id}&academy_id=eq.${academy.id}`, {
            method: "PATCH",
            body: JSON.stringify({ data: { ...swimmer, lastPaymentReminderSent: monthKey } }),
          });
          results.remindersSent++;
        } catch (e) {
          results.errors.push(`${academy.name} — ${swimmer.name}: ${e.message}`);
        }
      }
    }

    return res.status(200).json(results);
  } catch (e) {
    return res.status(500).json({ error: e.message, ...results });
  }
};
