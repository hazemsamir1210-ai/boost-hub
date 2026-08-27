// Runs daily via Vercel Cron (see vercel.json) — for every academy, for
// every ACTIVE RECURRING enrollment (not trial/drop-in, which are single
// visits and never renew), makes sure a charge exists on the family
// ledger for the CURRENT month. Idempotent: running it every day is safe,
// since it only ever creates a charge when one doesn't already exist for
// that enrollment + month — so in practice it does its work once, the
// first day of a new month it runs, and does nothing on every other day.
//
// This never touches money — no card is charged, no payment gateway is
// called. It only creates the INVOICE itself, so the family sees what
// they owe and pays it the same way they always have (Instapay, Fawry,
// Paymob, or cash in person).

const DEFAULT_PLANS = [
  { id: "baby", price: 3500 },
  { id: "group", price: 1600 },
  { id: "exp", price: 2000 },
  { id: "semi-private", price: 2000 },
  { id: "private", price: 4200 },
];

function monthKeyNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

async function supabaseGet(path) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase GET failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function supabaseUpsert(path, body) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase upsert failed: ${res.status} ${await res.text()}`);
}

module.exports = async (req, res) => {
  const month = monthKeyNow();
  let academiesProcessed = 0;
  let chargesCreated = 0;
  const errors = [];

  try {
    const enrollmentRows = await supabaseGet(`app_storage?key=eq.enrollments-all&select=academy_id,value`);

    for (const row of enrollmentRows) {
      try {
        const academyId = row.academy_id;
        const enrollments = JSON.parse(row.value || "[]");
        const activeRecurring = enrollments.filter(
          (e) => (e.kind || "recurring") === "recurring" && e.status === "active"
        );
        if (activeRecurring.length === 0) continue;

        const [ledgerRows, plansRows] = await Promise.all([
          supabaseGet(`app_storage?key=eq.family-ledger-all&academy_id=eq.${academyId}&select=value`),
          supabaseGet(`app_storage?key=eq.plans-custom&academy_id=eq.${academyId}&select=value`),
        ]);
        const ledger = ledgerRows[0] ? JSON.parse(ledgerRows[0].value || "[]") : [];
        let plans = DEFAULT_PLANS;
        if (plansRows[0]) {
          try {
            const custom = JSON.parse(plansRows[0].value || "[]");
            if (Array.isArray(custom) && custom.length > 0) plans = custom;
          } catch {}
        }

        let ledgerChanged = false;
        const existingKeys = new Set(
          ledger.filter((l) => l.type === "charge").map((l) => `${l.enrollmentId || ""}|${l.month || ""}`)
        );

        for (const enr of activeRecurring) {
          const key = `${enr.id}|${month}`;
          if (existingKeys.has(key)) continue;
          const plan = plans.find((p) => p.id === enr.planId);
          const amount = Number(plan?.price) || 0;
          if (amount <= 0) continue; // no known price for this plan — skip rather than invoice for 0
          const now = new Date().toISOString();
          ledger.push({
            id: `chg-${genId()}`,
            familyId: enr.familyId,
            swimmerId: enr.swimmerId,
            enrollmentId: enr.id,
            type: "charge",
            month,
            description: `Monthly renewal — ${month}`,
            amount,
            paidAmount: 0,
            balance: amount,
            category: "tuition",
            dueDate: null,
            status: "due",
            createdAt: now,
            updatedAt: now,
            autoRenewed: true,
          });
          ledgerChanged = true;
          chargesCreated++;
        }

        if (ledgerChanged) {
          await supabaseUpsert("app_storage", {
            key: "family-ledger-all",
            academy_id: academyId,
            value: JSON.stringify(ledger),
            updated_at: new Date().toISOString(),
          });
        }
        academiesProcessed++;
      } catch (e) {
        errors.push({ academyId: row.academy_id, error: e.message });
      }
    }

    return res.status(200).json({ month, academiesProcessed, chargesCreated, errors });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Renewal cron failed" });
  }
};
