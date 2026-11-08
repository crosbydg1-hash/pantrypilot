// PantryPilot weekly email: "3 dinners you can make with what's in your pantry".
// POST (from the weekly scheduled job, with the x-cron-secret header): sends the emails.
// GET ?u=<user id>&t=<token> (the unsubscribe link in each email): turns the email off for that person.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY  from resend.com (free tier is enough to start)
//   EMAIL_FROM      e.g. "PantryPilot <hello@yourdomain.com>" — the domain must be verified in Resend
//   CRON_SECRET     any long random text; also used in the scheduled job, and to sign unsubscribe links
//   SITE_URL        your website, e.g. https://www.mypantrypilot.com
// Deploy with "Verify JWT" turned OFF: the job and the unsubscribe link carry their own proof.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SITE = (Deno.env.get("SITE_URL") ?? "https://crosbydg1-hash.github.io/pantrypilot").replace(/\/$/, "");
const FUNCTION_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/weekly-email`;

type Ingredient = { item: string };
type Recipe = { id: string; title: string; description: string; category: string; prep_time: number; cook_time: number; ingredients: Ingredient[] };

// Same ingredient matching as the app (simplified).
const STRIP = /^(fresh|ripe|cooked|toasted|melted|unsalted|bone-in|fine|flaky|whole|shelled|mixed)\s+/;
const ALIAS: Record<string, string> = {
  "garlic cloves": "garlic", "lemons": "lemon", "lemon juice": "lemon", "sea salt": "salt", "basil leaves": "basil",
  "broccoli florets": "broccoli", "dill and parsley": "dill & parsley", "greek yogurt": "yogurt", "plain yogurt": "yogurt",
  "yellow onion": "onion", "white miso paste": "miso paste", "neutral oil for frying": "neutral oil", "sourdough bread": "sourdough",
  "powdered gelatin": "gelatin", "salmon fillets": "salmon", "white fish fillets": "white fish", "cold beer": "beer",
  "sharp cheddar": "cheddar", "crushed pistachios": "pistachios",
};
function canon(raw: string) {
  let s = raw.toLowerCase().split(",")[0].trim(), prev;
  do { prev = s; s = s.replace(STRIP, ""); } while (s !== prev);
  return ALIAS[s] ?? s;
}
const MEAT = /chicken|beef|steak|pork|bacon|\bham\b|sausage|turkey|lamb|salmon|\bfish\b|tuna|anchov|shrimp|prawn|oyster sauce|gelatin/;
const DAIRY = /\b(butter|buttermilk|milk|cream|cheese|parmesan|mozzarella|cheddar|feta|cotija|yogurt|ghee|caramel|brioche)\b/;
const GLUTEN = /flour|bread|sourdough|\bbuns?\b|brioche|panko|rigatoni|spaghetti|pasta|noodle|ramen|soba|soy sauce|oyster sauce|\bbeer\b|farro|(?<!corn )tortilla/;
function fitsDiet(r: Recipe, diet?: string) {
  const items = r.ingredients.map(i => i.item.toLowerCase());
  const has = (re: RegExp) => items.some(i => re.test(i));
  if (diet === "vegetarian") return !has(MEAT);
  if (diet === "vegan") return !has(MEAT) && !has(DAIRY) && !has(/\beggs?\b|honey/);
  if (diet === "gluten-free") return !has(GLUTEN);
  if (diet === "dairy-free") return !has(DAIRY);
  return true;
}

async function loadRecipes(): Promise<Recipe[]> {
  const js = await (await fetch(`${SITE}/recipes.js`)).text();
  const start = js.indexOf("["), end = js.indexOf("];", start);
  return JSON.parse(js.slice(start, end + 1));
}

async function sign(text: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(Deno.env.get("CRON_SECRET")!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("unsubscribe:" + text));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, c => ({ "+": "-", "/": "_", "=": "" }[c]!));
}
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function emailHTML(name: string, picks: { r: Recipe; missing: string[] }[], unsubscribe: string) {
  const rows = picks.map(({ r, missing }) => `
    <tr><td style="padding:14px 0;border-top:1px solid #D6DDD8">
      <a href="${SITE}/#recipe-${r.id}" style="font:600 18px Georgia,serif;color:#16221F;text-decoration:none">${esc(r.title)}</a>
      <div style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;color:#5A6863;margin-top:4px">${esc(r.description)}</div>
      <div style="font:600 13px -apple-system,Segoe UI,sans-serif;color:${missing.length ? "#C2552A" : "#2E7A4C"};margin-top:6px">
        ${r.prep_time + r.cook_time} min · ${missing.length ? `You need: ${esc(missing.join(", "))}` : "You have everything"}</div>
    </td></tr>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#F1F4F1">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F4F1"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;padding:24px">
    <tr><td style="font:600 12px monospace;letter-spacing:.12em;color:#C2552A;text-transform:uppercase">This week from PantryPilot</td></tr>
    <tr><td style="font:600 26px/1.2 Georgia,serif;color:#16221F;padding:8px 0 4px">Hi ${esc(name)}, here are 3 dinners you can make</td></tr>
    <tr><td style="font:15px/1.5 -apple-system,Segoe UI,sans-serif;color:#5A6863;padding-bottom:8px">Picked from what's already in your pantry.</td></tr>
    ${rows}
    <tr><td style="padding-top:18px"><a href="${SITE}/#pantry" style="display:inline-block;background:#2B656B;color:#fff;font:600 15px -apple-system,Segoe UI,sans-serif;padding:12px 20px;border-radius:999px;text-decoration:none">Update my pantry</a></td></tr>
    <tr><td style="font:12px/1.5 -apple-system,Segoe UI,sans-serif;color:#5A6863;padding-top:24px">You're getting this because you turned on weekly dinner ideas in PantryPilot.
      <a href="${unsubscribe}" style="color:#2B656B">Unsubscribe</a></td></tr>
  </table></td></tr></table></body></html>`;
}

const page = (title: string, msg: string) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
   <body style="font:16px/1.5 -apple-system,Segoe UI,sans-serif;background:#F1F4F1;color:#16221F;display:grid;place-items:center;min-height:90vh;margin:0;padding:20px">
   <div style="max-width:420px;background:#fff;padding:28px;border-radius:16px"><h1 style="font:600 24px Georgia,serif;margin:0 0 8px">${title}</h1><p>${msg}</p><a href="${SITE}" style="color:#2B656B">Back to PantryPilot</a></div>`,
  { headers: { "Content-Type": "text/html; charset=utf-8" } });

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret) return new Response("Not configured", { status: 500 });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Unsubscribe link
  if (req.method === "GET") {
    const url = new URL(req.url), u = url.searchParams.get("u") ?? "", t = url.searchParams.get("t") ?? "";
    if (!u || t !== await sign(u)) return page("Link not valid", "This unsubscribe link didn't work. You can turn emails off in PantryPilot under your account.");
    const { data } = await admin.from("user_data").select("prefs").eq("user_id", u).maybeSingle();
    if (data) await admin.from("user_data").update({ prefs: { ...(data.prefs ?? {}), weekly_email: false } }).eq("user_id", u);
    return page("You're unsubscribed", "You won't get weekly dinner ideas any more. You can turn them back on anytime from your account in PantryPilot.");
  }

  // Weekly send (from the scheduled job)
  if (req.method !== "POST" || req.headers.get("x-cron-secret") !== secret) return new Response("Forbidden", { status: 403 });
  const resendKey = Deno.env.get("RESEND_API_KEY"), from = Deno.env.get("EMAIL_FROM");
  if (!resendKey || !from) return new Response("Email not configured", { status: 500 });

  const recipes = await loadRecipes();
  const { data: people, error } = await admin.from("user_data").select("user_id, pantry, prefs").eq("prefs->>weekly_email", "true").limit(5000);
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0, failed = 0;
  for (const p of people ?? []) {
    try {
      const { data: { user } } = await admin.auth.admin.getUserById(p.user_id);
      if (!user?.email || !user.email_confirmed_at) continue;
      const { data: prof } = await admin.from("profiles").select("display_name").eq("id", p.user_id).maybeSingle();
      const pantry = new Set<string>((p.pantry ?? []) as string[]);
      const prefs = (p.prefs ?? {}) as { diet?: string };
      const picks = recipes.filter(r => r.category === "dinner" && fitsDiet(r, prefs.diet))
        .map(r => {
          const keys = [...new Set(r.ingredients.map(i => canon(i.item)))].filter(k => k !== "salt" && k !== "black pepper");
          return { r, missing: keys.filter(k => !pantry.has(k)) };
        })
        .sort((a, b) => a.missing.length - b.missing.length || (a.r.prep_time + a.r.cook_time) - (b.r.prep_time + b.r.cook_time))
        .slice(0, 3);
      if (!picks.length) continue;
      const unsubscribe = `${FUNCTION_URL}?u=${encodeURIComponent(p.user_id)}&t=${await sign(p.user_id)}`;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from, to: [user.email],
          subject: `3 dinners you can make this week: ${picks[0].r.title} and more`,
          html: emailHTML(prof?.display_name ?? "there", picks, unsubscribe),
          headers: { "List-Unsubscribe": `<${unsubscribe}>` },
        }),
      });
      if (res.ok) sent++; else { failed++; console.error("Resend error", res.status, await res.text()); }
      await new Promise(r => setTimeout(r, 600)); // stay under Resend's rate limit
    } catch (e) { failed++; console.error("Weekly email failed for", p.user_id, e); }
  }
  return new Response(JSON.stringify({ sent, failed }), { headers: { "Content-Type": "application/json" } });
});
