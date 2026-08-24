// POST /api/paymob-create-checkout
// Body: {
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
//
// Environment variables needed (Vercel → Settings → Environment Variables,
// once you've created a Paymob account and a card payment integration):
//   PAYMOB_SECRET_KEY       — starts with "sk_..." (Settings → Account Info)
//   PAYMOB_PUBLIC_KEY       — starts with "pk_..." (same page)
//   PAYMOB_INTEGRATION_ID   — from Developers → Payment Integrations (the
//                             card integration you want to charge through)
//   PAYMOB_HMAC_SECRET      — from Settings → Account Info, used to verify
//                             the webhook really came from Paymob

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const secretKey = process.env.PAYMOB_SECRET_KEY;
  const publicKey = process.env.PAYMOB_PUBLIC_KEY;
  const integrationId = process.env.PAYMOB_INTEGRATION_ID;
  if (!secretKey || !publicKey || !integrationId) {
    return res.status(500).json({ error: "Paymob isn't configured yet — set PAYMOB_SECRET_KEY, PAYMOB_PUBLIC_KEY and PAYMOB_INTEGRATION_ID in Vercel first." });
  }

  const { amount, description, customerName, customerMobile, customerEmail, merchantRefNum } = req.body || {};
  if (!amount || !customerName || !customerMobile || !merchantRefNum) {
    return res.status(400).json({ error: "Missing required fields" });
  }

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
