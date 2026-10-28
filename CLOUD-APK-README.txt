JEE RUSH OS 2.0 — Supabase Auth + Android APK

LOGIN / CLOUD SYNC
- Create an account using email and password on the login screen.
- Use that same account on desktop and Android to share progress and preferences.
- The app stores state in public.jee_rush_user_state.
- RLS policies scope every row to auth.uid() = user_id.
- The app includes only the Supabase publishable key. Do not place a service-role key in the app.
- If email confirmation is enabled, verify the email before signing in.
- Progress is saved locally first and then synced to Supabase. Realtime updates are subscribed to when available.

ANDROID APK
- Workflow: .github/workflows/build-android-apk.yml
- Push this folder to a GitHub repository, then open Actions > Build JEE Rush OS APK > Run workflow.
- Download the JEE-Rush-OS-debug-APK artifact.
- Install app-debug.apk and sign in with the same account as desktop.
- This ZIP contains source and a build workflow, not a precompiled APK.

CUSTOMIZATION
- Plan start date defaults to 29 November 2026 and is editable.
- Change lectures/day, subject rotation, theme, accent, density, text size, date format, dashboard sections, upcoming count, chapter numbers, animation, video link behavior and reset confirmation in Settings.
- Preferences are stored in the cloud snapshot alongside progress.
