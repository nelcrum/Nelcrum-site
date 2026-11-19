/* NELCRUM Solutions: "The continent the chart left out"
 * Draws the charts on africa-youth.html from data/africa-youth/*.csv and meta.json.
 * Those files are refreshed monthly by .github/workflows/refresh-africa-youth-data.yml
 * and published only after review, so this script never needs editing for new data.
 */
(function () {
  var BASE = 'data/africa-youth/';
  // NELCRUM editorial palette: brand green leads, amber and rust accent, slate and sage support.
  var C = {
    ink: '#17140F', text: '#3A362F', muted: '#76716A', grid: '#E0DDD4', ref: '#17140F',
    green: '#14432F', amber: '#C98A2B', rust: '#B05733', rustText: '#8C3F22', wsj: '#A8A296',
    lines: ['#14432F', '#C98A2B', '#B05733', '#294056', '#5E8A6E', '#7A4E6E']
  };
  // A page can restyle every chart by defining window.AY_THEME before this script runs:
  // { colors: {...overrides of C}, axisBox: true|false, panel: '#hex'|null, grid: true|false }
  var T = window.AY_THEME || {};
  if (T.colors) for (var ck in T.colors) C[ck] = T.colors[ck];
  var GRID = T.grid !== false;
  function gridStroke(isZero) { return isZero ? C.ref : (GRID ? C.grid : 'none'); }

  var TREND_AFRICA = ['ZAF', 'TUN', 'MAR', 'EGY', 'KEN', 'NGA'];
  var TREND_REF = ['FRA', 'USA'];
  var state = { pick: '', region: 'all' };
  var D = null;
  var NS = 'http://www.w3.org/2000/svg';

  function $(id) { return document.getElementById(id); }
  function f1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function num(v) { return v === '' || v == null ? null : +v; }

  // ---------- data ----------
  function parseCSV(text) {
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    var head = rows.shift();
    return rows.filter(function (r) { return r.length === head.length; }).map(function (r) {
      var o = {}; head.forEach(function (h, j) { o[h] = r[j]; }); return o;
    });
  }
  function get(name, json) {
    return fetch(BASE + name, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(name + ' ' + r.status);
      return json ? r.json() : r.text().then(parseCSV);
    });
  }
  function load() {
    return Promise.all([get('meta.json', true), get('trend_all.csv'), get('countries_latest.csv'), get('under15.csv'), get('protests.csv')])
      .then(function (a) { D = { meta: a[0], trend: a[1], countries: a[2], age: a[3], protests: a[4] }; });
  }

  // ---------- svg helpers ----------
  function el(tag, attrs, parent, text) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function panel(svg, x0, y0, x1, y1) {
    if (T.panel) el('rect', { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0), fill: T.panel }, svg);
  }
  function svgFor(box, w, h, label) {
    box.textContent = '';
    var s = el('svg', { width: w, height: h, viewBox: '0 0 ' + w + ' ' + h, role: 'img', 'aria-label': label }, box);
    return s;
  }
  function textW(svg, strings, size, weight) {
    var g = el('g', {}, svg), w = 0;
    strings.forEach(function (t) {
      var n = el('text', { 'font-size': size, 'font-weight': weight || 400 }, g, t);
      w = Math.max(w, n.getComputedTextLength());
    });
    svg.removeChild(g);
    return w;
  }
  function lin(d0, d1, r0, r1) { return function (v) { return r0 + (v - d0) / (d1 - d0) * (r1 - r0); }; }
  function niceMax(v, step) { return Math.ceil(v / step) * step; }
  function tip(box) {
    var t = document.createElement('div'); t.className = 'ay-tip'; t.hidden = true; box.appendChild(t); return t;
  }
  function showTip(box, t, title, rows, x, y) {
    t.textContent = '';
    var h = document.createElement('div'); h.className = 'h'; h.textContent = title; t.appendChild(h);
    rows.forEach(function (r) {
      var d = document.createElement('div'); d.className = 'r';
      var a = document.createElement('span'); a.textContent = r[0];
      var b = document.createElement('span'); b.textContent = r[1];
      d.appendChild(a); d.appendChild(b); t.appendChild(d);
    });
    t.hidden = false;
    var W = box.clientWidth, tw = t.offsetWidth, th = t.offsetHeight;
    var left = x + 14; if (left + tw > W) left = x - tw - 14; if (left < 0) left = 0;
    var top = y - th - 10; if (top < 0) top = y + 14;
    t.style.left = left + 'px'; t.style.top = top + 'px';
  }
  function local(box, ev) { var r = box.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }

  // ---------- text figures ----------
  function fillText() {
    var h = D.meta.headline || {};
    document.querySelectorAll('[data-k]').forEach(function (n) {
      var k = n.getAttribute('data-k'), v = h[k];
      if (v == null) return;
      var WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
      n.textContent = (k === 'year' || /countries|_millions$/.test(k)) ? String(v)
        : /_multiple$/.test(k) ? (WORDS[v] || String(v))
        : k === 'rank_correlation' ? (+v).toFixed(2) : f1(v);
    });
    // Country values quoted in the text: <span data-c="ISO3" data-f="column">
    var byIso = {}; (D.countries || []).forEach(function (r) { byIso[r.iso3] = r; });
    document.querySelectorAll('[data-c]').forEach(function (n) {
      var r = byIso[n.getAttribute('data-c')], f = n.getAttribute('data-f') || 'youth_unemployment';
      if (r && r[f] !== '' && r[f] != null) n.textContent = f1(+r[f]);
    });
    var fmt = function (iso) {
      var d = new Date(iso + (iso.length === 10 ? 'T12:00:00Z' : ''));
      return isNaN(d) ? iso : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
    };
    if (D.meta.refreshed_at) document.querySelectorAll('.ay-refreshed').forEach(function (n) { n.textContent = fmt(D.meta.refreshed_at); });
    var wb = D.meta.world_bank_last_updated && D.meta.world_bank_last_updated['SL.UEM.1524.ZS'];
    if (wb) document.querySelectorAll('.ay-wb-updated').forEach(function (n) { n.textContent = fmt(wb); });
  }

  // ---------- country picker ----------
  function fillPicker() {
    var sel = $('ay-pick'); if (!sel) return;
    var seen = {}, list = [];
    D.trend.forEach(function (r) {
      if (r.group === 'WSJ chart' || TREND_AFRICA.indexOf(r.iso3) >= 0 || seen[r.iso3]) return;
      seen[r.iso3] = 1; list.push([r.iso3, r.country]);
    });
    list.sort(function (a, b) { return a[1].localeCompare(b[1]); });
    sel.textContent = '';
    sel.appendChild(new Option('None', ''));
    list.forEach(function (o) { sel.appendChild(new Option(o[1], o[0])); });
    sel.value = state.pick;
  }

  // ---------- chart 1: trend ----------
  function drawTrend() {
    var box = $('ay-trend'); if (!box) return;
    var by = {};
    D.trend.forEach(function (r) {
      var v = num(r.youth_unemployment); if (v == null) return;
      (by[r.iso3] = by[r.iso3] || { name: r.country, pts: [] }).pts.push([+r.year, v]);
    });
    var keys = TREND_AFRICA.concat(state.pick && TREND_AFRICA.indexOf(state.pick) < 0 ? [state.pick] : []).concat(TREND_REF);
    var series = keys.filter(function (k) { return by[k]; }).map(function (k, i) {
      var ref = TREND_REF.indexOf(k) >= 0, picked = k === state.pick;
      var pts = by[k].pts.sort(function (a, b) { return a[0] - b[0]; });
      return { k: k, name: by[k].name, pts: pts, ref: ref, picked: picked,
        color: ref ? C.wsj : picked ? C.ink : C.lines[TREND_AFRICA.indexOf(k) % C.lines.length] };
    });
    var W = box.clientWidth, H = W < 520 ? 320 : 380;
    box.style.minHeight = '';
    var svg = svgFor(box, W, H, 'Line chart of youth unemployment since 1991 for ' + series.map(function (s) { return s.name; }).join(', '));
    var endW = textW(svg, series.map(function (s) { return s.name; }), 12, 700);
    var m = { t: 16, r: endW + 14, b: 24, l: T.axisBox ? 38 : 4 };
    var all = []; series.forEach(function (s) { all = all.concat(s.pts); });
    var x0 = Math.min.apply(null, all.map(function (p) { return p[0]; })), x1 = Math.max.apply(null, all.map(function (p) { return p[0]; }));
    var ymax = niceMax(Math.max.apply(null, all.map(function (p) { return p[1]; })), 10);
    var x = lin(x0, x1, m.l, W - m.r), y = lin(0, ymax, H - m.b, m.t);
    panel(svg, m.l, m.t, W - m.r, H - m.b);
    for (var v = 0; v <= ymax; v += 10) {
      el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: gridStroke(v === 0) }, svg);
      if (T.axisBox) el('text', { x: m.l - 7, y: y(v), dy: '0.32em', 'text-anchor': 'end', 'font-size': 12.5, fill: C.muted }, svg, v + '%');
      else el('text', { x: m.l, y: y(v) - 4, 'font-size': 12.5, fill: C.muted }, svg, v === ymax ? v + '%' : String(v));
    }
    if (T.axisBox) el('line', { x1: m.l, x2: m.l, y1: m.t, y2: H - m.b, stroke: C.ink }, svg);
    var step = W < 520 ? 10 : 5;
    for (var yr = Math.ceil(x0 / step) * step; yr <= x1; yr += step) {
      el('text', { x: x(yr), y: H - 6, 'font-size': 12.5, fill: C.muted, 'text-anchor': 'middle' }, svg, String(yr));
    }
    series.slice().sort(function (a, b) { return (b.ref ? 1 : 0) - (a.ref ? 1 : 0); }).forEach(function (s) {
      var d = s.pts.map(function (p, i) { return (i ? 'L' : 'M') + x(p[0]).toFixed(1) + ',' + y(p[1]).toFixed(1); }).join('');
      el('path', { d: d, fill: 'none', stroke: s.color, 'stroke-width': s.ref ? 1.6 : s.picked ? 3 : 2.2,
        'stroke-dasharray': s.ref ? '4 3' : 'none', 'stroke-linejoin': 'round' }, svg);
    });
    var labs = series.map(function (s) { var p = s.pts[s.pts.length - 1]; return { s: s, y: y(p[1]), x: x(p[0]) }; })
      .sort(function (a, b) { return a.y - b.y; });
    for (var it = 0; it < 60; it++) for (var i = 1; i < labs.length; i++) {
      var gap = labs[i].y - labs[i - 1].y; if (gap < 15) { var sh = (15 - gap) / 2; labs[i].y += sh; labs[i - 1].y -= sh; }
    }
    labs.forEach(function (l) {
      el('text', { x: W - m.r + 6, y: l.y, dy: '0.32em', 'font-size': 13, 'font-weight': l.s.ref ? 400 : 700, fill: l.s.ref ? C.muted : l.s.color }, svg, l.s.name);
    });
    var rule = el('line', { y1: m.t, y2: H - m.b, stroke: C.ref, opacity: 0 }, svg);
    var t = tip(box);
    var hit = el('rect', { x: m.l, y: m.t, width: Math.max(0, W - m.r - m.l), height: H - m.t - m.b, fill: 'transparent' }, svg);
    hit.addEventListener('pointermove', function (ev) {
      var p = local(box, ev), yr = Math.round(x0 + (p[0] - m.l) / (W - m.r - m.l) * (x1 - x0));
      yr = Math.max(x0, Math.min(x1, yr));
      rule.setAttribute('x1', x(yr)); rule.setAttribute('x2', x(yr)); rule.setAttribute('opacity', 1);
      var rows = series.map(function (s) { var q = s.pts.filter(function (p) { return p[0] === yr; })[0]; return q ? [s.name, q[1]] : null; })
        .filter(Boolean).sort(function (a, b) { return b[1] - a[1]; }).map(function (r) { return [r[0], f1(r[1]) + '%']; });
      showTip(box, t, String(yr), rows, x(yr), p[1]);
    });
    hit.addEventListener('pointerleave', function () { t.hidden = true; rule.setAttribute('opacity', 0); });
  }

  // ---------- chart 2: ranked bars ----------
  function drawRanked() {
    var box = $('ay-ranked'); if (!box) return;
    var rows = D.countries.map(function (r) {
      return { name: r.country, iso3: r.iso3, group: r.group, ref: r.group === 'WSJ chart', v: num(r.youth_unemployment), vul: num(r.vulnerable_employment) };
    }).filter(function (r) { return r.v != null && (r.ref || state.region === 'all' || r.group === state.region); })
      .sort(function (a, b) { return b.v - a.v; });
    var fr = rows.filter(function (r) { return r.iso3 === 'FRA'; })[0];
    var W = box.clientWidth, rh = 19, m = { t: 20, r: 38, b: 4 };
    var H = m.t + rows.length * rh + m.b;
    box.style.minHeight = '';
    var svg = svgFor(box, W, H, 'Bar chart ranking African countries and the five originally charted countries by youth unemployment rate');
    m.l = textW(svg, rows.map(function (r) { return r.name; }), 12, 700) + 10;
    var xmax = niceMax(Math.max.apply(null, rows.map(function (r) { return r.v; })), 10);
    var x = lin(0, xmax, m.l, W - m.r);
    panel(svg, m.l, m.t - 4, W - m.r, H - m.b);
    var plotW = W - m.r - m.l, tickStep = plotW < 180 ? 40 : plotW < 360 ? 20 : 10;
    for (var v = 0; v <= xmax; v += tickStep) {
      el('line', { x1: x(v), x2: x(v), y1: m.t - 4, y2: H - m.b, stroke: gridStroke(v === 0) }, svg);
      el('text', { x: x(v), y: m.t - 8, 'font-size': 12.5, fill: C.muted, 'text-anchor': 'middle' }, svg, String(v));
    }
    rows.forEach(function (r, i) {
      var yy = m.t + i * rh;
      el('rect', { x: m.l, y: yy + 3, height: rh - 6, width: Math.max(1, x(r.v) - m.l), fill: r.ref ? C.wsj : C.green }, svg);
      el('text', { x: m.l - 6, y: yy + rh / 2, dy: '0.32em', 'text-anchor': 'end', 'font-size': 13, 'font-weight': r.ref ? 700 : 600, fill: r.ref ? C.muted : C.text }, svg, r.name);
      el('text', { x: x(r.v) + 4, y: yy + rh / 2, dy: '0.32em', 'font-size': 12.5, 'font-weight': 700, fill: C.ink }, svg, f1(r.v));
    });
    if (fr) el('line', { x1: x(fr.v), x2: x(fr.v), y1: m.t - 4, y2: H - m.b, stroke: C.ink, 'stroke-dasharray': '3 3' }, svg);
    var t = tip(box);
    rows.forEach(function (r, i) {
      var hit = el('rect', { x: 0, y: m.t + i * rh, width: W, height: rh, fill: 'transparent' }, svg);
      hit.addEventListener('pointermove', function (ev) {
        var p = local(box, ev), rr = [['Youth unemployment', f1(r.v) + '%']];
        if (r.vul != null) rr.push(['Vulnerable employment', f1(r.vul) + '%']);
        if (fr && !r.ref) rr.push(['vs. France', (r.v >= fr.v ? '+' : '') + f1(r.v - fr.v) + ' pts']);
        showTip(box, t, r.name, rr, p[0], p[1]);
      });
      hit.addEventListener('pointerleave', function () { t.hidden = true; });
    });
  }

  // ---------- chart 3: scatter ----------
  function drawScatter() {
    var box = $('ay-scatter'); if (!box) return;
    var protest = {}; D.protests.forEach(function (p) { protest[p.iso3] = 1; });
    var pts = D.countries.map(function (r) {
      var ref = r.group === 'WSJ chart';
      return { name: r.country, iso3: r.iso3, x: num(r.youth_unemployment), y: num(r.vulnerable_employment), kind: ref ? 'ref' : protest[r.iso3] ? 'protest' : 'africa' };
    }).filter(function (r) { return r.x != null && r.y != null; });
    var W = box.clientWidth, H = W < 520 ? 360 : 420, m = { t: 10, r: 14, b: 26, l: 34 };
    box.style.minHeight = '';
    var svg = svgFor(box, W, H, 'Scatter plot of youth unemployment against vulnerable employment, highlighting African countries with Gen Z protests');
    var xmax = niceMax(Math.max.apply(null, pts.map(function (p) { return p.x; })), 10);
    var x = lin(0, xmax, m.l, W - m.r), y = lin(0, 100, H - m.b, m.t);
    panel(svg, m.l, m.t, W - m.r, H - m.b);
    for (var v = 0; v <= 100; v += 20) {
      el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: gridStroke(v === 0) }, svg);
      el('text', { x: m.l - 6, y: y(v), dy: '0.32em', 'text-anchor': 'end', 'font-size': 12.5, fill: C.muted }, svg, v + '%');
    }
    if (T.axisBox) el('line', { x1: m.l, x2: m.l, y1: m.t, y2: H - m.b, stroke: C.ink }, svg);
    var xs = W < 520 ? 20 : 10;
    for (var u = 0; u <= xmax; u += xs) {
      if (u) el('line', { x1: x(u), x2: x(u), y1: m.t, y2: H - m.b, stroke: gridStroke(false) }, svg);
      el('text', { x: x(u), y: H - 6, 'text-anchor': 'middle', 'font-size': 12.5, fill: C.muted }, svg, u + '%');
    }
    var order = { africa: 0, ref: 1, protest: 2 };
    pts.slice().sort(function (a, b) { return order[a.kind] - order[b.kind]; }).forEach(function (p) {
      el('circle', { cx: x(p.x), cy: y(p.y), r: p.kind === 'protest' ? 6 : 4.5,
        fill: p.kind === 'ref' ? C.wsj : p.kind === 'protest' ? C.rust : C.green,
        'fill-opacity': p.kind === 'africa' ? 0.55 : 1, stroke: '#fff', 'stroke-width': 1 }, svg);
    });
    var left = { NGA: 1, TGO: 1, DEU: 1, GBR: 1, CHN: 1 }, below = { NGA: 1, TZA: 2 }, above = { CMR: 1, ZAF: 1 };
    pts.filter(function (p) { return p.kind !== 'africa' || p.iso3 === 'ZAF'; }).forEach(function (p) {
      el('text', { x: x(p.x) + (left[p.iso3] ? -9 : 9), y: y(p.y) + (below[p.iso3] ? 9 * below[p.iso3] : above[p.iso3] ? -7 : 0), dy: '0.32em',
        'text-anchor': left[p.iso3] ? 'end' : 'start', 'font-size': 13, 'font-weight': p.kind === 'ref' ? 400 : 700,
        fill: p.kind === 'protest' ? C.rustText : p.kind === 'ref' ? C.muted : C.text }, svg, p.name);
    });
    var t = tip(box);
    var hit = el('rect', { x: m.l, y: m.t, width: Math.max(0, W - m.l - m.r), height: H - m.t - m.b, fill: 'transparent' }, svg);
    hit.addEventListener('pointermove', function (ev) {
      var q = local(box, ev), best = null, bd = 40;
      pts.forEach(function (p) { var d = Math.hypot(x(p.x) - q[0], y(p.y) - q[1]); if (d < bd) { bd = d; best = p; } });
      if (!best) { t.hidden = true; return; }
      showTip(box, t, best.name, [['Youth unemployment', f1(best.x) + '%'], ['Vulnerable employment', f1(best.y) + '%']], x(best.x), y(best.y));
    });
    hit.addEventListener('pointerleave', function () { t.hidden = true; });
  }

  // ---------- chart 4: under-15 bars ----------
  function drawAge() {
    var box = $('ay-age'); if (!box) return;
    var rows = D.age.map(function (r) { return { name: r.place, group: r.group, v: num(r.under15_share) }; })
      .filter(function (r) { return r.v != null; }).sort(function (a, b) { return b.v - a.v; });
    var W = box.clientWidth, rh = 26, m = { t: 20, r: 44, b: 4 };
    var H = m.t + rows.length * rh + m.b;
    box.style.minHeight = '';
    var svg = svgFor(box, W, H, 'Bar chart of the share of population under 15, Sub-Saharan Africa compared with the world and the originally charted countries');
    m.l = textW(svg, rows.map(function (r) { return r.name; }), 13, 700) + 10;
    var x = lin(0, 50, m.l, W - m.r);
    panel(svg, m.l, m.t - 4, W - m.r, H - m.b);
    for (var v = 0; v <= 50; v += 10) {
      el('line', { x1: x(v), x2: x(v), y1: m.t - 4, y2: H - m.b, stroke: gridStroke(v === 0) }, svg);
      el('text', { x: x(v), y: m.t - 8, 'font-size': 12.5, fill: C.muted, 'text-anchor': 'middle' }, svg, String(v));
    }
    rows.forEach(function (r, i) {
      var yy = m.t + i * rh, af = r.group === 'Africa';
      el('rect', { x: m.l, y: yy + 5, height: rh - 10, width: Math.max(1, x(r.v) - m.l), fill: af ? C.green : C.wsj }, svg);
      el('text', { x: m.l - 6, y: yy + rh / 2, dy: '0.32em', 'text-anchor': 'end', 'font-size': 13, 'font-weight': af ? 700 : 500, fill: af ? C.ink : C.text }, svg, r.name);
      el('text', { x: x(r.v) + 5, y: yy + rh / 2, dy: '0.32em', 'font-size': 13, 'font-weight': 700, fill: C.ink }, svg, f1(r.v));
    });
  }

  // ---------- table ----------
  function drawTable() {
    var tb = $('ay-protests'); if (!tb) return;
    var by = {}; D.countries.forEach(function (c) { by[c.iso3] = c; });
    tb.textContent = '';
    D.protests.forEach(function (p) {
      var c = by[p.iso3] || {}, tr = document.createElement('tr');
      [[p.country], [p.when], [p.spark], [p.what_happened],
        [num(c.youth_unemployment) == null ? '' : f1(+c.youth_unemployment) + '%', 'num'],
        [num(c.vulnerable_employment) == null ? '' : f1(+c.vulnerable_employment) + '%', 'num']].forEach(function (cell) {
        var td = document.createElement('td'); td.textContent = cell[0]; if (cell[1]) td.className = cell[1]; tr.appendChild(td);
      });
      var src = document.createElement('td');
      (p.source || '').split(/\s+/).filter(function (u) { return /^https:\/\//.test(u); }).forEach(function (u, i) {
        var a = document.createElement('a'); a.href = u; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = u.replace(/^https:\/\/(www\.)?/, '').split('/')[0];
        if (i) src.appendChild(document.createElement('br'));
        src.appendChild(a);
      });
      tr.appendChild(src);
      tb.appendChild(tr);
    });
  }

  function drawAll() {
    if (!D) return;
    var b = $('ay-trend'); if (b && b.clientWidth < 200) return; // layout not settled yet; resize/observer will redraw
    try { fillText(); fillPicker(); drawTrend(); drawRanked(); drawScatter(); drawAge(); drawTable(); }
    catch (e) { if (window.console) console.warn('africa-youth draw', e); }
  }
  function fail() {
    ['ay-trend', 'ay-ranked', 'ay-scatter'].forEach(function (id) {
      var b = $(id); if (b) { b.style.minHeight = ''; b.textContent = 'Chart data could not be loaded. The data files are linked under Methods and data.'; b.style.color = C.muted; b.style.fontSize = '13px'; }
    });
  }

  // ---------- controls (delegated, so they survive re-renders) ----------
  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'ay-pick') { state.pick = e.target.value; drawTrend(); }
  });
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('.ay-reg') : null;
    if (!b) return;
    state.region = b.getAttribute('data-region');
    document.querySelectorAll('.ay-reg').forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
    drawRanked();
  });

  // ---------- mount: wait for the page runtime to place the article ----------
  function ready(cb) { var t = 0; (function p() { if ($('ay-trend')) return cb(); if (t++ > 900) return; requestAnimationFrame(p); })(); }
  ready(function () {
    load().then(function () {
      drawAll();
      // The page runtime can re-render the article after load; redraw if our charts are wiped.
      var mo = new MutationObserver(function () { var b = $('ay-trend'); if (b && !b.querySelector('svg')) drawAll(); });
      mo.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { mo.disconnect(); }, 15000);
      var lastW = 0, timer;
      window.addEventListener('resize', function () {
        clearTimeout(timer);
        timer = setTimeout(function () { var b = $('ay-trend'); if (b && b.clientWidth !== lastW) { lastW = b.clientWidth; drawAll(); } }, 150);
      });
    }).catch(fail);
  });
})();
