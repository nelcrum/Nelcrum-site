#!/usr/bin/env python3
"""Refresh the World Bank data behind "The continent the chart left out".

Pulls three World Development Indicators from the public World Bank API,
rebuilds the CSV files in data/africa-youth/, and writes a plain-language
summary of what changed to CHANGES.md so a person can review it before
anything is published.

Indicators
  SL.UEM.1524.ZS  Youth unemployment, ages 15-24 (% of labor force), ILO modeled estimate
  SL.EMP.VULN.ZS  Vulnerable employment (% of total employment), ILO modeled estimate
  SP.POP.0014.TO.ZS  Population ages 0-14 (% of total population)
  SP.POP.0014.TO     Population ages 0-14, total
  SL.UEM.NEET.ZS  Share of youth not in education, employment or training

Standard library only, so the GitHub Action needs no installs.
Usage: python scripts/update_africa_youth.py [--out data/africa-youth]
"""
import argparse
import csv
import json
import os
import sys
import time
import urllib.request
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timezone

API = "https://api.worldbank.org/v2"
INDICATORS = {
    "youth_unemployment": "SL.UEM.1524.ZS",
    "vulnerable_employment": "SL.EMP.VULN.ZS",
    "under15_share": "SP.POP.0014.TO.ZS",
    "under15_count": "SP.POP.0014.TO",
    "neet": "SL.UEM.NEET.ZS",
}
# Africa = World Bank Sub-Saharan Africa region plus North African states.
NORTH_AFRICA = {"DZA", "EGY", "LBY", "MAR", "TUN", "DJI"}
COMPARISON = ["FRA", "CHN", "GBR", "USA", "DEU"]  # the five countries in the WSJ chart
AGGREGATES = ["SSF", "WLD", "EUU"]
TREND_DEFAULT = ["ZAF", "TUN", "MAR", "EGY", "KEN", "NGA", "FRA", "USA"]
NAMES = {
    "USA": "U.S.", "GBR": "U.K.", "EGY": "Egypt", "COG": "Congo, Rep.", "COD": "Congo, Dem. Rep.",
    "GMB": "The Gambia", "SOM": "Somalia", "CIV": "Côte d'Ivoire", "STP": "São Tomé and Príncipe",
    "SSF": "Sub-Saharan Africa", "EUU": "European Union", "WLD": "World",
}
FIRST_YEAR = 1991


def get_json(url, tries=6):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                return json.load(r)
        except Exception as e:  # network hiccups are common on this API
            if i == tries - 1:
                raise
            print(f"retrying {url}: {e}", file=sys.stderr)
            time.sleep(15 * (i + 1))


def r1(v):
    """Round half up to one decimal, from the API's decimal text, as Stata and Excel would."""
    return float(Decimal(repr(v)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def fetch_indicator(code, first_year, last_year):
    """Page through the API in modest chunks; very large single pages time out."""
    out, updated, page, pages = {}, None, 1, 1
    while page <= pages:
        url = (f"{API}/country/all/indicator/{code}?format=json&per_page=5000"
               f"&date={first_year}:{last_year}&page={page}")
        head, rows = get_json(url)
        pages, updated = head.get("pages", 1), head.get("lastupdated")
        for r in rows or []:
            if r["value"] is None:
                continue
            out.setdefault(r["countryiso3code"], {})[int(r["date"])] = r1(r["value"])
        page += 1
    return out, updated


CHANGED = []


def write_csv(path, header, rows):
    import io
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(header)
    w.writerows(rows)
    new = buf.getvalue()
    old = open(path, encoding="utf-8").read() if os.path.exists(path) else None
    if new != old:
        CHANGED.append(os.path.basename(path))
        with open(path, "w", newline="", encoding="utf-8") as f:
            f.write(new)


def read_csv(path):
    if not os.path.exists(path):
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/africa-youth")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    # The API can hang when the date range includes a year with no data yet,
    # so ask through last calendar year. ILO estimates lag by about a year anyway.
    last_year = datetime.now(timezone.utc).year - 1
    countries = get_json(f"{API}/country?format=json&per_page=400")[1]
    meta = {c["id"]: c for c in countries}
    africa = sorted([c["id"] for c in countries if c["region"]["id"] == "SSF"] + list(NORTH_AFRICA))

    def name(k):
        return NAMES.get(k, meta.get(k, {}).get("name", k))

    def group(k):
        if k in COMPARISON:
            return "WSJ chart"
        return "Middle East and North Africa" if k in NORTH_AFRICA else "Sub-Saharan Africa"

    data, updated = {}, {}
    for key, code in INDICATORS.items():
        # Only the youth unemployment trend needs the full history.
        first = FIRST_YEAR if key == "youth_unemployment" else last_year - 12
        data[key], updated[code] = fetch_indicator(code, first, last_year)
    U = data["youth_unemployment"]

    # Latest year = most recent year with a world youth unemployment estimate.
    year = max(U["WLD"])

    # 1) Full time series (every African country with data + comparison countries)
    trend = []
    for k in africa + COMPARISON:
        for y in sorted(U.get(k, {})):
            trend.append([name(k), k, group(k), y, U[k][y]])
    write_csv(os.path.join(args.out, "trend_all.csv"),
              ["country", "iso3", "group", "year", "youth_unemployment"], trend)

    # 2) Latest-year snapshot per country
    snap = []
    for k in africa + COMPARISON:
        if year not in U.get(k, {}):
            continue
        n = data["neet"].get(k, {})
        ny = max(n) if n else ""
        snap.append([name(k), k, group(k), year, U[k][year],
                     data["vulnerable_employment"].get(k, {}).get(year, ""),
                     n.get(ny, "") if ny else "", ny,
                     data["under15_share"].get(k, {}).get(year, "")])
    snap.sort(key=lambda r: -r[4])
    snap_path = os.path.join(args.out, "countries_latest.csv")
    old_snap = {r["iso3"]: r for r in read_csv(snap_path)}
    write_csv(snap_path, ["country", "iso3", "group", "year", "youth_unemployment", "vulnerable_employment",
                          "neet", "neet_year", "under15_share"], snap)

    # 3) Age structure comparison
    P = data["under15_share"]
    age = [[name(k), k, "Africa" if k == "SSF" else "Comparison", year, P[k][year]]
           for k in ["SSF", "WLD", "USA", "CHN", "FRA", "GBR", "EUU", "DEU"] if year in P.get(k, {})]
    write_csv(os.path.join(args.out, "under15.csv"), ["place", "code", "group", "year", "under15_share"], age)

    # 4) Headline figures the article text depends on
    fr = U["FRA"][year]
    af = [r for r in snap if r[2] != "WSJ chart"]
    # Figures for the conclusion: vulnerable employment where youth unemployment is
    # above France's rate versus below Germany's, and the rank correlation.
    de = U["DEU"][year]
    V_ = data["vulnerable_employment"]
    pairs = [(r[4], V_[r[1]][year]) for r in af if year in V_.get(r[1], {})]
    hi_ve = [v for u, v in pairs if u > fr]
    lo_ve = [v for u, v in pairs if u < de]

    def median(xs):
        xs = sorted(xs); n = len(xs)
        return None if not n else (xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2)

    def ranks(xs):
        order = sorted(range(len(xs)), key=lambda i: xs[i]); rk = [0.0] * len(xs); i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
                j += 1
            for k in range(i, j + 1):
                rk[order[k]] = (i + j) / 2 + 1
            i = j + 1
        return rk

    def spearman(xs, ys):
        rx, ry = ranks(xs), ranks(ys); n = len(xs); mx = sum(rx) / n; my = sum(ry) / n
        cov = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
        return cov / (sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry)) ** 0.5

    N = data["under15_count"]
    headline = {
        "year": year,
        "african_countries_with_estimate": len(af),
        "african_countries_above_france": sum(1 for r in af if r[4] > fr),
        "france": fr,
        "south_africa": U.get("ZAF", {}).get(year),
        "madagascar_youth_unemployment": U.get("MDG", {}).get(year),
        "madagascar_vulnerable_employment": data["vulnerable_employment"].get("MDG", {}).get(year),
        "ssa_under15": P.get("SSF", {}).get(year),
        "eu_under15": P.get("EUU", {}).get(year),
        "ssa_under15_millions": round(N["SSF"][year] / 1e6) if N.get("SSF", {}).get(year) else None,
        "eu_under15_millions": round(N["EUU"][year] / 1e6) if N.get("EUU", {}).get(year) else None,
        # Whole multiple, for the article's "more than N times" wording.
        "ssa_eu_under15_multiple": int(N["SSF"][year] // N["EUU"][year]) if N.get("SSF", {}).get(year) and N.get("EUU", {}).get(year) else None,
        "germany": de,
        "african_countries_below_germany": len(lo_ve),
        "ve_median_above_france": r1(median(hi_ve)) if hi_ve else None,
        "ve_median_below_germany": r1(median(lo_ve)) if lo_ve else None,
        "ve_min_below_germany": min(lo_ve) if lo_ve else None,
        "rank_correlation": round(spearman([u for u, v in pairs], [v for u, v in pairs]), 2) if pairs else None,
    }
    old_meta_path = os.path.join(args.out, "meta.json")
    old_head = {}
    if os.path.exists(old_meta_path):
        with open(old_meta_path, encoding="utf-8") as f:
            old_head = json.load(f).get("headline", {})
    if not CHANGED and old_head == headline:
        print("No data changed; nothing to review.")
        return
    with open(old_meta_path, "w", encoding="utf-8") as f:
        json.dump({
            "refreshed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source": "World Bank, World Development Indicators (api.worldbank.org/v2)",
            "world_bank_last_updated": updated,
            "headline": headline,
        }, f, indent=2, ensure_ascii=False)
        f.write("\n")

    # 5) Change summary for the reviewer
    lines = [f"# Data refresh: {datetime.now(timezone.utc):%B %d, %Y}", "",
             "World Bank last-updated dates: " + ", ".join(f"{k} {v}" for k, v in updated.items()), ""]
    head_changes = [f"- {k}: {old_head.get(k)} to {v}" for k, v in headline.items() if old_head and old_head.get(k) != v]
    lines += ["## Figures quoted in the article text", ""]
    lines += head_changes or ["- No change."]
    if head_changes:
        lines += ["", "**The article copy quotes these numbers. Check the wording still holds before merging.**"]
    moved = []
    for r in snap:
        o = old_snap.get(r[1])
        if o and o.get("youth_unemployment") not in ("", None) and abs(float(o["youth_unemployment"]) - r[4]) >= 0.1:
            moved.append((abs(float(o["youth_unemployment"]) - r[4]), f"- {r[0]}: {o['youth_unemployment']}% to {r[4]}%"))
    added = [r[0] for r in snap if old_snap and r[1] not in old_snap]
    lines += ["", f"## Youth unemployment revisions ({year})", ""]
    lines += [m for _, m in sorted(moved, reverse=True)] or ["- No country moved by 0.1 points or more."]
    if added:
        lines += ["", "New countries with an estimate: " + ", ".join(added)]
    with open(os.path.join(args.out, "CHANGES.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
