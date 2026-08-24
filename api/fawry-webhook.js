// POST /api/fawry-webhook
// Fawry calls this URL automatically whenever a payment's status changes —
// set this exact URL (https://yoursite.com/api/fawry-webhook) as your
// "Server Notification URL" in the Fawry business portal once you have an
// account. This is what makes payments confirm themselves automatically,
// instead of you reviewing an Instapay screenshot by hand.
//
// merchantRefNum convention (generated when the checkout was created):
//   sub-<swimmerId>-<academyId>-<YYYY-MM>-<random>   → a swimmer's monthly fees
// Extend the if/else below the same way for course payments or platform
// subscription payments, using their own prefixes, once you're ready to wire
// those up too.

const { verifyCallbackSignature } = require("./_fawry-utils");

async function supabaseRequest(path, options = {}) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase request failed: ${res.status} ${await res.text()}`);
  return res.json();
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const payload = req.body || {};
  const ref = payload.merchantRefNumber || "";
  // Every academy has its own Fawry secure key now, so the signature check
  // needs that specific academy's key — pulled from the same merchantRefNum
  // convention the checkout step already encodes (sub-<swimmerId>-<academyId>-...).
  const refAcademyId = ref.split("-")[2];

  if (payload.messageSignature && refAcademyId) {
    const rows = await supabaseRequest(`academies?id=eq.${refAcademyId}&select=fawry_secure_key`);
    const academySecureKey = rows[0]?.fawry_secure_key;
    if (academySecureKey && !verifyCallbackSignature(payload, academySecureKey)) {
      return res.status(400).json({ error: "Invalid signature" });
    }
  }

  const isPaid = payload.orderStatus === "PAID";

  try {
    if (isPaid && ref.startsWith("sub-")) {
      // sub-<swimmerId>-<academyId>-<YYYY-MM>-<random>
      const parts = ref.split("-");
      const swimmerId = parts[1];
      const academyId = parts[2];
      const month = `${parts[3]}-${parts[4]}`; // YYYY-MM was split on its own dash

      const rows = await supabaseRequest(`swimmers?id=eq.${swimmerId}&academy_id=eq.${academyId}&select=data`);
      if (rows[0]) {
        const swimmer = rows[0].data;
        const paidMonths = swimmer.paidMonths || [];
        if (!paidMonths.includes(month)) {
          const updated = { ...swimmer, paidMonths: [...paidMonths, month] };
          await supabaseRequest(`swimmers?id=eq.${swimmerId}&academy_id=eq.${academyId}`, {
            method: "PATCH",
            body: JSON.stringify({ data: updated }),
          });
        }
      }
    }

    // TODO: add "course-" and "platsub-" prefixes here the same way once
    // you're ready to take real card payments for courses or for academies
    // renewing their own platform subscription.

    return res.status(200).json({ received: true });
  } catch (e) {
    console.error("Fawry webhook error:", e.message);
    // Still return 200 so Fawry doesn't endlessly retry a payload that will
    // never succeed (e.g. a swimmer that was since deleted) — the failure is
    // logged above for you to check in Vercel's function logs instead.
    return res.status(200).json({ received: true, warning: e.message });
  }
};
