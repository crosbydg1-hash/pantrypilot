// PantryPilot Pro: open Stripe's customer portal so people can change plan, update their card or cancel.
// Secrets: STRIPE_SECRET_KEY.

import Stripe from "npm:stripe@22.6.2";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return json(500, { error: "Payments aren't set up yet (missing STRIPE_SECRET_KEY)." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json(401, { error: "Sign in first." });

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: profile } = await admin.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
  if (!profile?.stripe_customer_id) return json(404, { error: "There's no card subscription on this account." });

  const PAGES = "https://crosbydg1-hash.github.io/pantrypilot";
  let back = (Deno.env.get("SITE_URL") ?? PAGES).replace(/\/+$/, "");
  const origin = req.headers.get("Origin");
  try {
    const h = origin ? new URL(origin).hostname : "";
    if (origin && new URL(origin).origin === new URL(PAGES).origin) back = PAGES;
    else if (origin && new URL(origin).origin !== new URL(back).origin && (h.endsWith(".amplifyapp.com") || /^(localhost|127\.0\.0\.1)$/.test(h))) back = origin;
  } catch { /* keep default */ }

  try {
    const stripe = new Stripe(key);
    const session = await stripe.billingPortal.sessions.create({ customer: profile.stripe_customer_id, return_url: `${back}/#saved` });
    return json(200, { url: session.url });
  } catch (e) {
    console.error("Stripe portal error", e);
    return json(502, { error: "Couldn't open subscription settings. Try again in a minute." });
  }
});
