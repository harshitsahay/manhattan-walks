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
- **Storage**: Supabase Postgres (`walks` table). Public read/write via the anon key — it's
  a personal app; if you want write-protection later, wire up Supabase Auth.
- **Hosting**: static build on Netlify. No server, no spin-down.

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

Seed historic walks into Supabase (after running the schema):

    VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... node scripts/seed_supabase.mjs

## Local dev

    npm install
    cp .env.example .env   # fill in Supabase URL + anon key
    npm run dev

## Deploy

    npm run build
    npx netlify-cli deploy --prod --dir dist
