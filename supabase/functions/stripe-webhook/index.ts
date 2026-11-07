// PantryPilot Pro: Stripe tells this function when a subscription starts, renews, changes or ends,
// and it turns Pro on or off on the person's profile.
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
// Deploy with "Enforce JWT verification" turned OFF: Stripe signs its own requests instead.

import Stripe from "npm:stripe@22.6.2";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cryptoProvider = Stripe.createSubtleCryptoProvider();
const ACTIVE = new Set(["active", "trialing", "past_due"]); // past_due: Stripe is still retrying the card

// Recent Stripe API versions keep the billing period on each subscription item; older ones on the subscription.
function periodEnd(sub: Stripe.Subscription): number | null {
  // deno-lint-ignore no-explicit-any
  const s = sub as any;
  return s.current_period_end ?? s.items?.data?.[0]?.current_period_end ?? null;
}

Deno.serve(async (req) => {
  const key = Deno.env.get("STRIPE_SECRET_KEY"), whsec = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!key || !whsec) return new Response("Not configured", { status: 500 });
  const stripe = new Stripe(key);

  const sig = req.headers.get("Stripe-Signature");
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig ?? "", whsec, undefined, cryptoProvider);
  } catch (e) {
    console.error("Bad signature", (e as Error).message);
    return new Response("Bad signature", { status: 400 });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  async function apply(sub: Stripe.Subscription, fallbackUserId?: string | null) {
    const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const userId = sub.metadata?.user_id || fallbackUserId || null;
    const on = ACTIVE.has(sub.status);
    const end = periodEnd(sub);
    const update: Record<string, unknown> = {
      is_pro: on,
      // A day of grace so a renewal that lands a little late doesn't switch Pro off.
      pro_until: on && end ? new Date((end + 86400) * 1000).toISOString() : null,
      stripe_customer_id: customer,
    };
    if (sub.trial_start) update.had_trial = true;
    const q = admin.from("profiles").update(update);
    const { error } = userId ? await q.eq("id", userId) : await q.eq("stripe_customer_id", customer);
    if (error) throw error;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.mode === "subscription" && s.subscription) {
          const sub = await stripe.subscriptions.retrieve(typeof s.subscription === "string" ? s.subscription : s.subscription.id);
          await apply(sub, s.client_reference_id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await apply(event.data.object as Stripe.Subscription);
        break;
    }
  } catch (e) {
    console.error("Webhook handling failed", event.type, e);
    return new Response("Handler error", { status: 500 }); // Stripe will retry
  }
  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});
