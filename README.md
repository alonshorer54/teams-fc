# ⚽ Teams FC

Web app for running a weekly football game: manage the squad, draw balanced
teams, share them to WhatsApp, and track results over time.

**Live app: https://teams-fc.netlify.app**

Hebrew, right-to-left, installable as a mobile app, and synced between devices.

## What it does

- **Squad** — players with a 1–5 rating, friendships, "prefers with / without", and free-text tags.
- **Draw** — splits the players who showed up into 2 or 3 balanced teams. Colours can be
  swapped afterwards, and missing spots filled with one-off "filler" players.
- **Manual edits** — swap or move any player; the app reports what the edit broke, with one-click undo.
- **Share** — copy a clean text list, or generate an image, ready for WhatsApp.
- **History and trends** — saved rounds, win/loss streaks, attendance, and which pairs
  actually perform well together.
- **Payments** — who paid for the week and who still owes.

## Tech

TypeScript · React 19 · Tailwind CSS 4 · Vite · Supabase · GitHub Pages

No backend of its own: the app is static files that talk to Supabase directly.
Access is enforced by Postgres row-level security, not by client code.

## Running locally

```bash
npm install
```

```bash
npm run dev
```

Opens on `http://localhost:5173`. Without Supabase keys the app runs in local
mode and stores everything in `localStorage` — no account needed.

Other scripts: `npm run build`, `npm run preview`, `npm run lint`.

## Enabling cloud sync

Optional. Needed only to sync between phone and computer.

1. Create a free project at [supabase.com](https://supabase.com).
2. In the Supabase SQL Editor, run [`supabase-setup.sql`](./supabase-setup.sql).
   It creates the table, enables row-level security, and turns on realtime.
3. Copy `.env.example` to `.env.local` and fill in your project URL and anon key
   (Project Settings → API).
4. Restart `npm run dev`, then sign up once and use the same account on your phone.

The `anon` key is meant to be public — row-level security is what protects the
data. Without a signed-in account, nothing can be read or written.

## Deployment

Hosted on Netlify, configured by [`netlify.toml`](./netlify.toml): pushing to
`main` builds and publishes automatically. The Supabase keys come from the
site's environment variables, and `sw.js` is served with no-store so a phone
cannot get stuck on a stale build.

The site origin must be listed under Supabase → Authentication → URL
Configuration, otherwise sign-up confirmation and password-reset links are
rejected — those are the only two flows that depend on it.

## How the draw works

Splitting players into balanced teams is a variant of the partition problem, so
the app uses a heuristic rather than an exact solver: greedy construction with
random noise, then hill-climbing over every pair swap, repeated 60 times with the
best result kept. It reaches a 0.00 rating gap in well under a second.

Five criteria are scored, each normalised to 0..1 so the weights stay comparable:

| Criterion | What it measures |
| --- | --- |
| `rating` | Average rating gap between teams |
| `friends` | How many friend pairs were split up |
| `gameChemistry` | Spread of learned pair effects across teams |
| `affinity` | How many "prefers with / without" requests were violated |
| `tags` | How evenly players sharing a tag are distributed |

You set the priority order in the UI. Each rank is worth about 6× the one below
it — enough for the top criterion to decide, without making the lower ones
meaningless. Criteria with no data are switched off automatically, and an
oversized team is penalised above everything else so the split stays valid.

## Project layout

| Path | Role |
| --- | --- |
| `src/types.ts` | Core types (`Player`, `Lineup`, `MatchRecord`) and team metadata |
| `src/lib/balance.ts` | The balancing algorithm and lineup statistics |
| `src/lib/criteria.ts` | Draw criteria, their penalties, and priority weighting |
| `src/lib/pairs.ts` | Learned chemistry between pairs of players |
| `src/lib/diff.ts` | Explains what a manual edit changed |
| `src/lib/storage.ts` | Local storage keys, backup export and import |
| `src/hooks/useSyncedStore.ts` | Cloud sync: load, debounced save, realtime updates |
| `src/components/DrawView.tsx` | The draw screen |
| `src/components/PlayersView.tsx` | Squad management |
| `src/components/HistoryView.tsx` | Saved rounds and results |
| `src/components/AnalysisView.tsx` | Attendance and trends |

## License

Personal project, no license granted.
