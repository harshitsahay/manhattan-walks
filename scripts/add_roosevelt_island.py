"""Append Roosevelt Island streets to data/streets.json (mainland grid untouched).

Fetches the island street network from OSM via osmnx, filters to walkable
street highways, drops bridge edges (Queensboro approach), dissolves degree-2
chains into block segments, and appends them with 'ri-' prefixed ids.
Also refreshes data/stats.json.
"""
import json
import os

import osmnx as ox

from prep_data import (
    dissolve_degree2,
    is_street,
    street_name,
)

BASE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE, "..", "data")
STREETS_JSON = os.path.join(DATA_DIR, "streets.json")
STATS_JSON = os.path.join(DATA_DIR, "stats.json")
WALKS_JSON = os.path.join(DATA_DIR, "historic_walks.json")

PLACE = "Roosevelt Island, New York, USA"


def main():
    with open(STREETS_JSON) as fh:
        streets = json.load(fh)
    print(f"mainland grid: {len(streets)} segments")

    print(f"Fetching {PLACE} from OSM...")
    G = ox.graph_from_place(PLACE, network_type="all")
    keep = [
        (u, v, k)
        for u, v, k, d in G.edges(keys=True, data=True)
        if is_street(d.get("highway"))
        and not d.get("bridge")
        and d.get("name") != "Roosevelt Island Bridge"
    ]
    G = G.edge_subgraph(keep).copy()
    print(f"  {len(keep)} walkable street edges after bridge filter")
    G_proj = ox.project_graph(G)
    G = dissolve_degree2(G_proj)

    from pyproj import Transformer
    to_wgs = Transformer.from_crs(G_proj.graph["crs"], "EPSG:4326", always_xy=True)

    def to_latlon(geom):
        return [[lat, lon] for lon, lat in (to_wgs.transform(x, y) for x, y in geom.coords)]

    existing = {s["id"] for s in streets}
    added = 0
    for u, v, d in G.edges(data=True):
        rid = f"ri-{u}-{v}-0"
        if rid in existing:
            continue
        streets.append({
            "id": rid,
            "name": street_name(d.get("name")),
            "len_m": round(d["geometry"].length, 1),
            "coords": to_latlon(d["geometry"]),
        })
        added += 1

    with open(STREETS_JSON, "w") as fh:
        json.dump(streets, fh)

    ri = [s for s in streets if s["id"].startswith("ri-")]
    names = sorted({s["name"] for s in ri if s["name"]})
    total_len = sum(s["len_m"] for s in streets)
    print(f"island: +{added} segments (total {len(ri)}), {sum(s['len_m'] for s in ri)/1000:.2f} km")
    print(f"  names: {names}")

    covered = set()
    if os.path.exists(WALKS_JSON):
        for w in json.load(open(WALKS_JSON)):
            covered |= set(w.get("covered_edges") or [])
    stats = {
        "edge_count": len(streets),
        "total_len_m": round(total_len, 1),
        "covered_blocks": len(covered),
        "coverage_pct": round(100 * len(covered) / len(streets), 2),
        "distinct_street_names": len({s["name"] for s in streets if s["name"]}),
    }
    with open(STATS_JSON, "w") as fh:
        json.dump(stats, fh, indent=2)
    print("stats:", stats)


if __name__ == "__main__":
    main()