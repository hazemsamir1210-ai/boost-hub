// GET /api/v1/swimmers
// Header: Authorization: Bearer <api-key>   (or  x-api-key: <api-key>)
//
// Returns a flat, deliberately trimmed-down list — name, level, schedule,
// coach, payment status for the current month — not the full internal
// record (skills history, attendance log, notes, etc.), since this is a
// PUBLIC endpoint meant for external tools (a calendar, a spreadsheet, a
// personal script), not a database dump of everything the app itself
// stores.

const { resolveAcademyByApiKey, extractApiKey } = require("../_public-api-auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = extractApiKey(req);
  const academy = await resolveAcademyByApiKey(apiKey);
  if (!academy) return res.status(401).json({ error: "Invalid or missing API key" });

  try {
    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/swimmers?academy_id=eq.${academy.id}&select=data`,
      { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    const rows = await response.json();
    const swimmers = (rows || []).map((r) => r.data).map((s) => ({
      id: s.id,
      name: s.name,
      age: s.age ?? null,
      level: s.level || null,
      branch: s.branch || null,
      day: s.day || null,
      time: s.time || null,
      coachId: s.coachId || null,
      sessionType: s.sessionType || null,
      paidThisMonth: (s.paidMonths || []).includes(new Date().toISOString().slice(0, 7)),
    }));
    res.status(200).json({ academy: academy.name, count: swimmers.length, swimmers });
  } catch (e) {
    res.status(500).json({ error: "Could not load swimmers" });
  }
};

