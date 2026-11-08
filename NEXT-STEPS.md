# PantryPilot: the steps only you can do

These need accounts, cards or keys, so they have to be done by you (an adult has to own the Stripe,
Google AdSense and Anthropic accounts). **Never paste a key into a chat.** Save keys only in
Supabase → Edge Functions → Secrets. When a step says "tell Claude", just say it's done and Claude
does the rest.

Supabase project: https://supabase.com/dashboard/project/lfamdwyzimihuchaojvv

---

## 1. Turn on Pro payments (Stripe)
Your Stripe products and prices already exist. What's missing is the connection.

1. **Stripe → Developers → API keys.** Copy the **Secret key** (starts with `sk_live_`, or `sk_test_` to practice first).
2. **Supabase → Edge Functions → Secrets → Add new secret**
   - `STRIPE_SECRET_KEY` = that secret key
   - `SITE_URL` = `https://crosbydg1-hash.github.io/pantrypilot` (change it later if you get your own domain)
3. **Stripe → Developers → Webhooks → Add endpoint**
   - URL: `https://lfamdwyzimihuchaojvv.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy the **Signing secret** (starts with `whsec_`), and save it in Supabase Secrets as `STRIPE_WEBHOOK_SECRET`.
4. **Tell Claude.** Claude deploys the three payment functions, turns off the sign-in check on the webhook, and does a test purchase.

## 2. Turn on recipe import and receipt scanning (Claude API)
1. Go to https://console.anthropic.com → **API keys → Create key**, and add a few dollars of credit.
   Each import or receipt costs about 1–3 cents.
2. Save it in Supabase Secrets as `ANTHROPIC_API_KEY`.
3. **Tell Claude.** Claude deploys `import-recipe` and `scan-receipt` and tests both.

## 3. Get your own web address
1. Buy a domain, for example **pantrypilot.app** or **getpantrypilot.com**, at Porkbun, Namecheap or Cloudflare (about $10–15 a year).
2. **Tell Claude the name.** Claude connects it to the site and gives you the exact records to paste into your domain's DNS settings. It's a 2-minute copy and paste.
3. Claude then updates the sign-in links, Stripe, the recipe pages and the sitemap to the new address.

## 4. Apply for Google AdSense
Do this after step 3, once the site has had some visitors for a couple of weeks. Brand-new sites usually get turned down.
1. Go to https://adsense.google.com and sign up with your domain.
2. Google shows a line for an `ads.txt` file. **Give that line to Claude.** It isn't secret. Claude publishes it, and Google reviews the site (usually 1–14 days).

## 5. Turn on the Sunday dinner email
This works best after step 3, because email services want you to send from your own domain.
1. Make a free account at https://resend.com, add your domain, and paste the DNS records it shows into your domain settings.
2. Resend → **API keys → Create**. Save these in Supabase Secrets:
   - `RESEND_API_KEY` = that key
   - `EMAIL_FROM` = `PantryPilot <hello@yourdomain.com>`
   - `CRON_SECRET` = the long password in the file `cron-secret.txt` in this folder (Claude made it; don't share it)
3. **Tell Claude.** Claude deploys the email function, sends you a test email, and schedules it for every Sunday.

---

### Already done by Claude
- People given free Pro by Crosby now see "A gift from PantryPilot" instead of a broken "Manage subscription" button.
- New: Surprise me, barcode scanning, timers that survive closing the app, 8 quick and kid-friendly recipes.
- 40 Pinterest pins and a bulk-upload file (`marketing/pinterest-bulk.csv`). See "Pinterest" below.

### Pinterest (free, and the best traffic source for recipes)
1. Make a free **Pinterest Business** account and a board called **PantryPilot Recipes**.
2. Pinterest → **Create → Create Pin → Bulk create Pins** (or Settings → Bulk create), and upload `marketing/pinterest-bulk.csv`.
   It posts all 40 pins, each linking to its recipe page.
