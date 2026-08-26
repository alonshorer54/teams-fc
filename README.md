# ⚽ Teams FC

Every week, the same argument: who plays with whom, why that team is obviously
stronger, and who still hasn't paid for the pitch. This app settles it — pick
who showed up, press draw, and send the teams to the group chat.

**Live app: https://teams-fc.netlify.app**

Hebrew, right-to-left, installable on a phone, and synced between devices.

## What it does

- **Squad** — players with a 1–5 rating, friendships, "prefers with / without", and free-text tags.
- **Draw** — splits whoever showed up into 2 or 3 balanced teams. Team colours can be
  swapped after the draw, and an incomplete squad can be topped up with one-off
  "filler" players so the teams still come out even.
- **Manual edits** — swap or move any player; the app explains what the edit broke —
  friends separated, balance worsened, tags clumped — with one-click undo.
- **Share** — a clean text list or a generated image, ready to paste into WhatsApp.
  A list pasted back from the group chat is matched against the squad automatically.
- **History and trends** — saved rounds, win/loss streaks, attendance over time, and
  which pairs actually perform better together than apart.
- **Payments** — who paid for the week and who still owes.

## How the draw works

Splitting players into balanced teams is a variant of the partition problem, so
the app uses a heuristic rather than an exact solver: greedy construction with
random noise, then hill-climbing over every pair swap, repeated 60 times. It
reaches a 0.00 rating gap in well under a second.

Keeping only the single cheapest result made every draw identical. Restarting
the same deterministic cost function converges on the same split nearly every
time, so redrawing reshuffled the order within a team and changed nothing else.
The search therefore runs in two halves, and the restart budget is split between
them so a draw stays instant.

The first half is the plain search, and it fixes a good opening. The second half
goes looking for *different* splits on purpose: it kicks the opening (a few
random swaps) and descends again, this time with a repulsion term that pushes
the hill-climb away from pairs who have played together recently and into a
different valley. Every result from both halves lands in one pool, deduplicated
by a signature that ignores team colour and member order. Searching only once
was the original mistake — collecting results is useless if the search keeps
finding the same one, which is exactly what small squads did.

The pool is then filtered against the best result found across both halves, and
each criterion carries its own allowance, because a flat one is wrong here in
several directions at once.

`rating` gets 0.05 — five hundredths of a point of average gap, a third of a
rating point spread over a team of seven. That is the bound that protects the
balance, and it is the only criterion measured as a proportion.

`friends` and `affinity` are **counted in relations, not percentages**
(`MAX_EXTRA_VIOLATIONS`, currently 2). Their penalties are fractions of however
many friend pairs or preferences the pool happens to contain, so a percentage
means something different in every squad: 5% is a whole friendship in a pool
with nineteen of them and not half a preference in a pool with four. A squad
where four preferences all belong to one player would have every alternative
vetoed by that one player. One relation is one relation.

The remaining criteria keep a proportional allowance (`VARIETY_FLEX`) several
times the base, since a two-player tag landing together swings that penalty by
half on its own. They are the criteria the user ranked last, so they are the
ones that should bend first.

Whatever survives is scored on how many recently-paired players it puts back
together — the last four saved draws plus whatever is on screen, at a decaying
weight, ignoring friend pairs since those are meant to recur — and the loosest
one wins. With no history they all score alike and the draw genuinely draws
between them.

A densely connected squad can still leave only one qualifying split — friendship
is transitive here, so a chain of individual links becomes one block, and a block
of seven in teams of seven fixes an entire team on its own. When the filter comes
back with nothing to choose from, the search runs up to three more rounds with a
harder kick rather than relaxing the social bounds. That costs time only when it
is actually needed.

Measured over ten consecutive redraws across squads of 12 to 21 in two and three
teams, including a real one: no configuration repeats the previous draw any more
(12 players in two teams used to return an identical split nine times out of
ten), and the worst rating gap stays inside its bound. The cost is the declared
one — up to two friend pairs or preferences given up against the best split the
same search finds with variety switched off.

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

**Learned chemistry** is the one criterion the app derives rather than being told:
it compares how often a pair wins together against how each of them performs
individually. Pairs that beat that expectation are treated as extra strength and
spread *apart* — the goal is balance, so clustering them would achieve the opposite.

## Architecture

TypeScript · React 19 · Tailwind CSS 4 · Vite · Supabase · Netlify

**No backend of its own.** The app is static files that talk to Supabase directly.
Access is enforced by Postgres row-level security, so the rule lives in the
database rather than in client code that anyone can read. The `anon` key is public
by design; without a signed-in account it cannot read or write anything.

**One document per user.** All of a user's data sits in a single row as JSONB, which
is why tags, per-player preferences and the round format could all be added later
without a single schema migration. The trade-off is that cross-user queries are
impossible — irrelevant here, since a user only ever loads their own data.

**Sync** works in three parts: load on sign-in, save 900 ms after the last change,
and a realtime channel for updates from another device. Saves carry a fingerprint
of the data so the app can recognise the echo of its own write and ignore it,
instead of looping forever.

## Project layout

| Path | Role |
| --- | --- |
| `src/types.ts` | Core types (`Player`, `Lineup`, `MatchRecord`) and team metadata |
| `src/lib/balance.ts` | The balancing algorithm and lineup statistics |
| `src/lib/criteria.ts` | Draw criteria, their penalties, and priority weighting |
| `src/lib/pairs.ts` | Learned chemistry between pairs of players |
| `src/lib/diff.ts` | Explains what a manual edit changed |
| `src/lib/parseNames.ts` | Matches a pasted WhatsApp list against the squad |
| `src/lib/storage.ts` | Local storage keys, backup export and import |
| `src/hooks/useSyncedStore.ts` | Cloud sync: load, debounced save, realtime updates |
| `src/components/DrawView.tsx` | The draw screen |
| `src/components/PlayersView.tsx` | Squad management |
| `src/components/HistoryView.tsx` | Saved rounds and results |
| `src/components/AnalysisView.tsx` | Attendance and trends |

## Running it locally

```bash
npm install && npm run dev
```

Opens on `http://localhost:5173`. With no Supabase keys configured the app runs
in local mode and keeps everything in `localStorage` — no account required, which
is enough to try the whole draw flow.

Scripts: `npm run dev`, `npm run build`, `npm run preview`, `npm run lint`.

<details>
<summary>Connecting your own Supabase project (only needed for cross-device sync)</summary>

1. Create a free project at [supabase.com](https://supabase.com).
2. Run [`supabase-setup.sql`](./supabase-setup.sql) in the SQL Editor — it creates
   the table, enables row-level security and turns on realtime.
3. Copy `.env.example` to `.env.local` and fill in the project URL and anon key
   from Project Settings → API.
4. Restart the dev server, sign up once, and use the same account on your phone.

</details>

## Deployment

Hosted on Netlify and configured by [`netlify.toml`](./netlify.toml): pushing to
`main` builds and publishes automatically. Supabase keys come from the site's
environment variables, and `sw.js` is served with `no-store` so a phone can't get
stuck on a stale build.

The site origin has to be listed under Supabase → Authentication → URL
Configuration, or sign-up confirmation and password-reset links get rejected.

## License

Personal project, no license granted.
