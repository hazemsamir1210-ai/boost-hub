// POST /api/paymob-create-checkout
// Body: {
//   academyId: string,        // whose Paymob account this charge should go to
//   amount: number,           // EGP, e.g. 500
//   description: string,
//   customerName: string,     // full name, split into first/last automatically
//   customerMobile: string,
//   customerEmail?: string,
//   merchantRefNum: string,   // your own unique reference, same idea as the
//                             // Fawry integration — encode enough info to
//                             // know what this payment was for later
// }
// Returns: { checkoutUrl } on success, or { error } on failure.
//
// Uses Paymob's modern "Intention" API + Unified Checkout hosted page — the
// customer enters card details on Paymob's own page, never on this site.
// Each academy's own Paymob keys (saved via Settings, stored server-side
// only) are used here — a swimmer's fees need to land in THEIR academy's
// own Paymob account, not the platform owner's.

async function getAcademyPaymobCredentials(academyId) {
  const response = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/academies?id=eq.${academyId}&select=paymob_secret_key,paymob_public_key,paymob_integration_id`,
    { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  const rows = await response.json();
  const row = rows[0];
  return row
    ? { secretKey: row.paymob_secret_key, publicKey: row.paymob_public_key, integrationId: row.paymob_integration_id }
    : null;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { amount, description, customerName, customerMobile, customerEmail, merchantRefNum, academyId } = req.body || {};
  if (!amount || !customerName || !customerMobile || !merchantRefNum || !academyId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const creds = await getAcademyPaymobCredentials(academyId);
  if (!creds?.secretKey || !creds?.publicKey || !creds?.integrationId) {
    return res.status(400).json({ error: "This academy hasn't set up Paymob payments yet — ask them to add it from Settings." });
  }
  const { secretKey, publicKey, integrationId } = creds;

  const nameParts = customerName.trim().split(/\s+/);
  const firstName = nameParts[0] || "Customer";
  const lastName = nameParts.slice(1).join(" ") || "Customer";

  try {
    const intentionRes = await fetch("https://accept.paymob.com/v1/intention/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${secretKey}`,
      },
      body: JSON.stringify({
        amount: Math.round(Number(amount) * 100), // Paymob wants cents (piasters)
        currency: "EGP",
        payment_methods: [Number(integrationId)],
        items: [
          {
            name: description || "Payment",
            amount: Math.round(Number(amount) * 100),
            description: description || "Payment",
            quantity: 1,
          },
        ],
        billing_data: {
          first_name: firstName,
          last_name: lastName,
          phone_number: customerMobile,
          email: customerEmail || "customer@example.com",
          apartment: "NA",
          floor: "NA",
          street: "NA",
          building: "NA",
          shipping_method: "NA",
          postal_code: "NA",
          city: "NA",
          country: "EG",
          state: "NA",
        },
        extras: { merchantRefNum },
        special_reference: merchantRefNum,
      }),
    });

    const data = await intentionRes.json();
    if (!intentionRes.ok || !data.client_secret) {
      return res.status(400).json({ error: data.message || "Paymob rejected the request", raw: data });
    }

    const checkoutUrl = `https://accept.paymob.com/unifiedcheckout/?publicKey=${publicKey}&clientSecret=${data.client_secret}`;
    return res.status(200).json({ checkoutUrl });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Could not reach Paymob" });
  }
};
