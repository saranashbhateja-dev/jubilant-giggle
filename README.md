# JEE Rush OS 2.0

A fresh JEE preparation workspace built from the supplied Physics, Chemistry and Mathematics chapter lists and the YouTube links in the three source TXT files.

## Curriculum and default plan

- **54 chapters:** Physics 20, Chemistry 19, Mathematics 15.
- **Start date:** 29 November 2026.
- **Default cadence:** one chapter per day, rotating Physics → Chemistry → Mathematics. When a subject runs out of chapters, it is skipped.
- **Default completion checklist:** exactly two items per chapter — Lecture complete and Question practice.
- No tests or revision tasks are included.
- All 54 supplied video links are mapped in the original subject/chapter order.

## Desktop app (Windows)

1. Install Node.js 22 or newer.
2. Extract the ZIP to a writable folder.
3. Double-click `start.bat`.
4. The app opens at `http://127.0.0.1:3000`.

The local Node server serves the app only. Authentication and cross-device storage use Supabase.

## Login and cross-device sync

- Create an account using the email/password form in JEE Rush OS.
- Use the **same account** in the desktop browser and Android APK.
- Progress and customization settings are stored in the authenticated user's `jee_rush_user_state` row.
- Row Level Security checks `auth.uid() = user_id`; users cannot read or overwrite another user's row.
- Local progress is saved first, then synced to Supabase. Realtime updates are enabled where the project's `supabase_realtime` publication supports the table.
- Only the Supabase publishable key is included in the client. Never add a service-role key to this project.
- If email confirmation is enabled in Supabase Auth, verify the email before logging in.

## Settings and customization

The Settings panel includes editable plan start date, one-to-three lectures per day, all six subject rotations, dark/light/system theme, seven accent choices, comfortable/compact layout, text size, date format, optional dashboard name, dashboard panel visibility, upcoming-chapter count, chapter number visibility, animation toggle, open-video behavior, reset confirmation, JSON backup/import, and reset-to-default settings. Preferences sync alongside progress.

## Android APK

### GitHub Actions (recommended)

1. Create a separate GitHub repository and upload the contents of this folder.
2. Push to `main`, or open **Actions → Build JEE Rush OS APK → Run workflow**.
3. Download the artifact named `JEE-Rush-OS-debug-APK` and extract `app-debug.apk`.
4. Install the APK and log in with the same account used on desktop.

### Local Android build

Install Node.js 22, JDK 21, Android Studio and the Android SDK, then run `android-build.bat`. The APK output is `android/app/build/outputs/apk/debug/app-debug.apk`.

This source ZIP does not include a precompiled APK; the workflow or local Android toolchain must build it.

## Project layout (aligned with the supplied JEE OS sample)

- `index.html` — app shell and authentication/settings UI
- `styles.css` — responsive desktop/mobile UI and themes
- `app.js` — state, authentication, schedule, progress, settings and cloud sync
- `data.js` — bundled curriculum and supplied video links
- `server.js` / `start.bat` — local desktop server and launcher
- `capacitor.config.json`, `scripts/build.js`, `android-build.bat` — Android packaging
- `.github/workflows/build-android-apk.yml` — hosted APK build
- `supabase-schema.sql` — authenticated state table and RLS policies
- `source-data/` — original supplied subject TXT files

## Data notes

Video IDs and URLs are retained from the supplied files. The default schedule now begins on 29 November 2026 and assigns one chapter to each consecutive calendar day through 21 January 2027.
