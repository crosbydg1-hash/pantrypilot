// PantryPilot Pro: start a Stripe Checkout for the signed-in person and return its URL.
// Secrets: STRIPE_SECRET_KEY (Supabase dashboard → Edge Functions → Secrets).
// Price IDs are public; change them here when you switch Stripe from test mode to live mode.

import Stripe from "npm:stripe@22.6.2";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const PRICES: Record<string, string> = {
  month: "price_1UYxWsH78EEtd0je9ilDs464",
  year: "price_1UYxXnH78EEtd0jeiyWF1COA",
};
const TRIAL_DAYS = 7;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Only send people back to sites we know about.
function returnBase(origin: string | null): string {
  const fallback = Deno.env.get("SITE_URL") ?? "https://staging.d1asr1kldrj6f9.amplifyapp.com";
  if (!origin) return fallback;
  try {
    const u = new URL(origin);
    const ok = u.hostname.endsWith(".amplifyapp.com") || u.hostname === "localhost" || u.hostname === "127.0.0.1" ||
      (Deno.env.get("SITE_URL") && u.origin === new URL(Deno.env.get("SITE_URL")!).origin);
    return ok ? u.origin : fallback;
  } catch { return fallback; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Use POST." });

  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return json(500, { error: "Payments aren't set up yet (missing STRIPE_SECRET_KEY)." });
  const stripe = new Stripe(key);

  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json(401, { error: "Sign in to start PantryPilot Pro." });

  let body: { plan?: string } = {};
  try { body = await req.json(); } catch { /* default plan */ }
  const price = PRICES[body.plan === "month" ? "month" : "year"];

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: profile } = await admin.from("profiles").select("display_name, is_pro, pro_until, stripe_customer_id, had_trial").eq("id", user.id).single();
  if (profile?.is_pro && (!profile.pro_until || new Date(profile.pro_until) > new Date())) {
    return json(409, { error: "You already have PantryPilot Pro." });
  }

  try {
    let customer = profile?.stripe_customer_id as string | null;
    if (!customer) {
      const c = await stripe.customers.create({ email: user.email, name: profile?.display_name ?? undefined, metadata: { user_id: user.id } });
      customer = c.id;
      await admin.from("profiles").update({ stripe_customer_id: customer }).eq("id", user.id);
    }
    const base = returnBase(req.headers.get("Origin"));
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: user.id,
      line_items: [{ price, quantity: 1 }],
      subscription_data: {
        metadata: { user_id: user.id },
        ...(profile?.had_trial ? {} : { trial_period_days: TRIAL_DAYS }),
      },
      allow_promotion_codes: true,
      success_url: `${base}/?checkout=success#saved`,
      cancel_url: `${base}/?checkout=cancelled#kitchen`,
    });
    return json(200, { url: session.url });
  } catch (e) {
    console.error("Stripe checkout error", e);
    return json(502, { error: "Couldn't start checkout. Try again in a minute." });
  }
});
