// POST /api/fawry-create-checkout
// Body: {
//   amount: number,                 // EGP, e.g. 500
//   description: string,            // shown to the customer, e.g. "August fees — Ahmed Ali"
//   customerName: string,
//   customerMobile: string,         // Egyptian mobile format, e.g. "01001234567"
//   customerEmail?: string,
//   merchantRefNum: string,         // YOUR unique reference — generate this
//                                   // yourself (e.g. `${swimmerId}-${month}-${Date.now()}`)
//                                   // so you can match the webhook back to
//                                   // the right swimmer/course/subscription later
//   returnUrl: string,              // where Fawry sends the browser back to
//                                   // after payment (success or failure)
// }
// Returns: { checkoutUrl } on success, or { error } on failure.
//
// This never touches the customer's card details directly — it hands off to
// Fawry's own hosted payment page, which is both simpler and safer (no PCI
// compliance burden on this app).

const { fawryBaseUrl, buildChargeSignature } = require("./_fawry-utils");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const merchantCode = process.env.FAWRY_MERCHANT_CODE;
  const secureKey = process.env.FAWRY_SECURE_KEY;
  if (!merchantCode || !secureKey) {
    return res.status(500).json({ error: "Fawry isn't configured yet — set FAWRY_MERCHANT_CODE and FAWRY_SECURE_KEY in Vercel first." });
  }

  const { amount, description, customerName, customerMobile, customerEmail, merchantRefNum, returnUrl } = req.body || {};
  if (!amount || !customerName || !customerMobile || !merchantRefNum || !returnUrl) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const chargeItems = [
    { itemId: "fees", description: description || "Payment", price: Number(amount), quantity: 1 },
  ];

  const signature = buildChargeSignature({
    merchantCode,
    merchantRefNum,
    customerProfileId: "",
    chargeItems,
    secureKey,
  });

  const chargeRequest = {
    merchantCode,
    merchantRefNum,
    customerName,
    customerMobile,
    customerEmail: customerEmail || undefined,
    language: "ar-eg",
    chargeItems,
    paymentMethod: "PayAtFawry", // reference-number + card/wallet options shown together on Fawry's hosted page
    returnUrl,
    signature,
  };

  try {
    const response = await fetch(`${fawryBaseUrl()}/ECommerceWeb/Fawry/payments/charge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chargeRequest),
    });
    const data = await response.json();
    if (data.statusCode && data.statusCode !== 200) {
      return res.status(400).json({ error: data.statusDescription || "Fawry rejected the request", raw: data });
    }
    // Fawry's response includes either a reference number (PayAtFawry) or a
    // redirect link, depending on which payment methods it decided to show —
    // verify the exact field name against a real response once you have
    // live credentials, and adjust this line if needed.
    const checkoutUrl = data.nextActionUrl || data.checkoutUrl || data.redirectUrl || null;
    return res.status(200).json({ checkoutUrl, referenceNumber: data.referenceNumber || null, raw: data });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Could not reach Fawry" });
  }
};
