# Manhattan Walks — Every Street

Walk every street in Manhattan. Click along streets to log walks, see what fraction
of the city you've covered, and watch the map fill in block by block.

## How it works

- **Street grid**: Manhattan's street network (OpenStreetMap, filtered to drivable/walkable
  streets, dissolved into ~7,700 block segments) ships with the app as `public/streets.json`.
- **Coverage**: a block is "covered" once a walk includes its street segment. Covered blocks
  render gold on the map; remaining blocks stay faint gray.
- **Logging a walk**: click along the streets you walked — each click snaps to the nearest
  street segment. Add a date and optional note, save. `covered_edges` are stored per walk.
- **GPX fallback**: upload a GPX file; its track points get snapped to the street grid the
  same way the historic walks were.
- **Storage**: Cloudflare D1 (SQLite) via a Worker API (`worker/`). Walks persist globally and
  sync across all users. No auth — it's a personal app.
- **Hosting**: static frontend on Cloudflare Pages (`manhattan-walks.pages.dev`) + API Worker
  (`manhattan-walks-api.manhattan-walks.workers.dev`) backed by D1.

## Historic data

`gpx_files/` holds 38 recorded walks. `scripts/prep_data.py` (Python, needs `osmnx`)
downloads the street grid, dissolves it into blocks, snaps every GPX walk onto it, and writes:

- `data/streets.json` — the street grid (copied to `public/streets.json`)
- `data/historic_walks.json` — the walks, with `covered_edges`
- `data/stats.json` — aggregate numbers

Run it with a conda env:

    conda create -y -n manhattan -c conda-forge python=3.11 osmnx gpxpy pandas
    conda run -n manhattan python scripts/prep_data.py
    cp data/streets.json public/streets.json

Seed historic walks into D1 (creates the table and inserts all walks):

    scripts/seed_d1.mjs > seed_data.sql
    npx wrangler d1 execute manhattan-walks-db --remote --file=migrations/0001_create_walks.sql
    npx wrangler d1 execute manhattan-walks-db --remote --file=seed_data.sql

## Local dev

    npm install
    cp .env.example .env   # optional; API defaults to the deployed worker
    npm run dev

To run the API worker locally (against local D1):

    npx wrangler dev --config worker/wrangler.jsonc

## Inspecting a single walk

Every walk row has a crosshair button. Click it and the map narrows down to just
that walk — its exact segments turn blue, every other route disappears, and the
rest of the city fades back. The banner gives distance, block count and who
walked it. "Back to all walks" restores the full view and the zoom level you
were on. Works the same from the History page.

## Keeping your data safe

`scripts/backup_walks.mjs` snapshots everything from D1 into
`backups/walks-YYYY-MM-DD.json`.

    npm run backup                              # write today's snapshot
    npm run backup -- --out backups/monday.json # choose the filename
    npm run backup:restore -- backups/monday.json          # add missing walks
    npm run backup:restore -- backups/monday.json --replace  # make it match exactly

Restore never overwrites existing rows unless you pass `--replace`, so it is
safe to re-run. Restores insert only the rows that are missing, so your current
walks are kept.

Cloudflare's own D1 Time Travel is the other safety net: you can rewind the
database itself from the dashboard or `wrangler d1 time-travel restore`.

Daily automated backups are not switched on yet. The workflow that would run
them is not in this repository on purpose: this repo is public, so a job that
commits snapshots would publish your walk notes to the world. Street coverage is
fine to share, private notes are not.

Once you make the repository private, the automation can be added. It runs at
06:17 UTC each day and needs two secrets:

- `CLOUDFLARE_API_TOKEN` — a Cloudflare API token with D1 read access
- `CLOUDFLARE_ACCOUNT_ID` — `1d82e8d261801b9965572d476a41e121`

Until then, run `npm run backup` yourself whenever you want a fresh snapshot.
Snapshots live in `backups/` and are git-ignored.

## Locking the site down

There are two separate layers, and they are not equally strong.

**The password gate** (`VITE_APP_PASSWORD` in `.env`) only hides the map from a
casual visitor. Anything in a browser bundle is public, so it stops nobody who
is determined. Leave it unset and the app opens straight away.

**The API token** is the real lock — it protects the data, since every read and
write goes through the Worker.

    npx wrangler secret put API_TOKEN --config worker/wrangler.jsonc

Then put the same value in `.env` as `VITE_API_TOKEN` and redeploy the site
(`npm run deploy:site`) so the browser sends it as `X-Auth-Token`.

Without a token the Worker stays open, so nothing breaks. With one set, every
client must send it — including your friend's copy of the site. Send him the
value and have him rebuild before you switch it on, or he will start seeing 401s.

For protection you can't talk your way around, Cloudflare Access in front of the
site is the better tool: it emails both of you a one-time code and never puts a
secret in the code at all.

## Deploy

    # Deploys the API Worker AND the static site
    npm run deploy

    # Or individually:
    npm run deploy:api    # API Worker + D1
    npm run deploy:site   # static site to Pages
