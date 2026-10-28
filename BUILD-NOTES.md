# Build notes — JEE Rush OS 2.0

- Start date changed to 2026-11-29; default schedule covers 54 consecutive days through 2027-01-21.
- Subject rotation is configurable, defaulting to Physics → Chemistry → Mathematics.
- Default is one chapter per day; Settings allows one, two or three chapters per day.
- The app uses Supabase Auth email/password on desktop and Android.
- Authenticated snapshots are stored in `jee_rush_user_state` with RLS bound to `auth.uid()`.
- Old no-login `jee_rush_state` table access was revoked; the table is retained but unused.
- Settings are part of the cloud snapshot and JSON backup.
- Capacitor 8 / Node 22 / Java 21 are used to match the supplied JEE OS sample build architecture.
