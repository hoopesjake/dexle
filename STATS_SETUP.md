# Dexle Stats setup

Supabase's Free plan is enough to launch this feature. You do not need to add
a payment method for the Free plan.

## 1. Create the project

1. Go to https://supabase.com and create a free account or sign in.
2. Choose **New project**.
3. Pick a project name, create a strong database password, and select a nearby
   region.
4. Wait for the project to finish provisioning.

## 2. Create the database

1. Open **SQL Editor** in the Supabase dashboard.
2. Choose **New query**.
3. Copy all of `supabase-schema.sql` from this project into the editor.
4. Press **Run**.

This creates the run-history table, indexes, security policies, and the two
privacy-safe community leaderboard functions.

## 3. Enable no-password player identities

1. Open **Authentication**.
2. Open the authentication provider/settings area.
3. Enable **Anonymous Sign-Ins**.
4. Save.

Before a large public launch, enable Cloudflare Turnstile or another CAPTCHA
for anonymous sign-ins to reduce automated abuse.

## 4. Connect Dexle

1. Open the project's **Connect** dialog or **Project Settings → API**.
2. Copy the **Project URL**.
3. Copy the **Publishable key** (sometimes shown as the anon/public key).
4. Open `supabase-config.js` and paste both values:

```js
window.DEXLE_SUPABASE = {
  url: "https://YOUR-PROJECT.supabase.co",
  publishableKey: "YOUR-PUBLISHABLE-KEY",
};
```

The publishable key is designed to be used in browser code. Never put a
`service_role`, secret, or database password in this repository.

## 5. Test

Serve the project through a local web server or its hosted URL. Do not open the
HTML pages directly with a `file://` URL.

1. Draft and run one Region Champion team.
2. Open `stats.html`; the run should appear under Recent History.
3. Draft and run one Gauntlet team.
4. Confirm the Personal and Community leaderboards update.
5. In Supabase, open **Table Editor → runs** and verify that there are two rows.

Every result is submitted once. Using **See results** or returning to the team
does not create a duplicate.

## Updating an existing stats database

When `supabase-schema.sql` changes, open **SQL Editor**, paste the latest full
file, and run it again. The schema is written to preserve existing run rows
while updating functions, indexes, and security policies. The generation
filter and Community Best Team card require running the latest schema once.
Existing runs remain available, but the all-time effective-stat competition
starts with runs completed after this update because older rows did not store
their final stat total or type-coverage count.

The Dexle guessing-game record also requires the latest schema. Tracking begins
with games completed after that update; rounds played before it cannot be
reconstructed.

To clear all testing from both game systems before launch:

```sql
truncate table public.runs, public.dexle_games;
```

## What is stored

- An anonymous Supabase user ID
- Run mode and selected region
- Win/loss record and Poké Ball tier
- Six Pokémon, including Mega, shiny, starter, and Rare Candy flags
- Per-region Gauntlet records
- Completion timestamp

No name, email address, IP address, or complete public team is exposed by the
community leaderboard. Personal rows are protected by row-level security.
