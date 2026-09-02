// GET /api/v1/schedule
// Header: Authorization: Bearer <api-key>   (or  x-api-key: <api-key>)
//
// Returns every coach's booked slots for the current month — day, time,
// swimmer count, level — grouped by coach. Meant for building an external
// calendar view or a personal automation, not a full replica of the
// in-app Schedule grid (which also needs live capacity/override rules
// this endpoint doesn't attempt to reproduce).

const { resolveAcademyByApiKey, extractApiKey } = require("../_public-api-auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = extractApiKey(req);
  const academy = await resolveAcademyByApiKey(apiKey);
  if (!academy) return res.status(401).json({ error: "Invalid or missing API key" });

  try {
    const [swimmersRes, coachesRes] = await Promise.all([
      fetch(`${process.env.SUPABASE_URL}/rest/v1/swimmers?academy_id=eq.${academy.id}&select=data`, {
        headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
      }),
      fetch(`${process.env.SUPABASE_URL}/rest/v1/coaches?academy_id=eq.${academy.id}&select=data`, {
        headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
      }),
    ]);
    const swimmers = (await swimmersRes.json()).map((r) => r.data);
    const coaches = (await coachesRes.json()).map((r) => r.data);
    const coachNameById = Object.fromEntries(coaches.map((c) => [c.id, c.name]));

    const byCoach = {};
    swimmers.forEach((s) => {
      if (!s.day || !s.time || !s.coachId) return;
      const key = s.coachId;
      if (!byCoach[key]) byCoach[key] = { coachId: key, coachName: coachNameById[key] || "Unknown", slots: [] };
      byCoach[key].slots.push({ day: s.day, time: s.time, level: s.level || null, sessionType: s.sessionType || null });
    });

    res.status(200).json({ academy: academy.name, coaches: Object.values(byCoach) });
  } catch (e) {
    res.status(500).json({ error: "Could not load schedule" });
  }
};
