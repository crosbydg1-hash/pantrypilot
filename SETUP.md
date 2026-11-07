# Turning on real accounts

PantryPilot runs in **demo mode** until it's connected to a Supabase project. In demo mode, accounts and comments live only in the browser you're using. Connecting takes about 10 minutes, and the free Supabase plan is enough to launch.

## 1. Create the project
1. Sign up at [supabase.com](https://supabase.com) and click **New project**.
2. Name it `PantryPilot`, choose a strong database password (save it in your password manager) and pick the region closest to most of your users.

## 2. Create the database tables
1. In the project, open **SQL Editor** → **New query**.
2. Paste everything from [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. It should finish with "Success. No rows returned."

This creates profiles, synced user data, comments, reports, blocks, the auto-hide rule (3 reports hides a comment) and in-app account deletion.

## 3. Connect the app
1. Open **Project Settings → API**.
2. Copy the **Project URL** and the **anon public** key into [`config.js`](config.js):
   ```js
   window.PP_CONFIG = {
     supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
     supabaseAnonKey: 'eyJ...'
   };
   ```
   The anon key is meant to be public. Never paste the **service_role** key into the app.

## 4. Email settings
1. **Authentication → URL Configuration**: set **Site URL** to wherever the site is hosted, and add `http://localhost:5173` under **Redirect URLs** for testing.
2. **Authentication → Providers → Email**: "Confirm email" is on by default, so new people must click a link before they can sign in. You can turn it off while testing.
3. Supabase's built-in email sender is limited to a few emails an hour. Before launch, add your own email provider (for example Resend or Postmark) under **Authentication → Emails → SMTP Settings**.

## 5. Turn on recipe import (Pro)
Importing from links and photos uses Claude, Anthropic's AI model, through a small server function.
1. Get a Claude API key at [console.anthropic.com](https://console.anthropic.com) (**API Keys → Create Key**) and add a payment method there. Each import costs a few cents. PantryPilot caps everyone at 40 imports a day.
2. In Supabase, open **Edge Functions → Secrets**, add a secret named `ANTHROPIC_API_KEY`, and paste the key as its value. Paste it only there: never in the app's files and never in chat.
3. Open **Edge Functions → Deploy a new function → Via Editor**, name it exactly `import-recipe`, replace the sample code with everything in [`supabase/functions/import-recipe/index.ts`](supabase/functions/import-recipe/index.ts), and click **Deploy**.
4. To test Pro before App Store purchases exist, go to **Table Editor → profiles**, find your row and set `is_pro` to `true`.

Pro is bought through the App Store once the iPhone app exists. That step adds RevenueCat, which tells the database when someone subscribes or cancels.

## 6. Moderating comments
- Reports show up in **Table Editor → comment_reports**.
- A comment reported by 3 different people is hidden automatically (`comments.hidden = true`). To remove one yourself, delete its row in **comments**.
- To ban someone, delete them under **Authentication → Users**. Their comments are deleted with them.

Apple requires apps with user comments to have a way to report content, block people and contact the developer. Reporting and blocking are built in. You'll add a support email or contact page to the App Store listing.
