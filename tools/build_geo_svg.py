"""Генерирует inline-SVG карты: Казахстан серым, Актюбинская область зелёным, объекты точками.
Запуск: python3 tools/build_geo_svg.py > /tmp/geo.svg  — результат вставить в index.html, секция #geo."""
import json, math, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
kz = json.load(open(ROOT/'data/kz-border.geojson'))['features'][0]['geometry']['coordinates']
akt = json.load(open(ROOT/'data/aktobe-region.geojson'))['geometry']['coordinates']
sites = json.load(open(ROOT/'data/sites.json'))
W = 1000
LAT0 = 48.0; CL = math.cos(math.radians(LAT0))
allpts = [p for poly in kz for ring in poly for p in ring]
x0 = min(p[0] for p in allpts); x1 = max(p[0] for p in allpts)
y0 = min(p[1] for p in allpts); y1 = max(p[1] for p in allpts)
PAD = 14
K = (W - 2*PAD) / ((x1 - x0) * CL)
H = round((y1 - y0) * K + 2*PAD)
def P(lon, lat): return ((lon - x0) * CL * K + PAD, (y1 - lat) * K + PAD)
def path(rings):
    out = []
    for ring in rings:
        pts = [P(*p) for p in ring]
        # прореживание: пропускаем точки ближе 1.2px
        keep = [pts[0]]
        for q in pts[1:]:
            if math.dist(q, keep[-1]) > 1.2: keep.append(q)
        out.append('M' + 'L'.join(f'{x:.1f},{y:.1f}' for x, y in keep) + 'Z')
    return ''.join(out)
kzd = ''.join(path(poly) for poly in kz)
aktd = path(akt)
o = []
o.append(f'<svg class="geo-svg" viewBox="0 0 {W} {H}" role="img" aria-label="Карта Казахстана: Актюбинская область выделена, остальные регионы серым">')
o.append('<defs><radialGradient id="geoGlow"><stop offset="0" stop-color="#7EC64A" stop-opacity=".45"/><stop offset="1" stop-color="#7EC64A" stop-opacity="0"/></radialGradient>'
         '<pattern id="geoGrid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="rgba(255,255,255,.035)" stroke-width="1"/></pattern></defs>')
o.append(f'<rect width="{W}" height="{H}" fill="url(#geoGrid)"/>')
o.append(f'<path class="geo-kz" d="{kzd}"/>')
o.append(f'<path class="geo-akt" d="{aktd}"/>')
# подпись области
cx, cy = P(60.3, 47.75)
o.append(f'<text class="geo-akt-lbl" x="{cx:.0f}" y="{cy:.0f}" text-anchor="middle">АКТЮБИНСКАЯ<tspan x="{cx:.0f}" dy="1.25em">ОБЛАСТЬ</tspan></text>')
# точки
for i, s in enumerate(sites['sites']):
    x, y = P(s['lon'], s['lat'])
    akt_site = 'Актюбинская' in s['region']
    cls = 'geo-dot is-akt' if akt_site else 'geo-dot'
    o.append(f'<g class="{cls}" style="--d:{0.25 + i*0.05:.2f}s" transform="translate({x:.1f} {y:.1f})"><title>{s["name"]} — {s["region"]}</title><circle r="{5 if akt_site else 4}"/></g>')
pl = sites['plant']; px, py = P(pl['lon'], pl['lat'])
o.append(f'<g class="geo-plant" transform="translate({px:.1f} {py:.1f})"><title>Завод EasyMix — Актобе</title>'
         '<circle class="geo-glow" r="60" fill="url(#geoGlow)"/><circle class="geo-ring" r="10"/><circle class="geo-ring geo-ring-2" r="10"/>'
         '<rect x="-7" y="-7" width="14" height="14" transform="rotate(45)"/></g>')
o.append(f'<g class="geo-plant-lbl" transform="translate({px - 18:.1f} {py - 16:.1f})"><text text-anchor="end">ЗАВОД EASYMIX</text><text class="sub" text-anchor="end" dy="16">г. Актобе</text></g>')
o.append('</svg>')
sys.stdout.write(''.join(o))
