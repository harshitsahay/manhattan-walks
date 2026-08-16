"""Prepare Manhattan street grid + snap historic GPX walks onto it.

Outputs (written to data/):
  streets.json        compact street network: [{id, name, len_m, coords:[[lat,lng],...]}]
  historic_walks.json walks: [{route_id, date, note, walker, walked_km, covered_edges:[...], polyline:[[lat,lng],...]}]
  stats.json          totals: edge_count, total_len_m, coverage info
"""
import csv
import json
import os
from datetime import datetime

import gpxpy
import osmnx as ox
import pandas as pd
from shapely import LineString, Point
from shapely.strtree import STRtree

BASE = os.path.dirname(os.path.abspath(__file__))
GPX_DIR = os.path.join(BASE, "..", "gpx_files")
XLSX = os.path.join(BASE, "..", "master_file.xlsx")
SHEET_CSV = os.path.join(BASE, "..", "data", "walks_sheet.csv")
DATA_DIR = os.path.join(BASE, "..", "data")

SNAP_THRESHOLD_M = 15.0  # GPS points within this distance of a street count as "on" it

STREET_HIGHWAYS = {
    "primary", "primary_link", "secondary", "secondary_link",
    "tertiary", "tertiary_link", "residential", "living_street",
    "unclassified", "road",
}


def load_graph():
    G = ox.graph_from_place("Manhattan, New York, USA", network_type="all")
def is_street(hw):
    if isinstance(hw, list):
        return any(h in STREET_HIGHWAYS for h in hw)
    return hw in STREET_HIGHWAYS


def street_name(n):
    if isinstance(n, list):
        n = n[0]
    return str(n) if n else None


def load_graph():
    G = ox.graph_from_place("Manhattan, New York, USA", network_type="all")
    keep = [(u, v, k) for u, v, k, d in G.edges(keys=True, data=True)
            if is_street(d.get("highway"))]
    G = G.edge_subgraph(keep).copy()
    return G, ox.project_graph(G)


def edge_geom(G_proj, u, v, k):
    data = G_proj[u][v][k]
    if "geometry" in data:
        return data["geometry"]
    return LineString([(G_proj.nodes[u]["x"], G_proj.nodes[u]["y"]),
                       (G_proj.nodes[v]["x"], G_proj.nodes[v]["y"])])


def to_single(geom):
    """If geometry is multipart, keep the longest sub-line."""
    if geom.geom_type == "MultiLineString":
        return max(geom.geoms, key=lambda g: g.length)
    return geom


def dissolve_degree2(G_proj):
    """Merge chains of degree-2 nodes into single street segments.

    A node is dissolved only if both incident edges share the same name and
    highway type, so true junctions and name changes are preserved. This turns
    fragmented OSM ways into city-block-sized segments.
    """
    import networkx as nx
    from shapely.ops import linemerge

    def near(c1, c2):
        return abs(c1[0] - c2[0]) < 1e-6 and abs(c1[1] - c2[1]) < 1e-6

    G = nx.Graph()
    for u, v, k, d in G_proj.edges(keys=True, data=True):
        g = to_single(edge_geom(G_proj, u, v, k))
        if G.has_edge(u, v):
            if g.length > G[u][v]["geometry"].length:
                G[u][v]["geometry"] = g
            continue
        G.add_edge(u, v, geometry=g, name=d.get("name"), highway=d.get("highway"))
    for n, d in G_proj.nodes(data=True):
        G.add_node(n, x=d["x"], y=d["y"])

    changed = True
    while changed:
        changed = False
        for n in list(G.nodes()):
            nbrs = list(G.neighbors(n))
            if len(nbrs) != 2:
                continue
            a, b = nbrs
            ea, eb = G[a][n], G[n][b]
            if ea.get("name") != eb.get("name") or ea.get("highway") != eb.get("highway"):
                continue
            xy = (G.nodes[n]["x"], G.nodes[n]["y"])
            ga, gb = ea["geometry"], eb["geometry"]
            if not near(ga.coords[-1], xy):
                ga = LineString(ga.coords[::-1])
            if not near(gb.coords[0], xy):
                gb = LineString(gb.coords[::-1])
            merged = to_single(linemerge([ga, gb]))
            G.remove_node(n)
            if G.has_edge(a, b):
                if merged.length > G[a][b]["geometry"].length:
                    G[a][b]["geometry"] = merged
            else:
                G.add_edge(a, b, geometry=merged, name=ea["name"], highway=ea["highway"])
            changed = True
            break
    return G


def parse_sheet():
    """Read the Google Sheets export (data/walks_sheet.csv) -> {gpx_id: meta}.

    Columns: Date (walk), Map status, GPX file ID, Comments, Desc,
    Route comments (Harshit), Route comments (Jay), Distance (heuristic), ...
    """
    meta = {}
    if not os.path.exists(SHEET_CSV):
        print("  (no walks_sheet.csv — download from the Google Sheet, skipping)")
        return meta
    with open(SHEET_CSV, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            rid = str(row.get("GPX file ID", "")).strip()
            if not rid:
                continue
            date_raw = str(row.get("Date (walk)") or "").strip()
            try:
                date = datetime.strptime(date_raw, "%m/%d/%Y").date().isoformat()
            except (ValueError, TypeError):
                date = None
            desc = str(row.get("Desc", "") or "").strip()
            comments = str(row.get("Comments", "") or "").strip()
            note = desc or comments or None
            rc_h = str(row.get("Route comments (Harshit)", "") or "").strip()
            rc_j = str(row.get("Route comments (Jay)", "") or "").strip()
            walker = "Both" if rc_h and rc_j else ("Jay" if rc_j else "Harshit")
            meta[rid] = {"date": date, "note": note, "walker": walker}
    return meta


def main():
    print("Loading Manhattan street network from OSM...")
    G, G_proj = load_graph()
    print("Dissolving degree-2 chains into block segments...")
    G = dissolve_degree2(G_proj)

    from pyproj import Transformer
    to_wgs = Transformer.from_crs(G_proj.graph["crs"], "EPSG:4326", always_xy=True)

    def to_latlon(geom):
        return [[lat, lon] for lon, lat in (to_wgs.transform(x, y) for x, y in geom.coords)]

    edges = [{
        "id": f"{u}-{v}-0",
        "name": street_name(d.get("name")),
        "len_m": round(d["geometry"].length, 1),
        "coords": to_latlon(d["geometry"]),
    } for u, v, d in G.edges(data=True)]
    geoms = [d["geometry"] for _, _, d in G.edges(data=True)]
    tree = STRtree(geoms)
    total_len = sum(e["len_m"] for e in edges)
    print(f"  {len(edges)} street segments, {total_len/1000:.1f} km of streets, "
          f"{len({e['name'] for e in edges if e['name']})} named streets")

    transformer = None
    try:
        from pyproj import Transformer
        transformer = Transformer.from_crs("EPSG:4326", G_proj.graph["crs"],
                                           always_xy=True)
    except Exception as e:
        print("  (no transformer)", e)

    meta = parse_sheet()
    if os.path.exists(XLSX):  # legacy fallback for anything missing from the sheet
        df = pd.read_excel(XLSX)
        for _, row in df.iterrows():
            rid = str(row.get("GPX file ID", "")).strip()
            if not rid or rid in meta:
                continue
            date = row.get("Date (walk)")
            meta[rid] = {
                "date": str(date.date()) if isinstance(date, datetime) else None,
                "note": str(row.get("Comments", "")).strip() or None,
                "walker": "Harshit",
            }
    dated = sum(1 for m in meta.values() if m.get("date"))
    print(f"  metadata for {len(meta)} walks ({dated} dated)")

    walks, covered_total = [], set()
    files = sorted(f for f in os.listdir(GPX_DIR) if f.endswith(".gpx"))
    for fname in files:
        rid = fname.replace("route", "").replace(".gpx", "")
        with open(os.path.join(GPX_DIR, fname), "rb") as fh:
            gpx = gpxpy.parse(fh)
        walked_km = sum(seg.length_2d() for tr in gpx.tracks
                        for seg in tr.segments) / 1000
        polyline, covered = [], set()
        for tr in gpx.tracks:
            for seg in tr.segments:
                for p in seg.points:
                    polyline.append([p.latitude, p.longitude])
                    lon, lat = p.longitude, p.latitude
                    if transformer is not None:
                        lon, lat = transformer.transform(p.longitude, p.latitude)
                    pt = Point(lon, lat)
                    cands = tree.query(pt, predicate="dwithin",
                                       distance=SNAP_THRESHOLD_M)
                    if len(cands):
                        idx = min(cands, key=lambda i: geoms[i].distance(pt))
                        if geoms[idx].distance(pt) <= SNAP_THRESHOLD_M:
                            covered.add(edges[idx]["id"])
        walks.append({
            "route_id": rid,
            "date": meta.get(rid, {}).get("date"),
            "note": meta.get(rid, {}).get("note"),
            "walker": meta.get(rid, {}).get("walker") or "Harshit",
            "walked_km": round(walked_km, 2),
            "covered_edges": sorted(covered),
            "polyline": polyline,
        })
        covered_total |= covered
        print(f"  {fname}: walked {walked_km:.2f} km, {len(covered)} blocks covered")

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(os.path.join(DATA_DIR, "streets.json"), "w") as f:
        json.dump(edges, f)
    with open(os.path.join(DATA_DIR, "historic_walks.json"), "w") as f:
        json.dump(walks, f)
    with open(os.path.join(DATA_DIR, "stats.json"), "w") as f:
        json.dump({
            "edge_count": len(edges),
            "total_len_m": total_len,
            "covered_blocks": len(covered_total),
            "coverage_pct": round(100 * len(covered_total) / len(edges), 2),
            "distinct_street_names": len({e["name"] for e in edges if e["name"]}),
        }, f, indent=2)
    print(f"\nHistoric coverage: {len(covered_total)}/{len(edges)} "
          f"blocks ({100*len(covered_total)/len(edges):.2f}%)")


if __name__ == "__main__":
    main()
