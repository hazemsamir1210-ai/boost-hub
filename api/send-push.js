// Vercel serverless function — sends one Web Push notification given a
// browser's push subscription. Runs server-side, so the VAPID private
// key never reaches the browser. Requires two environment variables to
// be set in the Vercel project (Settings -> Environment Variables):
//   VAPID_PUBLIC_KEY  = <the public key printed alongside this file>
//   VAPID_PRIVATE_KEY = <the private key printed alongside this file>
import webpush from "web-push";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { subscription, title, body, url, icon } = req.body || {};
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: "Missing subscription" });
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return res.status(500).json({ error: "Push notifications aren't configured on the server yet" });
  }

  webpush.setVapidDetails("mailto:support@example.com", publicKey, privateKey);

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({ title: title || "New message", body: body || "", url: url || "/", icon })
    );
    return res.status(200).json({ ok: true });
  } catch (e) {
    // A 410/404 here means the subscription is dead (browser data cleared,
    // notifications revoked, etc.) — not a real error, just stale data the
    // caller should clean up. Anything else is a genuine send failure.
    const isGone = e.statusCode === 410 || e.statusCode === 404;
    return res.status(isGone ? 410 : 500).json({ error: e.message, gone: isGone });
  }
}

