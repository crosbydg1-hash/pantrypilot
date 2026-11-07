/* PantryPilot settings.
 * Your Supabase project's URL and "anon public" key (Supabase dashboard → Project Settings → API Keys → Legacy).
 * Both are safe to ship in the app: the database's row-level security rules decide what each user can do.
 * Never put the service_role key here. Empty values run the app in demo mode (everything saved in this browser only). */
window.PP_CONFIG = {
  supabaseUrl: 'https://lfamdwyzimihuchaojvv.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmYW1kd3l6aW1paHVjaGFvanZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5OTA5NTIsImV4cCI6MjEwOTU2Njk1Mn0.p2khnlOuAB3uEI5tWykBOURC_7qcQdBqKs1v_xcBXWo',

  /* Google AdSense. Fill these in once AdSense approves the site:
   *   client: your publisher ID, e.g. 'ca-pub-1234567890123456' (AdSense → Account → Account information)
   *   slots:  the numeric ID of each display ad unit you create (AdSense → Ads → By ad unit)
   * While they're empty, the ad spaces show PantryPilot's own "Go ad-free" promotion. Pro members never see ads. */
  adsense: {
    client: '',
    slots: {
      kitchen: '', // between recipe cards on the Kitchen page
      recipe: ''   // on each recipe page, above the comments
    }
  }
};
