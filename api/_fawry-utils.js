// Shared helpers for talking to FawryPay's server-to-server API.
// Docs: https://developer.fawrystaging.com/docs/server-apis/server-apis-overview
//
// Environment variables needed (set these in Vercel → Project → Settings →
// Environment Variables once you have them from Fawry):
//   FAWRY_MERCHANT_CODE   — your Merchant Code from the Fawry business portal
//   FAWRY_SECURE_KEY      — your Security Key (NEVER expose this to the browser)
//   FAWRY_ENV             — "staging" while testing, "production" when live
//   SUPABASE_URL          — same Supabase project URL the app already uses
//   SUPABASE_SERVICE_ROLE_KEY — a Supabase "service_role" key (Settings → API)
//                          used ONLY server-side, to update payment records
//                          from the webhook without needing RLS to allow it.

const crypto = require("crypto");

function fawryBaseUrl() {
  return process.env.FAWRY_ENV === "production"
    ? "https://www.fawrypay.com"
    : "https://atfawry.fawrystaging.com";
}

function sha256Hex(str) {
  return crypto.createHash("sha256").update(str, "utf8").digest("hex");
}

// Charge-request signature, per Fawry's docs: merchantCode + merchantRefNum +
// customerProfileId (blank string if none) + itemId + quantity + price
// (2 decimals) + secureKey. Multiple items are sorted by itemId and appended
// one after another in the same pattern.
function buildChargeSignature({ merchantCode, merchantRefNum, customerProfileId, chargeItems, secureKey }) {
  const sortedItems = [...chargeItems].sort((a, b) => String(a.itemId).localeCompare(String(b.itemId)));
  const itemsPart = sortedItems
    .map((item) => `${item.itemId}${item.quantity}${Number(item.price).toFixed(2)}`)
    .join("");
  const raw = `${merchantCode}${merchantRefNum}${customerProfileId || ""}${itemsPart}${secureKey}`;
  return sha256Hex(raw);
}

// Verifies the signature Fawry sends back on the async payment notification
// (webhook) — confirms the notification really came from Fawry and wasn't
// forged, before trusting it to mark anything as paid.
// Docs pattern: fawryRefNumber + merchantRefNumber + paymentAmount +
// orderAmount + orderStatus + paymentMethod + secureKey (fields present vary
// slightly by integration — double check against the live payload Fawry
// actually sends you once you're testing with real credentials, and adjust
// this list to match exactly).
function verifyCallbackSignature(payload, secureKey) {
  const raw =
    `${payload.fawryRefNumber || ""}${payload.merchantRefNumber || ""}` +
    `${payload.paymentAmount || ""}${payload.orderAmount || ""}` +
    `${payload.orderStatus || ""}${payload.paymentMethod || ""}${secureKey}`;
  return sha256Hex(raw) === payload.messageSignature;
}

module.exports = { fawryBaseUrl, sha256Hex, buildChargeSignature, verifyCallbackSignature };
