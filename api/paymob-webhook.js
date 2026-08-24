// POST /api/paymob-webhook
// Set this exact URL (https://yoursite.com/api/paymob-webhook) as your
// "Transaction Processed Callback" in Paymob's dashboard once you have an
// account (Developers → Payment Integrations → your integration → edit).
//
// Uses the same merchantRefNum convention as the Fawry webhook:
//   sub-<swimmerId>-<academyId>-<YYYY-MM>-<random>   → a swimmer's monthly fees
// Extend the if/else below for course payments or platform subscription
// payments the same way, using their own prefixes.

const crypto = require("crypto");

// Paymob HMAC covers a specific, fixed list of transaction fields
// concatenated in a specific order — see:
// https://docs.paymob.com/docs/transaction-webhooks#hmac-authentication
// Double check this field list against Paymob's current docs once you're
// testing with a real account, since payment providers do occasionally
// adjust these lists.
function verifyPaymobHmac(obj, hmacSecret, receivedHmac) {
  const fields = [
    "amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction",
    "id", "integration_id", "is_3d_secure", "is_auth", "is_capture", "is_refunded",
    "is_standalone_payment", "is_voided", "order.id", "owner", "pending",
    "source_data.pan", "source_data.sub_type", "source_data.type", "success",
  ];
  const getField = (path) => {
    const parts = path.split(".");
    let v = obj;
    for (const p of parts) v = v?.[p];
    return v === undefined || v === null ? "" : String(v);
  };
  const concatenated = fields.map(getField).join("");
  const computed = crypto.createHmac("sha512", hmacSecret).update(concatenated).digest("hex");
  return computed === receivedHmac;
}

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

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const receivedHmac = req.query?.hmac;
  const transaction = req.body?.obj || {};
  const ref = transaction.extras?.merchantRefNum || transaction.special_reference || transaction.order?.merchant_order_id || "";
  // Every academy has its own Paymob HMAC secret now — pulled from the same
  // merchantRefNum convention the checkout step encodes
  // (sub-<swimmerId>-<academyId>-...).
  const refAcademyId = ref.split("-")[2];

  if (receivedHmac && refAcademyId) {
    const rows = await supabaseRequest(`academies?id=eq.${refAcademyId}&select=paymob_hmac_secret`);
    const academyHmacSecret = rows[0]?.paymob_hmac_secret;
    if (academyHmacSecret && !verifyPaymobHmac(transaction, academyHmacSecret, receivedHmac)) {
      return res.status(400).json({ error: "Invalid HMAC" });
    }
  }

  const isPaid = transaction.success === true && transaction.pending === false;

  try {
    if (isPaid && ref.startsWith("sub-")) {
      const parts = ref.split("-");
      const swimmerId = parts[1];
      const academyId = parts[2];
      const month = `${parts[3]}-${parts[4]}`;

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

    // TODO: add "course-" and "platsub-" prefixes here too, the same way as
    // the Fawry webhook, once you're ready to wire those up.

    return res.status(200).json({ received: true });
  } catch (e) {
    console.error("Paymob webhook error:", e.message);
    return res.status(200).json({ received: true, warning: e.message });
  }
};
