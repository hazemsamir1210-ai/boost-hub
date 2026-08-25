// Shared helper for sending a WhatsApp template message via Meta's own
// WhatsApp Cloud API (not a third-party wrapper — talks to Meta directly).
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates
//
// IMPORTANT: WhatsApp does not allow free-form business-initiated
// messages. The template named in `templateName` must already exist and
// be APPROVED in the academy's Meta Business account (WhatsApp Manager →
// Message Templates) before this will work — sending to a template name
// that doesn't exist or isn't approved yet will fail with a clear error
// from Meta, which gets logged.
//
// Template variable convention used by the reminder cron below:
//   {{1}} = swimmer's name
//   {{2}} = the academy's name
//   {{3}} = amount due (as text, e.g. "500 EGP")
// Adjust sendWhatsAppTemplate's `params` array (and the template itself in
// Meta Business) if you want different or additional variables.

async function sendWhatsAppTemplate({ phoneNumberId, accessToken, to, templateName, params = [] }) {
  // WhatsApp numbers need the full international format with no leading
  // "+" or symbols — this assumes Egyptian numbers stored the usual local
  // way (e.g. "01001234567") and converts them the same way the rest of
  // this app already does for wa.me links.
  const digits = String(to || "").replace(/\D/g, "");
  const toIntl = digits.startsWith("0") && digits.length === 11 ? "20" + digits.slice(1) : digits;

  const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toIntl,
      type: "template",
      template: {
        name: templateName,
        language: { code: "ar" },
        components: params.length
          ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text: String(text) })) }]
          : undefined,
      },
    }),
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || "WhatsApp send failed");
  }
  return data;
}

module.exports = { sendWhatsAppTemplate };
