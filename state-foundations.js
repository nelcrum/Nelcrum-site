/* NELCRUM Solutions - State Foundation Overview
 * Two data layers:
 *   • Community foundations (LIVE): real IRS Form 990 aggregates pulled per
 *     state through the Apps Script proxy (?action=cfstate). Cached server-side.
 *   • All foundations (ESTIMATE): representative dataset (states-foundations.json),
 *     clearly badged, for orientation until the full IRS build is finished.
 * Results are email-gated and NELCRUM-branded, consistent with the other tools.
 */
(function () {
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycby6VPp5kEWJupRvJH2xRvs5D14CEGQvxaMR3kDFH43WTTv69_DL3ZesS8NFKdTxvMgFGg/exec';
  var PALETTE = ['#C98A2B', '#14432F', '#4E6B43', '#B04A3C', '#2A6FDB'];
  var DATA = null, compare = [], metric = 'giving', layer = 'cf', current = null, perCapita = false, realDollars = false;
  var CFCACHE = {};
  // CPI-U annual averages, rebased so factor * nominal = 2023 dollars.
  var CPI23 = { 2015: 1.2856, 2016: 1.2696, 2017: 1.2431, 2018: 1.2135, 2019: 1.1919, 2020: 1.1773, 2021: 1.1245, 2022: 1.0412, 2023: 1 };
  function cpiAdj(v, y) { return realDollars && CPI23[y] ? v * CPI23[y] : v; }
  // Resident population by state (Census 2023 vintage estimates, in thousands).
  var POP = { AL: 5108, AK: 733, AZ: 7431, AR: 3067, CA: 38965, CO: 5877, CT: 3617, DE: 1031, DC: 679, FL: 22610, GA: 11029, HI: 1435, ID: 1964, IL: 12549, IN: 6862, IA: 3207, KS: 2940, KY: 4526, LA: 4573, ME: 1395, MD: 6180, MA: 7001, MI: 10037, MN: 5737, MS: 2939, MO: 6196, MT: 1132, NE: 1978, NV: 3194, NH: 1402, NJ: 9290, NM: 2114, NY: 19571, NC: 10835, ND: 783, OH: 11785, OK: 4053, OR: 4233, PA: 12961, RI: 1095, SC: 5373, SD: 919, TN: 7126, TX: 30503, UT: 3417, VT: 647, VA: 8715, WA: 7812, WV: 1770, WI: 5910, WY: 584 };
  function popOf(ab) { return POP[ab] ? POP[ab] * 1000 : null; }
  var NTEE_LABELS = { A: 'Arts & culture', B: 'Education', C: 'Environment', D: 'Animal welfare', E: 'Health', F: 'Mental health', G: 'Disease & disorders', H: 'Medical research', I: 'Crime & legal', J: 'Employment', K: 'Food & agriculture', L: 'Housing & shelter', M: 'Public safety', N: 'Recreation & sports', O: 'Youth development', P: 'Human services', Q: 'International', R: 'Civil rights', S: 'Community & economic dev', T: 'Philanthropy', U: 'Science & technology', V: 'Social science', W: 'Public & societal benefit', X: 'Religion', Y: 'Mutual benefit', Z: 'Unclassified' };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function money(n) {
    if (n == null || isNaN(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(0) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function num(n) { return (n == null || isNaN(n)) ? 'n/a' : Math.round(n).toLocaleString(); }
  // NELCRUM editorial controls: text tabs with accent underlines, small-cap group labels, quiet source lines.
  function tabStyle(on, accent) { return 'font-family:Archivo,sans-serif; font-weight:700; font-size:13px; padding:6px 1px; border:none; background:none; cursor:pointer; letter-spacing:.01em; color:' + (on ? '#17140F' : '#8A857B') + '; border-bottom:2px solid ' + (on ? (accent || '#C98A2B') : 'transparent') + ';'; }
  function grpLabel(t) { return '<span data-grp style="font-family:Archivo,sans-serif; font-size:10.5px; font-weight:700; letter-spacing:.18em; text-transform:uppercase; color:#8A857B; margin-right:4px;">' + t + '</span>'; }
  function srcTag(txt, color, dot) { return '<span style="margin-left:auto; display:inline-flex; align-items:center; gap:7px; font-family:Archivo,sans-serif; font-size:10.5px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; color:' + color + ';">' + (dot ? '<span style="width:7px; height:7px; border-radius:999px; background:' + dot + '; flex:none;"></span>' : '') + txt + '</span>'; }
  // Artifact card: dark ink header bar with ochre kicker, like the firm card on the homepage.
  function artifactCard(kicker, title, sub, badge, bodyHtml) {
    return '<div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; overflow:hidden; margin-bottom:26px; box-shadow:0 1px 2px rgba(20,25,20,.05), 0 24px 50px -34px rgba(20,25,20,.4);">'
      + '<div style="background:#17140F; color:#F5F4F0; padding:22px 26px;">'
      + '<div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:10px;"><span style="font-family:Archivo,sans-serif; font-size:11px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; color:#C98A2B;">' + kicker + '</span>' + badge + '</div>'
      + '<div style="font-family:Archivo,sans-serif; font-weight:700; font-size:clamp(24px,3vw,36px); letter-spacing:-.02em; line-height:1.1;">' + title + '</div>'
      + (sub ? '<div style="font-size:13.5px; color:rgba(245,244,240,.62); margin-top:8px;">' + sub + '</div>' : '')
      + '</div>'
      + '<div style="padding:26px;">' + bodyHtml + '</div>'
      + '</div>';
  }
  // Print one-pager: hide site chrome, keep only the results panel.
  function preparePrint() {
    if ($('sf-print-css')) return;
    var st = document.createElement('style');
    st.id = 'sf-print-css';
    st.textContent = '@media print { header, footer, #sf-form, #sf-gate, #sf-map, [data-sf-hero], [data-nav], [data-navrow] { display: none !important; } body { background: #fff !important; } #sf-results { display: block !important; } button[data-sf-share], button[data-sf-print], button[data-sf-layer], button[data-sf-pc], span[data-grp] { display: none !important; } [data-yearsgrid] { grid-template-columns: 1fr !important; } }';
    document.head.appendChild(st);
  }

  function ready(cb) { var t = 0; (function p() { if ($('sf-form')) return cb(); if (t++ > 600) return; requestAnimationFrame(p); })(); }
  function stName(abbr) { return (DATA && DATA.states[abbr]) ? DATA.states[abbr].name : abbr; }
  function isAvgMetric() { return metric === 'avgGrant' || metric === 'avgPer'; }
  function valFor(yr) { return yr[metric]; }
  // Value adjusted for the active per-capita mode, using the given state's population.
  function valAdj(yr, abbr) {
    var v = yr[metric];
    if (metric !== 'count') v = cpiAdj(v, yr.y);
    if (!perCapita || isAvgMetric()) return v;
    var p = popOf(abbr); if (!p) return v;
    return metric === 'count' ? v / p * 100000 : v / p;
  }
  function fmtMetric(v) {
    if (metric === 'count') return perCapita ? (Math.round(v * 10) / 10).toLocaleString() : num(v);
    return money(v);
  }
  function metricSet() {
    return layer === 'cf'
      ? [['giving', 'Giving'], ['assets', 'Assets'], ['count', 'Foundations'], ['avgPer', 'Avg / foundation']]
      : [['giving', 'Giving'], ['assets', 'Assets'], ['count', 'Foundations'], ['avgGrant', 'Avg grant']];
  }
  function metricLabel() {
    var s = metricSet(), base = 'Giving';
    for (var i = 0; i < s.length; i++) if (s[i][0] === metric) base = s[i][1];
    if (perCapita && !isAvgMetric()) base += metric === 'count' ? ' per 100k residents' : ' per resident';
    return base;
  }

  function loadDataset(cb) {
    if (DATA) return cb();
    var m = location.search.match(/[?&]t=([^&]+)/);
    fetch('./states-foundations.json' + (m ? '?t=' + m[1] : '')).then(function (r) { return r.json(); }).then(function (d) { DATA = d; cb(); })
      .catch(function () { var mm = $('sf-msg'); if (mm) { mm.textContent = 'Could not load the dataset file. Make sure states-foundations.json is deployed alongside this page.'; mm.style.color = '#F2B8A2'; } });
  }

  function fillStates() {
    if (!DATA) return;
    var sel = $('sf-state');
    if (!sel) return;
    // Re-fill whenever the select is missing its options (a fresh element after
    // support.js re-mounts the template wipes any prior JS-injected <option>s).
    if (sel.options.length > 1) return;
    var keys = Object.keys(DATA.states).sort(function (a, b) { return DATA.states[a].name.localeCompare(DATA.states[b].name); });
    sel.innerHTML = '<option value="">Choose a state…</option>' + keys.map(function (k) { return '<option value="' + k + '">' + esc(DATA.states[k].name) + '</option>'; }).join('');
  }

  ready(function () {
    loadDataset(function () {
      fillStates();
      renderMap();
      // Deep link: ?state=GA&layer=rec opens that view directly.
      var qs = location.search.match(/[?&]state=([A-Za-z]{2})/);
      var ql = location.search.match(/[?&]layer=(pf|cf|estimate|rec)/);
      if (ql) layer = ql[1];
      if (qs && DATA.states[qs[1].toUpperCase()]) {
        var ab0 = qs[1].toUpperCase();
        var sel0 = $('sf-state'); if (sel0) sel0.value = ab0;
        setTimeout(function () { run(ab0); }, 400);
      }
      // The DC runtime may re-render the template after our first fill, replacing
      // the <select> with an empty one. Watch for that and repopulate.
      var mo = new MutationObserver(function () { fillStates(); if (!$('sf-map') || !$('sf-map').__drawn) renderMap(); });
      if (document.body) mo.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { mo.disconnect(); }, 12000);
    });
  });

  // ---------- MAP VIEW (state tile-grid cartogram) ----------
  // 8-row x 11-col grid, geographically arranged. Shades every state by the
  // selected metric from the estimate dataset (all 51 states, instant), grouped
  // by census region. Clicking a tile drills into that state's detail below.
  var GRID = { AK:[0,0], ME:[0,10], VT:[1,9], NH:[1,10], WA:[2,0], ID:[2,1], MT:[2,2], ND:[2,3], MN:[2,4], IL:[2,5], WI:[2,6], MI:[2,7], NY:[2,9], MA:[2,10], OR:[3,0], NV:[3,1], WY:[3,2], SD:[3,3], IA:[3,4], IN:[3,5], OH:[3,6], PA:[3,7], NJ:[3,8], CT:[3,9], RI:[3,10], CA:[4,0], UT:[4,1], CO:[4,2], NE:[4,3], MO:[4,4], KY:[4,5], WV:[4,6], VA:[4,7], MD:[4,8], DE:[4,9], AZ:[5,1], NM:[5,2], KS:[5,3], AR:[5,4], TN:[5,5], NC:[5,6], SC:[5,7], DC:[5,8], OK:[6,3], LA:[6,4], MS:[6,5], AL:[6,6], GA:[6,7], HI:[7,0], TX:[7,2], FL:[7,7] };
  var REGION = { Northeast: ['CT','ME','MA','NH','RI','VT','NJ','NY','PA'], Midwest: ['IL','IN','MI','OH','WI','IA','KS','MN','MO','NE','ND','SD'], South: ['DE','FL','GA','MD','NC','SC','VA','DC','WV','AL','KY','MS','TN','AR','LA','OK','TX'], West: ['AZ','CO','ID','MT','NV','NM','UT','WY','AK','CA','HI','OR','WA'] };
  var REGION_COLOR = { Northeast: '#2A6FDB', Midwest: '#4E6B43', South: '#C98A2B', West: '#B04A3C' };
  function regionOf(ab) { for (var r in REGION) if (REGION[r].indexOf(ab) >= 0) return r; return ''; }
  var mapMetric = 'giving', mapRegion = '';

  function mapVal(ab) {
    var st = DATA.states[ab]; if (!st) return 0;
    var yr = st.years[st.years.length - 1];
    var v = mapMetric === 'giving' ? yr.giving : mapMetric === 'assets' ? yr.assets : mapMetric === 'count' ? yr.count : yr.avgGrant;
    if (perCapita && mapMetric !== 'avgGrant') { var p = popOf(ab); if (p) v = mapMetric === 'count' ? v / p * 100000 : v / p; }
    return v || 0;
  }
  // Cream -> ochre -> deep green ramp for the choropleth.
  function ramp(t) {
    t = Math.max(0, Math.min(1, t));
    var stops = [[244,238,227],[233,205,150],[201,138,43],[75,90,60],[20,67,47]];
    var seg = t * (stops.length - 1), i = Math.floor(seg), f = seg - i;
    if (i >= stops.length - 1) return 'rgb(' + stops[stops.length - 1].join(',') + ')';
    var a = stops[i], b = stops[i + 1];
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * f) + ',' + Math.round(a[1] + (b[1] - a[1]) * f) + ',' + Math.round(a[2] + (b[2] - a[2]) * f) + ')';
  }
  function mapFmt(v) { if (mapMetric === 'count') return perCapita ? (Math.round(v * 10) / 10) : Math.round(v).toLocaleString(); var a = Math.abs(v); if (a >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B'; if (a >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'M'; if (a >= 1e3) return '$' + Math.round(v / 1e3) + 'K'; return '$' + Math.round(v); }
  function mapLabel() { var base = mapMetric === 'giving' ? 'Total giving' : mapMetric === 'assets' ? 'Total assets' : mapMetric === 'count' ? 'Foundations' : 'Avg grant size'; if (perCapita && mapMetric !== 'avgGrant') base += mapMetric === 'count' ? ' per 100k' : ' per resident'; return base; }

  function renderMap() {
    var box = $('sf-map'); if (!box || !DATA) return;
    box.__drawn = true;

    var h = '';
    h += '<div style="font-family:Archivo,sans-serif; font-size:12px; letter-spacing:.2em; text-transform:uppercase; color:#14432F; margin-bottom:8px;">Map view</div>';
    h += '<h2 style="font-family:Archivo,sans-serif; font-weight:700; font-size:clamp(24px,3.2vw,38px); letter-spacing:-.02em; margin:0 0 8px;">' + esc(mapLabel()) + ' by state</h2>';
    h += '<p style="font-size:14px; line-height:1.55; color:#57534A; margin:0 0 20px; max-width:60ch;">Every state shaded by the measure you choose. Click a state to open its full detail below, with the live IRS layers.</p>';

    // metric tabs
    h += '<div style="display:flex; flex-wrap:wrap; align-items:baseline; gap:2px 18px; margin-bottom:8px; border-bottom:1px solid #DDDBD2; padding-bottom:10px;">' + grpLabel('Measure');
    [['giving','Giving'],['assets','Assets'],['count','Foundations'],['avgGrant','Avg grant']].forEach(function (m) { var on = m[0] === mapMetric; h += '<button data-sfmap-metric="' + m[0] + '" style="' + tabStyle(on) + '">' + m[1] + '</button>'; });
    h += '</div>';
    // region filter + per capita
    h += '<div style="display:flex; flex-wrap:wrap; gap:2px 18px; margin-bottom:22px; align-items:baseline;">' + grpLabel('Region');
    ['', 'Northeast', 'Midwest', 'South', 'West'].forEach(function (r) { var on = r === mapRegion; var lbl = r || 'All'; h += '<button data-sfmap-region="' + r + '" style="' + tabStyle(on, r ? REGION_COLOR[r] : '#C98A2B') + '">' + lbl + '</button>'; });
    h += '<span style="flex:1;"></span>';
    h += '<button data-sfmap-pc="1" style="' + tabStyle(perCapita, '#14432F') + '">Per capita ' + (perCapita ? 'on' : 'off') + '</button>';
    h += '</div>';

    // national figures for the current filter
    var sums = { giving: 0, assets: 0, count: 0, pop: 0, n: 0 };
    Object.keys(DATA.states).forEach(function (ab2) {
      if (mapRegion && regionOf(ab2) !== mapRegion) return;
      var st2 = DATA.states[ab2]; var y2 = st2.years[st2.years.length - 1];
      sums.giving += y2.giving || 0; sums.assets += y2.assets || 0; sums.count += y2.count || 0; sums.pop += (popOf(ab2) || 0); sums.n++;
    });
    var scope = mapRegion ? 'across the ' + mapRegion : 'across ' + sums.n + ' states';
    h += '<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:20px 26px; margin-bottom:24px; max-width:860px;">'
      + card('Foundations', num(sums.count), scope)
      + card('Total giving', money(sums.giving), 'latest year, ' + scope)
      + card('Total assets', money(sums.assets), 'latest year, ' + scope)
      + card('Giving per resident', money(sums.giving / (sums.pop || 1)), num(sums.pop) + ' residents')
      + '</div>';

    // the map
    h += '<div id="sf-usmap" style="max-width:860px;"><div style="border:1px solid #DDDBD2; border-radius:4px; background:#fff; padding:48px; text-align:center; color:#57534A; font-size:14px;"><span style="display:inline-block;width:16px;height:16px;border:2px solid #EDEBE4;border-top-color:#C98A2B;border-radius:50%;animation:sfspin .8s linear infinite;vertical-align:-3px;margin-right:8px;"></span>Loading the national map…</div></div>';

    // legend
    h += '<div id="sf-uslegend" style="margin-top:18px; max-width:860px;"></div>';

    // national benchmark ranking
    var ranked = Object.keys(DATA.states).filter(function (a2) { return !mapRegion || regionOf(a2) === mapRegion; }).map(function (a2) {
      var st3 = DATA.states[a2]; var y3 = st3.years[st3.years.length - 1]; var p3 = popOf(a2) || 1;
      return { ab: a2, name: st3.name, giving: y3.giving, perRes: y3.giving / p3, count: y3.count };
    }).sort(function (a2, b2) { return (perCapita ? b2.perRes - a2.perRes : b2.giving - a2.giving); });
    h += '<div style="max-width:860px; margin-top:22px; background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:20px 22px;">';
    h += '<div style="display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:12px;"><span style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#8A857B;">State benchmark \u00b7 ' + (perCapita ? 'giving per resident' : 'total giving') + '</span><span style="font-size:11.5px; color:#8A857B;">' + ranked.length + ' states \u00b7 click any row to open</span></div>';
    h += '<div style="display:grid; grid-template-columns:auto 1fr auto auto auto; gap:4px 16px; font-family:Archivo,sans-serif; font-size:10.5px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#8A857B; padding-bottom:7px; border-bottom:1px solid #DDDBD2;"><span>#</span><span>State</span><span style="text-align:right;">Giving</span><span style="text-align:right;">Per resident</span><span style="text-align:right;">Foundations</span></div>';
    h += '<div style="max-height:340px; overflow-y:auto;">';
    ranked.forEach(function (r2, i2) {
      h += '<button data-sfmap-state="' + r2.ab + '" style="display:grid; grid-template-columns:auto 1fr auto auto auto; gap:4px 16px; align-items:baseline; width:100%; text-align:left; border:none; border-bottom:1px solid #EDEBE4; background:none; cursor:pointer; padding:8px 4px; font-family:inherit; font-size:12.5px;">'
        + '<span style="font-family:Archivo,sans-serif; font-weight:700; color:#8A857B; min-width:22px;">' + (i2 + 1) + '</span>'
        + '<span style="color:#17140F; font-weight:600;">' + esc(r2.name) + '</span>'
        + '<span style="text-align:right; font-family:Archivo,sans-serif; font-weight:700; color:#14432F; font-variant-numeric:tabular-nums;">' + money(r2.giving) + '</span>'
        + '<span style="text-align:right; color:#57534A; font-variant-numeric:tabular-nums;">' + money(r2.perRes) + '</span>'
        + '<span style="text-align:right; color:#57534A; font-variant-numeric:tabular-nums;">' + num(r2.count) + '</span>'
        + '</button>';
    });
    h += '</div></div>';
    h += '<div style="font-size:12px; color:#8A857B; margin-top:14px; line-height:1.5; max-width:80ch;">Map shading uses the representative estimate dataset so the whole country renders instantly. Click any state for its detail: the community-foundation and private-foundation layers pull live IRS data, and the geographic view opens county and metro (CBSA) shading built on the ZIP→county→CBSA crosswalk.</div>';

    box.innerHTML = h;
    drawUsMap();
  }

  // Real geography: AlbersUSA state choropleth with boundary lines (us-atlas TopoJSON,
  // same file the county drill-down uses, so it is fetched once and shared).
  function drawUsMap() {
    var el = $('sf-usmap'); if (!el || !DATA) return;
    if (!(GEO && USTOPO && window.d3 && window.topojson)) {
      ensureGeoDeps(function (err) {
        var el2 = $('sf-usmap'); if (!el2) return;
        if (err) { el2.innerHTML = '<div style="border:1px solid #DDDBD2; border-radius:4px; background:#fff; padding:40px; text-align:center; color:#8A857B; font-size:13px;">The interactive map could not load in this environment; it renders on the deployed site.</div>'; return; }
        drawUsMap();
      });
      return;
    }
    var feats = topojson.feature(USTOPO, USTOPO.objects.states).features;
    var W = 860, H = 540;
    var pr = d3.geoAlbersUsa().fitExtent([[6, 6], [W - 6, H - 6]], { type: 'FeatureCollection', features: feats });
    var path = d3.geoPath(pr);
    var abbrs = [];
    feats.forEach(function (f) { var ab = GEO.stateFips[String(f.id)]; if (ab && DATA.states[ab] && (!mapRegion || regionOf(ab) === mapRegion)) abbrs.push(ab); });
    var vals = abbrs.map(mapVal);
    var max = Math.max.apply(null, vals.concat([1])), min = Math.min.apply(null, vals.concat([0]));
    function norm(v) { if (max <= 0) return 0; var lm = Math.log(1 + max - min) || 1; return Math.log(1 + v - min) / lm; }
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%; height:auto; display:block;">';
    var labels = '';
    feats.forEach(function (f) {
      var ab = GEO.stateFips[String(f.id)];
      var d = path(f); if (!d) return;
      var known = ab && DATA.states[ab];
      var inR = known && (!mapRegion || regionOf(ab) === mapRegion);
      var v = known ? mapVal(ab) : 0;
      var t = inR ? norm(v) : 0;
      var fill = inR ? ramp(t) : '#ECE8DD';
      svg += '<path ' + (known ? 'data-sfmap-state="' + ab + '" ' : '') + 'd="' + d + '" fill="' + fill + '" stroke="#F5F4F0" stroke-width="0.6" style="cursor:' + (known ? 'pointer' : 'default') + ';">' + (known ? '<title>' + esc(DATA.states[ab].name) + ': ' + mapFmt(v) + '</title>' : '') + '</path>';
      if (inR) {
        var a = path.area(f);
        if (a > 1600) {
          var c = path.centroid(f);
          labels += '<text x="' + c[0].toFixed(1) + '" y="' + (c[1] - 2).toFixed(1) + '" text-anchor="middle" font-family="Archivo,sans-serif" font-size="10.5" font-weight="700" fill="' + (t > 0.55 ? '#F5F4F0' : '#17140F') + '" pointer-events="none">' + ab + '</text>';
          labels += '<text x="' + c[0].toFixed(1) + '" y="' + (c[1] + 10).toFixed(1) + '" text-anchor="middle" font-family="Archivo,sans-serif" font-size="8.5" font-weight="600" fill="' + (t > 0.55 ? 'rgba(245,244,240,.85)' : '#57534A') + '" pointer-events="none">' + mapFmt(v) + '</text>';
        } else if (a > 560) {
          var c2 = path.centroid(f);
          labels += '<text x="' + c2[0].toFixed(1) + '" y="' + (c2[1] + 3).toFixed(1) + '" text-anchor="middle" font-family="Archivo,sans-serif" font-size="10.5" font-weight="700" fill="' + (t > 0.55 ? '#F5F4F0' : '#17140F') + '" pointer-events="none">' + ab + '</text>';
        }
      }
    });
    svg += '<path d="' + path(topojson.mesh(USTOPO, USTOPO.objects.states, function (a, b) { return a !== b; })) + '" fill="none" stroke="#F5F4F0" stroke-width="1"></path>';
    svg += '<path d="' + path(topojson.mesh(USTOPO, USTOPO.objects.states, function (a, b) { return a === b; })) + '" fill="none" stroke="#C9C4B6" stroke-width="0.8"></path>';
    svg += labels + '</svg>';
    el.innerHTML = svg;
    var lg = $('sf-uslegend');
    if (lg) lg.innerHTML = '<div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">'
      + '<div style="display:flex; align-items:center; gap:8px;"><span style="font-family:Archivo,sans-serif; font-weight:700; font-size:12px; color:#57534A; font-variant-numeric:tabular-nums;">' + mapFmt(min) + '</span><span style="display:inline-block; width:160px; height:12px; border-radius:3px; background:linear-gradient(90deg,' + ramp(0) + ',' + ramp(.25) + ',' + ramp(.5) + ',' + ramp(.75) + ',' + ramp(1) + ');"></span><span style="font-family:Archivo,sans-serif; font-weight:700; font-size:12px; color:#57534A; font-variant-numeric:tabular-nums;">' + mapFmt(max) + '</span></div>'
      + '<span style="font-size:12px; color:#8A857B;">' + mapLabel() + ', log scale</span>'
      + '<span style="font-size:12px; color:#8A857B; margin-left:auto;">Hover any state for its value · click to open its detail</span>'
      + '</div>';
  }

  document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'sf-form') { e.preventDefault(); var s = $('sf-state'); if (s && s.value) run(s.value); else msg('Pick a state first.', true); }
    if (e.target && e.target.id === 'sf-addform') {
      e.preventDefault();
      var sel = $('sf-add'); if (!sel || !sel.value || compare.length >= 5) return;
      if (compare.some(function (c) { return c.abbr === sel.value; })) return;
      addToCompare(sel.value);
    }
  });
  document.addEventListener('click', function (e) {
    var mps = e.target && e.target.closest ? e.target.closest('[data-sfmap-state]') : null;
    if (mps) { var ab = mps.getAttribute('data-sfmap-state'); var sel = $('sf-state'); if (sel) sel.value = ab; run(ab); return; }
    var mpm = e.target && e.target.closest ? e.target.closest('[data-sfmap-metric]') : null;
    if (mpm) { mapMetric = mpm.getAttribute('data-sfmap-metric'); renderMap(); return; }
    var mpr = e.target && e.target.closest ? e.target.closest('[data-sfmap-region]') : null;
    if (mpr) { mapRegion = mpr.getAttribute('data-sfmap-region'); renderMap(); return; }
    var mpc = e.target && e.target.closest ? e.target.closest('[data-sfmap-pc]') : null;
    if (mpc) { perCapita = !perCapita; renderMap(); if (current) run(current); return; }
    var gt = e.target && e.target.closest ? e.target.closest('[data-geo-tab]') : null;
    if (gt) { geoTab = gt.getAttribute('data-geo-tab'); drawGeo(); return; }
    var gm = e.target && e.target.closest ? e.target.closest('[data-geo-metric]') : null;
    if (gm) { geoMetric = gm.getAttribute('data-geo-metric'); drawGeo(); return; }
    var gpc = e.target && e.target.closest ? e.target.closest('[data-geo-pc]') : null;
    if (gpc) { perCapita = !perCapita; if (current) run(current); return; }
    var rcb = e.target && e.target.closest ? e.target.closest('[data-rec-county]') : null;
    if (rcb) { var rv = rcb.getAttribute('data-rec-county'); recFips = (!rv || recFips === rv) ? null : rv; renderRecSide(); renderRecTable(); drawRecMap(); return; }
    var lb = e.target && e.target.closest ? e.target.closest('[data-sf-layer]') : null;
    if (lb) { var nl = lb.getAttribute('data-sf-layer'); if (nl !== layer) { layer = nl; metric = 'giving'; if (current) run(current); } return; }
    var pcb = e.target && e.target.closest ? e.target.closest('[data-sf-pc]') : null;
    if (pcb) { perCapita = !perCapita; if (current) run(current); return; }
    var yb = e.target && e.target.closest ? e.target.closest('[data-sf-year]') : null;
    if (yb) { selYear = +yb.getAttribute('data-sf-year'); if (lastBodyD) renderBody(lastBodyD, lastBodyCF, lastBodySample); return; }
    var shb = e.target && e.target.closest ? e.target.closest('[data-sf-share]') : null;
    if (shb) {
      var link = location.href;
      function ok() { shb.textContent = 'Link copied'; setTimeout(function () { shb.textContent = 'Copy link'; }, 1800); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(ok, function () { prompt('Copy this link:', link); });
      else prompt('Copy this link:', link);
      return;
    }
    var prb = e.target && e.target.closest ? e.target.closest('[data-sf-print]') : null;
    if (prb) { preparePrint(); window.print(); return; }
    var rmb2 = e.target && e.target.closest ? e.target.closest('[data-rec-mode]') : null;
    if (rmb2) { recMapMode = rmb2.getAttribute('data-rec-mode'); renderRecControls(); drawRecMap(); return; }
    var rnb = e.target && e.target.closest ? e.target.closest('[data-rec-ntee]') : null;
    if (rnb) { var nv = rnb.getAttribute('data-rec-ntee'); recNtee = (!nv || recNtee === nv) ? null : nv; renderRecControls(); renderRecSide(); renderRecTable(); drawRecMap(); return; }
    var mb = e.target && e.target.closest ? e.target.closest('[data-sf-metric]') : null;
    if (mb) { metric = mb.getAttribute('data-sf-metric'); renderChart(); return; }
    var rdb = e.target && e.target.closest ? e.target.closest('[data-sf-real]') : null;
    if (rdb) { realDollars = !realDollars; renderChart(); return; }
    var rm = e.target && e.target.closest ? e.target.closest('[data-sf-rm]') : null;
    if (rm) { e.preventDefault(); var i = +rm.getAttribute('data-sf-rm'); if (i > 0 && i < compare.length) { compare.splice(i, 1); renderChart(); } }
  });

  function msg(t, err) { var m = $('sf-msg'); if (m) { m.textContent = t || ''; m.style.color = err ? '#F2B8A2' : 'rgba(245,244,240,.6)'; } }

  function run(abbr) {
    selYear = null;
    loadDataset(function () {
      if (!DATA.states[abbr]) return;
      current = abbr;
      try {
        var t = location.search.match(/[?&]t=([^&]+)/);
        history.replaceState(null, '', location.pathname + '?' + (t ? 't=' + t[1] + '&' : '') + 'state=' + abbr + '&layer=' + layer);
      } catch (e) {}
      try {
        var tr = JSON.parse(sessionStorage.getItem('nc_sf_trail') || '[]');
        var entry = abbr + ':' + layer;
        if (tr[tr.length - 1] !== entry) { tr.push(entry); sessionStorage.setItem('nc_sf_trail', JSON.stringify(tr.slice(-40))); }
      } catch (e2) {}
      if (layer === 'cf') runCF(abbr); else if (layer === 'pf') runPF(abbr); else if (layer === 'rec') runRec(abbr); else runEstimate(abbr);
    });
  }

  // ---------- ESTIMATE LAYER ----------
  function runEstimate(abbr) {
    var st = DATA.states[abbr];
    msg('');
    compare = [{ abbr: abbr, name: st.name, color: PALETTE[0], years: st.years }];
    renderBody(st, false);
  }

  // ---------- ALL PRIVATE FOUNDATIONS LAYER (LIVE, IRS BMF) ----------
  function runPF(abbr) {
    var res = $('sf-results'); res.style.display = 'block';
    $('sf-teaser').innerHTML = layerToggle() + '<div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:40px; text-align:center; color:#57534A;"><span style="display:inline-block;width:16px;height:16px;border:2px solid #EDEBE4;border-top-color:#C98A2B;border-radius:50%;animation:sfspin .8s linear infinite;vertical-align:-3px;margin-right:8px;"></span>Loading IRS Business Master File for ' + esc(stName(abbr)) + '…</div>';
    try { var y = res.getBoundingClientRect().top + window.scrollY - 120; window.scrollTo({ top: y, behavior: 'smooth' }); } catch (e) {}
    fetchPF(abbr, function (d, isSample) { renderPF(abbr, d, isSample); });
  }

  function fetchPF(abbr, cb) {
    var key = 'pf_' + abbr;
    if (CFCACHE[key]) return cb(CFCACHE[key], CFCACHE[key].__sample);
    var settled = false;
    var timer = setTimeout(function () { if (!settled) { settled = true; var s = pfSample(abbr); CFCACHE[key] = s; cb(s, true); } }, 20000);
    fetch(ENDPOINT + '?action=pfstate&state=' + abbr).then(function (r) { return r.json(); }).then(function (d) {
      if (settled) return;
      if (!d || d.error || d.count == null) throw new Error('not built');
      settled = true; clearTimeout(timer); d.__sample = false; CFCACHE[key] = d; cb(d, false);
    }).catch(function () { if (settled) return; settled = true; clearTimeout(timer); var s = pfSample(abbr); CFCACHE[key] = s; cb(s, true); });
  }

  function pfSample(abbr) {
    var st = DATA.states[abbr];
    var latest = st ? st.years[st.years.length - 1] : { count: 0, assets: 0 };
    var ntee = {};
    (st ? st.ntee : []).forEach(function (n) { ntee[n.code] = { n: Math.round(latest.count * n.pct / 100), a: Math.round(latest.assets * n.pct / 100) }; });
    return { state: abbr, basis: 'sample', count: latest.count, assets: latest.assets, income: Math.round(latest.assets * 0.06), ntee: ntee, __sample: true };
  }

  function renderPF(abbr, d, isSample) {
    var P = popOf(abbr), pc = perCapita && P;
    var avg = d.count ? d.assets / d.count : 0;
    var badge = isSample ? srcTag('Demo · run BMF build for live data', '#E0B48E') : srcTag('Live · IRS BMF', '#9FD3B0', '#6FBF8B');

    var h = layerToggle();
    var stats = '<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:24px 28px;">'
      + card('Private foundations', pc ? (Math.round(d.count / P * 100000 * 10) / 10) + ' /100k' : num(d.count), 'registered with the IRS')
      + card('Total assets', pc ? money(d.assets / P) + ' /res' : money(d.assets), 'book value, all PFs')
      + card('Total income', pc ? money(d.income / P) + ' /res' : money(d.income), 'latest filed year')
      + card('Avg assets / foundation', money(avg), 'across the state')
      + '</div>';
    h += artifactCard('State Foundation Overview \u00b7 Private foundations', esc(stName(abbr)), num(d.count) + ' private foundations \u00b7 ' + (d.source || 'IRS Business Master File') + (d.built ? ' \u00b7 built ' + d.built : ''), badge, stats);

    // NTEE allocation by assets
    var letters = Object.keys(d.ntee || {}).map(function (k) { return { k: k, n: d.ntee[k].n, a: d.ntee[k].a }; }).sort(function (a, b) { return b.a - a.a; }).slice(0, 10);
    var maxA = letters.reduce(function (m, x) { return Math.max(m, x.a); }, 1);
    h += '<div id="sf-chart" style="display:none;"></div>';
    h += '<div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:22px 24px; margin-bottom:16px;">';
    h += '<div style="display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:16px;"><span style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#8A857B;">Assets by program area</span><span style="font-size:11.5px; color:#8A857B;">' + money(d.assets) + ' total</span></div>';
    letters.forEach(function (x) {
      h += '<div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;"><div style="width:170px; font-size:13px; color:#17140F; flex:none;">' + esc(NTEE_LABELS[x.k] || x.k) + '</div><div style="flex:1; background:#F0EEE7; border-radius:3px; height:16px; overflow:hidden;"><div style="height:100%; width:' + Math.round(x.a / maxA * 100) + '%; background:#C98A2B;"></div></div><div style="width:70px; text-align:right; font-family:Archivo,sans-serif; font-weight:700; font-size:13px; color:#14432F; flex:none;">' + money(x.a) + '</div><div style="width:60px; text-align:right; font-size:12px; color:#8A857B; flex:none;">' + num(x.n) + '</div></div>';
    });
    h += '<div style="font-size:12px; color:#8A857B; margin-top:12px; line-height:1.5;">Counts and assets are by each foundation\u2019s own NTEE classification. Grant giving and multi-year trend are not in the Business Master File; those come with the SOI 990-PF step. ZIP data is captured (' + (d.zipCount || 0) + ' ZIPs) and rolled up to county and metro (CBSA) level in the geographic view below.</div>';
    h += '</div>';
    h += '<div id="sf-geo" style="margin-top:26px;"></div>';

    $('sf-teaser').innerHTML = h;
    renderGeo(abbr);
    buildGate(stName(abbr), false);
  }

  // ---------- RECIPIENT GRANTS LAYER ----------
  // Every grant row geocoded to the recipient's county through the ZIP→county→CBSA
  // crosswalk. Tries the live proxy first (?action=grantstate, expected shape:
  // { state, grants: [{recipient, county, fips, ntee, amount}], total }), and falls
  // back to clearly-badged representative records until the 990-PF Schedule I
  // ingest is deployed. The UI is identical for both.
  var recData = null, recFips = null, recMapMode = 'dollars', recNtee = null;
  function hashN(s) { var hh = 0; for (var i = 0; i < s.length; i++) hh = (hh * 31 + s.charCodeAt(i)) >>> 0; return (hh % 1000) / 1000; }

  function runRec(abbr) {
    recMapMode = 'dollars'; recNtee = null;
    var res = $('sf-results'); res.style.display = 'block';
    $('sf-teaser').innerHTML = layerToggle() + '<div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:40px; text-align:center; color:#57534A;"><span style="display:inline-block;width:16px;height:16px;border:2px solid #EDEBE4;border-top-color:#C98A2B;border-radius:50%;animation:sfspin .8s linear infinite;vertical-align:-3px;margin-right:8px;"></span>Geocoding recipient grants for ' + esc(stName(abbr)) + '…</div>';
    try { var y = res.getBoundingClientRect().top + window.scrollY - 120; window.scrollTo({ top: y, behavior: 'smooth' }); } catch (e) {}
    fetchRec(abbr, function (d, isSample) { if (layer !== 'rec' || current !== abbr) return; renderRec(abbr, d, isSample); });
  }

  function fetchRec(abbr, cb) {
    var key = 'rec_' + abbr;
    if (CFCACHE[key]) return cb(CFCACHE[key], CFCACHE[key].__sample);
    var settled = false;
    function fallback() { if (settled) return; settled = true; buildRecSample(abbr, function (s) { CFCACHE[key] = s; cb(s, true); }); }
    var timer = setTimeout(fallback, 20000);
    fetch(ENDPOINT + '?action=grantstate&state=' + abbr).then(function (r) { return r.json(); }).then(function (d) {
      if (settled) return;
      if (!d || d.error || !d.grants || !d.grants.length) throw new Error('not built');
      settled = true; clearTimeout(timer); d.__sample = false; CFCACHE[key] = d; cb(d, false);
    }).catch(function () { clearTimeout(timer); fallback(); });
  }

  function buildRecSample(abbr, cb) {
    ensureGeoDeps(function () {
      var st = DATA.states[abbr];
      var latest = st.years[st.years.length - 1];
      var total = Math.round(latest.giving * 0.72);
      var ntee = (st.ntee && st.ntee.length) ? st.ntee : [{ label: 'Human services', pct: 100 }];
      var kinds = ['organization', 'program', 'initiative', 'grantee'];
      var statePop = popOf(abbr) || 1;
      var pool = [];
      if (GEO) {
        (GEO.stateCounties[abbr] || []).forEach(function (fp) {
          var ci = GEO.countyIndex[fp]; if (!ci) return;
          var cTot = total * (ci.pop / statePop);
          var n = Math.max(2, Math.min(8, Math.round(ci.pop / 250000) + 2));
          for (var i = 0; i < n; i++) {
            var hh = hashN(fp + ':' + i);
            var cat = ntee[Math.floor(hh * ntee.length)] || ntee[0];
            var amt = cTot * (0.3 * Math.pow(0.6, i)) * (0.7 + 0.6 * hashN(fp + 'a' + i));
            if (amt < 1000) continue;
            pool.push({ recipient: cat.label + ' ' + kinds[Math.floor(hashN(fp + 'k' + i) * kinds.length)], county: ci.name, fips: fp, ntee: cat.label, amount: Math.round(amt) });
          }
        });
      }
      var mapped = pool.reduce(function (s, g) { return s + g.amount; }, 0);
      var rural = Math.max(0, total - mapped);
      if (rural > 0) pool.push({ recipient: 'Non-metro grantees (aggregate)', county: 'Non-metro counties', fips: null, ntee: 'Various', amount: Math.round(rural), agg: true });
      pool.sort(function (a, b) { return b.amount - a.amount; });
      cb({ state: abbr, grants: pool, total: total, __sample: true });
    });
  }

  function recGrants() { return (recData ? recData.grants : []).filter(function (g) { return !recNtee || g.ntee === recNtee; }); }
  function recByCounty() {
    var by = {};
    recGrants().forEach(function (g) { if (!g.fips) return; var b = by[g.fips] = by[g.fips] || { name: g.county, val: 0, n: 0 }; b.val += g.amount; b.n++; });
    return by;
  }

  function renderRec(abbr, d, isSample) {
    recData = d; recFips = null;
    var res = $('sf-results'); res.style.display = 'block';
    var real = d.grants.filter(function (g) { return !g.agg; });
    var amounts = real.map(function (g) { return g.amount; }).sort(function (a, b) { return a - b; });
    var median = amounts.length ? amounts[Math.floor(amounts.length / 2)] : 0;
    var total = d.total || d.grants.reduce(function (s, g) { return s + g.amount; }, 0);
    var badge = isSample ? srcTag('Demo \u00b7 needs Schedule I ingest', '#E0B48E') : srcTag('Live \u00b7 IRS 990-PF Schedule I', '#9FD3B0', '#6FBF8B');
    var stats = '<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:24px 28px;">'
      + card('Dollars mapped', money(total), 'geocoded to recipient counties')
      + card('Grant records', num(d.countRecords || real.length), isSample ? 'representative records' : 'parsed from Schedule I')
      + card('Recipient counties', num(Object.keys(recByCounty()).length), 'receiving mapped dollars')
      + card('Median grant', money(median), 'across mapped records')
      + '</div>';
    var h = layerToggle();
    h += artifactCard('State Foundation Overview \u00b7 Recipient grants', esc(stName(abbr)), 'Where foundation dollars land in ' + esc(stName(abbr)) + ', each record geocoded through the ZIP\u2192county\u2192CBSA crosswalk', badge, stats);
    h += '<div data-stack style="display:grid; grid-template-columns:1.35fr 1fr; gap:20px; align-items:start; margin-bottom:20px;">';
    h += '<div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:20px 22px;"><div style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#8A857B; margin-bottom:12px;">Dollars received by county</div><div id="sf-reccontrols"></div><div id="sf-recmap" style="min-height:200px;"></div><div style="font-size:11.5px; color:#8A857B; margin-top:10px;">Click a county to filter the records below. Click again to clear.</div></div>';
    h += '<div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:20px 22px;"><div style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#8A857B; margin-bottom:12px;">Top recipient counties</div><div id="sf-recside"></div></div>';
    h += '</div>';
    h += '<div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:20px 22px;"><div id="sf-rectable"></div></div>';
    h += '<div style="font-size:12px; color:#8A857B; margin-top:14px; line-height:1.5; max-width:88ch;">' + (isSample
      ? 'Records shown are representative placeholders sized from state totals; recipient names are generic by design. This layer switches to verified grant rows automatically once the 990-PF Schedule I ingest is deployed to the proxy.'
      : 'Records parsed from 990-PF Schedule I filings and geocoded to the recipient\u2019s county. Amounts are as filed; verify any single organization in the Funder Intelligence Report.') + '</div>';
    $('sf-teaser').innerHTML = h;
    renderRecControls(); renderRecSide(); renderRecTable(); drawRecMap();
    buildGate(stName(abbr), false);
  }

  function renderRecControls() {
    var el = $('sf-reccontrols'); if (!el || !recData) return;
    var h = '<div style="display:flex; flex-wrap:wrap; align-items:baseline; gap:2px 14px; margin-bottom:10px;">' + grpLabel('View')
      + '<button data-rec-mode="dollars" style="' + tabStyle(recMapMode === 'dollars', '#14432F') + '">Dollars received</button>'
      + '<button data-rec-mode="gap" title="Per-resident dollars vs the state average: the giving gap" style="' + tabStyle(recMapMode === 'gap', '#14432F') + '">Giving gap</button></div>';
    var cats = [];
    (recData.grants || []).forEach(function (g) { if (g.ntee && g.ntee !== 'Various' && cats.indexOf(g.ntee) < 0) cats.push(g.ntee); });
    if (cats.length > 1) {
      h += '<div style="display:flex; flex-wrap:wrap; align-items:baseline; gap:2px 12px; margin-bottom:12px;">' + grpLabel('Purpose');
      h += '<button data-rec-ntee="" style="' + tabStyle(!recNtee, '#C98A2B') + '">All</button>';
      cats.slice(0, 8).forEach(function (c) { h += '<button data-rec-ntee="' + esc(c) + '" style="' + tabStyle(recNtee === c, '#C98A2B') + '">' + esc(c) + '</button>'; });
      h += '</div>';
    }
    el.innerHTML = h;
  }

  function renderRecSide() {
    var el = $('sf-recside'); if (!el || !recData) return;
    var by = recByCounty();
    var rows = Object.keys(by).map(function (k) { return { fips: k, name: by[k].name, val: by[k].val, n: by[k].n }; }).sort(function (a, b) { return b.val - a.val; });
    var max = rows.length ? rows[0].val : 1;
    var h = '';
    rows.slice(0, 10).forEach(function (r) {
      var on = recFips === r.fips;
      var pct = Math.round(r.val / max * 100);
      h += '<button data-rec-county="' + r.fips + '" style="display:block; width:100%; text-align:left; border:none; background:' + (on ? '#F5F4F0' : 'none') + '; cursor:pointer; padding:7px 8px; border-radius:3px; margin-bottom:2px; font-family:inherit;">'
        + '<div style="display:flex; justify-content:space-between; gap:8px; font-size:12.5px; margin-bottom:4px;"><span style="color:#17140F; font-weight:' + (on ? '800' : '600') + ';">' + esc(r.name) + '</span><span style="font-family:Archivo,sans-serif; font-weight:700; color:#14432F;">' + money(r.val) + '</span></div>'
        + '<div style="background:#F0EEE7; border-radius:3px; height:6px; overflow:hidden;"><div style="height:100%; width:' + pct + '%; background:' + (on ? '#17140F' : '#C98A2B') + ';"></div></div>'
        + '</button>';
    });
    if (recFips) h += '<button data-rec-county="" style="border:none; background:none; cursor:pointer; font-family:Archivo,sans-serif; font-weight:700; font-size:12px; color:#14432F; padding:8px; border-bottom:2px solid #14432F;">Clear county filter</button>';
    el.innerHTML = h || '<div style="font-size:13px; color:#8A857B;">No county-mapped records.</div>';
  }

  function renderRecTable() {
    var el = $('sf-rectable'); if (!el || !recData) return;
    var by = recByCounty();
    var list = recGrants().filter(function (g) { return !recFips || g.fips === recFips; });
    var shown = list.slice(0, 25);
    var h = '<div style="display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:14px;"><span style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#8A857B;">Grant records' + (recFips && by[recFips] ? ' \u00b7 ' + esc(by[recFips].name) : '') + '</span><span style="font-size:11.5px; color:#8A857B;">showing ' + shown.length + ' of ' + list.length + '</span></div>';
    h += '<div style="display:grid; grid-template-columns:1.7fr 1fr 1fr auto; gap:6px 14px; font-family:Archivo,sans-serif; font-size:10.5px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#8A857B; padding-bottom:8px; border-bottom:1px solid #DDDBD2;"><span>Recipient</span><span>County</span><span>Purpose</span><span style="text-align:right;">Amount</span></div>';
    shown.forEach(function (g) {
      h += '<div style="display:grid; grid-template-columns:1.7fr 1fr 1fr auto; gap:6px 14px; align-items:baseline; padding:10px 0; border-bottom:1px solid #EDEBE4; font-size:13px;">'
        + '<span style="color:#17140F; font-weight:600;">' + esc(g.recipient) + '</span>'
        + '<span style="color:#57534A;">' + esc(g.county || 'n/a') + '</span>'
        + '<span style="color:#57534A;">' + esc(g.ntee || 'n/a') + '</span>'
        + '<span style="text-align:right; font-family:Archivo,sans-serif; font-weight:700; color:#14432F; font-variant-numeric:tabular-nums;">' + money(g.amount) + '</span>'
        + '</div>';
    });
    el.innerHTML = h;
  }

  function drawRecMap() {
    var el = $('sf-recmap'); if (!el || !recData) return;
    if (!(GEO && USTOPO && window.d3 && window.topojson)) {
      el.innerHTML = '<div style="padding:30px 0; color:#57534A; font-size:13px;"><span style="display:inline-block;width:14px;height:14px;border:2px solid #EDEBE4;border-top-color:#C98A2B;border-radius:50%;animation:sfspin .8s linear infinite;vertical-align:-3px;margin-right:8px;"></span>Loading county geometry…</div>';
      ensureGeoDeps(function (err) { var e2 = $('sf-recmap'); if (!e2) return; if (err) { e2.innerHTML = '<div style="color:#8A857B; font-size:13px; padding:20px 0;">County geometry could not load in this environment; it renders on the deployed site.</div>'; return; } drawRecMap(); });
      return;
    }
    var abbr = recData.state, f2 = fips2(abbr);
    var feats = geoFeatures().counties.filter(function (f) { return pad5(f.id).slice(0, 2) === f2; });
    if (!feats.length) { el.innerHTML = '<div style="color:#8A857B; font-size:13px;">No geometry available.</div>'; return; }
    var W = 560, H = 400;
    var proj = makeProj(feats, W, H);
    var by = recByCounty();
    var max = 1; Object.keys(by).forEach(function (k) { if (by[k].val > max) max = by[k].val; });
    var isGap = recMapMode === 'gap';
    var statePopR = popOf(abbr) || 1;
    var mappedTotal = 0; Object.keys(by).forEach(function (k) { mappedTotal += by[k].val; });
    var mappedPop = 0; Object.keys(by).forEach(function (k) { var ci2 = GEO.countyIndex[k]; if (ci2) mappedPop += ci2.pop; });
    var avgPerRes = mappedPop ? mappedTotal / mappedPop : 0;
    function gapColor(r) { // r = county per-res / avg per-res; diverging: under -> terracotta, over -> green
      if (!isFinite(r)) return '#EFEBE1';
      var t2 = Math.max(-1, Math.min(1, (r - 1)));
      if (t2 < 0) { var k2 = -t2; return 'rgb(' + Math.round(245 - k2 * (245 - 176)) + ',' + Math.round(244 - k2 * (244 - 74)) + ',' + Math.round(240 - k2 * (240 - 60)) + ')'; }
      return 'rgb(' + Math.round(245 - t2 * (245 - 20)) + ',' + Math.round(244 - t2 * (244 - 67)) + ',' + Math.round(240 - t2 * (240 - 47)) + ')';
    }
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%; height:auto; display:block;">';
    feats.forEach(function (f) {
      var fips = pad5(f.id), dd = proj.path(f); if (!dd) return;
      var b = by[fips];
      var on = recFips === fips;
      var fill, t;
      if (isGap && b) {
        var ci3 = GEO.countyIndex[fips];
        var perRes = ci3 && ci3.pop ? b.val / ci3.pop : 0;
        var ratio = avgPerRes ? perRes / avgPerRes : 0;
        fill = gapColor(ratio);
        var pctDiff = Math.round((ratio - 1) * 100);
        t = esc(b.name) + ': ' + money(perRes) + ' per resident, ' + (pctDiff >= 0 ? '+' : '') + pctDiff + '% vs state average';
      } else {
        fill = b ? ramp(b.val / max) : '#EFEBE1';
        t = b ? (esc(b.name) + ': ' + money(b.val) + ' across ' + b.n + ' grants') : 'no mapped recipients';
      }
      svg += '<path ' + (b ? 'data-rec-county="' + fips + '" ' : '') + 'd="' + dd + '" fill="' + fill + '" stroke="' + (on ? '#17140F' : '#F5F4F0') + '" stroke-width="' + (on ? 1.4 : 0.6) + '" style="cursor:' + (b ? 'pointer' : 'default') + ';"><title>' + t + '</title></path>';
    });
    svg += '</svg>';
    var legend2;
    if (isGap) {
      legend2 = '<div style="display:flex; align-items:center; gap:8px; margin-top:10px; flex-wrap:wrap;"><span style="font-family:Archivo,sans-serif; font-weight:700; font-size:12px; color:#B04A3C;">under-funded</span><span style="display:inline-block; width:140px; height:10px; border-radius:3px; background:linear-gradient(90deg,' + gapColor(0) + ',' + gapColor(1) + ',' + gapColor(2) + ');"></span><span style="font-family:Archivo,sans-serif; font-weight:700; font-size:12px; color:#14432F;">over-funded</span><span style="font-size:11.5px; color:#8A857B; margin-left:auto;">state avg ' + money(avgPerRes) + ' per resident' + (recNtee ? ' \u00b7 ' + esc(recNtee) : '') + '</span></div>';
    } else {
      legend2 = '<div style="display:flex; align-items:center; gap:8px; margin-top:10px; flex-wrap:wrap;"><span style="font-family:Archivo,sans-serif; font-weight:700; font-size:12px; color:#57534A;">$0</span><span style="display:inline-block; width:140px; height:10px; border-radius:3px; background:linear-gradient(90deg,' + ramp(0) + ',' + ramp(.25) + ',' + ramp(.5) + ',' + ramp(.75) + ',' + ramp(1) + ');"></span><span style="font-family:Archivo,sans-serif; font-weight:700; font-size:12px; color:#57534A; font-variant-numeric:tabular-nums;">' + money(max) + '</span><span style="font-size:11.5px; color:#8A857B; margin-left:auto;">' + money(mappedTotal) + ' mapped' + (recNtee ? ' \u00b7 ' + esc(recNtee) : ' statewide') + '</span></div>';
    }
    el.innerHTML = svg + legend2;
  }

  // ---------- COMMUNITY FOUNDATION LAYER (LIVE) ----------
  function runCF(abbr) {
    var res = $('sf-results'); res.style.display = 'block';
    $('sf-teaser').innerHTML = layerToggle() + '<div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:40px; text-align:center; color:#57534A;"><span style="display:inline-block;width:16px;height:16px;border:2px solid #EDEBE4;border-top-color:#C98A2B;border-radius:50%;animation:sfspin .8s linear infinite;vertical-align:-3px;margin-right:8px;"></span>Pulling live IRS 990 filings for ' + esc(stName(abbr)) + ' community foundations…</div>';
    try { var y = res.getBoundingClientRect().top + window.scrollY - 120; window.scrollTo({ top: y, behavior: 'smooth' }); } catch (e) {}
    fetchCF(abbr, function (d, isSample) {
      if (layer !== 'cf' || current !== abbr) return; // stale response: user changed layer/state
      compare = [{ abbr: abbr, name: stName(abbr), color: PALETTE[0], years: d.years, cf: true }];
      renderBody(d, true, isSample);
    });
  }

  function fetchCF(abbr, cb) {
    if (CFCACHE[abbr]) return cb(CFCACHE[abbr], CFCACHE[abbr].__sample);
    var settled = false;
    var timer = setTimeout(function () { if (!settled) { settled = true; var s = cfSample(abbr); CFCACHE[abbr] = s; cb(s, true); } }, 45000);
    fetch(ENDPOINT + '?action=cfstate&state=' + abbr).then(function (r) { return r.json(); }).then(function (d) {
      if (settled) return;
      if (!d || d.error || !d.years || !d.years.length) throw new Error('empty');
      d.years = trimIncomplete(d.years);
      settled = true; clearTimeout(timer); d.__sample = false; CFCACHE[abbr] = d; cb(d, false);
    }).catch(function () { if (settled) return; settled = true; clearTimeout(timer); var s = cfSample(abbr); CFCACHE[abbr] = s; cb(s, true); });
  }

  // 990 data lags: the most recent filing year(s) are incomplete because most
  // organizations have not filed yet, which shows up as a sharp cliff in the
  // foundation count. Drop trailing years whose count falls below 55% of the
  // prior year so a half-reported year is never presented as a real decline.
  function trimIncomplete(years) {
    var y = (years || []).slice().sort(function (a, b) { return a.y - b.y; });
    while (y.length >= 2) {
      var last = y[y.length - 1], prev = y[y.length - 2];
      if ((last.count || 0) < 0.55 * (prev.count || 0)) y.pop();
      else break;
    }
    return y;
  }

  // Labeled demo used only when the live proxy is unreachable (e.g. before the
  // Apps Script is redeployed, or inside the design preview sandbox).
  function cfSample(abbr) {
    var base = DATA.states[abbr] ? DATA.states[abbr].years : [];
    var years = base.map(function (yr) {
      var cnt = Math.max(3, Math.round(yr.count * 0.012));
      var giving = Math.round(yr.giving * 0.11);
      var assets = Math.round(yr.assets * 0.13);
      return { y: yr.y, count: cnt, giving: giving, assets: assets, avgPer: Math.round(giving / cnt) };
    });
    return { state: abbr, basis: 'sample', years: years, notable: (DATA.states[abbr] ? DATA.states[abbr].notable : []).slice(0, 6), __sample: true };
  }

  // ---------- SHARED RENDER ----------
  var selYear = null, lastBodyD = null, lastBodyCF = false, lastBodySample = false;
  function yearTable(years, selY) {
    var h = '<div style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#8A857B; margin-bottom:12px;">Year by year</div>';
    h += '<div style="display:grid; grid-template-columns:auto 1fr 1fr auto; gap:4px 14px; font-family:Archivo,sans-serif; font-size:10.5px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#8A857B; padding-bottom:7px; border-bottom:1px solid #DDDBD2;"><span>Year</span><span style="text-align:right;">Giving</span><span style="text-align:right;">Assets</span><span style="text-align:right;">YoY</span></div>';
    for (var i = years.length - 1; i >= 0; i--) {
      var yr = years[i], pv = years[i - 1];
      var on = yr.y === selY;
      var dl = '';
      if (pv && pv.giving) { var p = (yr.giving - pv.giving) / pv.giving * 100; dl = '<span style="font-weight:700; color:' + (p >= 0 ? '#3F7A55' : '#B04A3C') + ';">' + (p >= 0 ? '\u25b2' : '\u25bc') + Math.abs(p).toFixed(1) + '%</span>'; }
      h += '<button data-sf-year="' + yr.y + '" style="display:grid; grid-template-columns:auto 1fr 1fr auto; gap:4px 14px; align-items:baseline; width:100%; text-align:left; border:none; border-bottom:1px solid #EDEBE4; background:' + (on ? '#F5F4F0' : 'none') + '; cursor:pointer; padding:8px 4px; font-family:inherit; font-size:12.5px;">'
        + '<span style="font-family:Archivo,sans-serif; font-weight:' + (on ? '800' : '700') + '; color:#17140F;">' + yr.y + '</span>'
        + '<span style="text-align:right; font-family:Archivo,sans-serif; font-weight:600; color:#14432F; font-variant-numeric:tabular-nums;">' + money(yr.giving) + '</span>'
        + '<span style="text-align:right; color:#57534A; font-variant-numeric:tabular-nums;">' + money(yr.assets) + '</span>'
        + '<span style="text-align:right; font-size:11.5px; font-variant-numeric:tabular-nums;">' + dl + '</span>'
        + '</button>';
    }
    h += '<div style="font-size:11.5px; color:#8A857B; margin-top:10px;">Click a year to load its figures above.</div>';
    return h;
  }

  function renderBody(d, isCF, isSample) {
    lastBodyD = d; lastBodyCF = isCF; lastBodySample = isSample;
    var res = $('sf-results'); res.style.display = 'block';
    var years = d.years || [];
    var idx = years.length - 1;
    if (selYear != null) for (var yi = 0; yi < years.length; yi++) if (years[yi].y === selYear) idx = yi;
    var latest = years[idx] || {};
    var prev = years[idx - 1] || null;
    function delta(a, b) { if (b == null) return '<span style="font-size:12px; color:#8A857B;">earliest year on record</span>'; if (!b) return ''; var p = (a - b) / b * 100; var up = p >= 0; return '<span style="font-size:12px; font-weight:700; color:' + (up ? '#3F7A55' : '#B04A3C') + ';">' + (up ? '▲ ' : '▼ ') + Math.abs(p).toFixed(1) + '%</span>'; }

    var badge = isCF
      ? (isSample ? srcTag('Demo · deploy proxy for live data', '#E0B48E') : srcTag('Live · IRS 990', '#9FD3B0', '#6FBF8B'))
      : srcTag('Representative estimates', '#E0B48E');

    var abbr = isCF ? d.state : d.abbr;
    var range = years.length ? years[0].y + '-' + years[years.length - 1].y : '';
    var sub = isCF
      ? (d.total || latest.count || 0) + ' community foundations \u00b7 ' + (d.source || 'IRS Form 990') + ' \u00b7 ' + range
      : num(latest.count) + ' grantmaking foundations \u00b7 ' + range;

    var h = '';
    h += layerToggle();
    var P = popOf(abbr);
    var pc = perCapita && P;
    var ytabs = '';
    if (years.length > 1) {
      ytabs = '<div style="display:flex; flex-wrap:wrap; align-items:baseline; gap:2px 13px; margin-bottom:22px; border-bottom:1px solid #EDEBE4; padding-bottom:10px;">' + grpLabel('Year');
      years.forEach(function (yy) { ytabs += '<button data-sf-year="' + yy.y + '" style="' + tabStyle(yy.y === latest.y, '#C98A2B') + '">' + yy.y + '</button>'; });
      ytabs += '</div>';
    }
    var stats = ytabs + '<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:24px 28px;">'
      + card('Foundations', pc ? (Math.round(latest.count / P * 100000 * 10) / 10) + ' /100k' : num(latest.count), delta(latest.count, prev ? prev.count : null) + (prev && prev.y !== latest.y ? ' vs ' + prev.y : ''))
      + card('Total giving', pc ? money(latest.giving / P) + ' /res' : money(latest.giving), delta(latest.giving, prev ? prev.giving : null) + (prev && prev.y !== latest.y ? ' vs ' + prev.y : ''))
      + card('Total assets', pc ? money(latest.assets / P) + ' /res' : money(latest.assets), delta(latest.assets, prev ? prev.assets : null) + (prev && prev.y !== latest.y ? ' vs ' + prev.y : ''))
      + (isCF ? card('Avg per foundation', money(latest.avgPer), 'giving, ' + (latest.y || '')) : card('Avg grant size', money(latest.avgGrant), 'across the state, ' + (latest.y || '')))
      + '</div>';
    h += artifactCard('State Foundation Overview \u00b7 ' + (isCF ? 'Community foundations' : 'Foundation landscape'), esc(stName(abbr)), esc(sub), badge, stats);

    h += '<div data-yearsgrid data-stack style="display:grid; grid-template-columns:1.35fr 1fr; gap:20px; align-items:start;"><div id="sf-chart"></div><div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:20px 22px;">' + yearTable(years, latest.y) + '</div></div>';
    h += '<div id="sf-geo" style="margin-top:26px;"></div>';

    if (!isCF) {
      var totalGiving = latest.giving || 0;
      h += '<div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:22px 24px; margin-bottom:16px;">';
      h += '<div style="display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:16px;"><span style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#8A857B;">Allocation by program area (' + (latest.y || '') + ')</span><span style="font-size:11.5px; color:#8A857B;">' + money(totalGiving) + ' total</span></div>';
      (d.ntee || []).forEach(function (n) {
        var dollars = totalGiving * n.pct / 100;
        h += '<div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;"><div style="width:160px; font-size:13px; color:#17140F; flex:none;">' + esc(n.label) + '</div><div style="flex:1; background:#F0EEE7; border-radius:3px; height:16px; overflow:hidden;"><div style="height:100%; width:' + n.pct + '%; background:#C98A2B;"></div></div><div style="width:70px; text-align:right; font-family:Archivo,sans-serif; font-weight:700; font-size:13px; color:#14432F; flex:none;">' + money(dollars) + '</div><div style="width:38px; text-align:right; font-size:12px; color:#8A857B; flex:none;">' + n.pct + '%</div></div>';
      });
      h += '<div style="font-size:12px; color:#8A857B; margin-top:12px; line-height:1.5;">Allocation is estimated by the foundation\u2019s own NTEE classification, not by grant recipient. Recipient-level purpose needs grant detail (990-PF Schedule I), coming with the bulk dataset.</div>';
      h += '</div>';
    }

    var notable = d.notable || [];
    if (notable.length) {
      h += '<div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:22px 24px; margin-bottom:4px;">';
      h += '<div style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#8A857B; margin-bottom:14px;">' + (isCF ? 'Community foundations in this state' : 'Notable foundations headquartered here') + '</div>';
      h += '<div style="display:flex; flex-wrap:wrap; gap:8px;">';
      notable.forEach(function (f) {
        var chip = '<strong style="font-weight:700;">' + esc(f.name) + '</strong>' + (f.city ? ' <span style="color:#8A857B;">\u00b7 ' + esc(f.city) + '</span>' : '');
        if (f.ein) h += '<a href="funder-report.html" style="text-decoration:none; font-size:13.5px; color:#17140F; background:#F5F4F0; border:1px solid #DDDBD2; border-radius:4px; padding:8px 13px;">' + chip + '</a>';
        else h += '<span style="font-size:13.5px; color:#17140F; background:#F5F4F0; border:1px solid #DDDBD2; border-radius:4px; padding:8px 13px;">' + chip + '</span>';
      });
      h += '</div><div style="font-size:12px; color:#8A857B; margin-top:12px;">' + (isCF ? 'Pulled live from IRS 990 filings. Open the Funder Intelligence Report to see any one\u2019s full financials.' : 'Names are real, publicly-known organizations. Look any up in the Funder Intelligence Report for verified 990 figures.') + '</div></div>';
    }

    $('sf-teaser').innerHTML = h;
    renderChart();
    renderGeo(abbr);
    buildGate(stName(abbr), isCF);
  }

  function layerToggle() {
    function seg(id, label, on) { return '<button data-sf-layer="' + id + '" style="' + tabStyle(on) + '">' + label + '</button>'; }
    var pc = '<button data-sf-pc="1" title="Show figures per resident" style="' + tabStyle(perCapita, '#14432F') + '">Per capita ' + (perCapita ? 'on' : 'off') + '</button>';
    return '<div style="display:flex; flex-wrap:wrap; align-items:baseline; gap:2px 18px; margin-bottom:26px; border-bottom:1px solid #DDDBD2; padding-bottom:12px;">' + grpLabel('Data layer') + seg('pf', 'All private foundations', layer === 'pf') + seg('cf', 'Community foundations', layer === 'cf') + seg('estimate', 'All foundations estimate', layer === 'estimate') + seg('rec', 'Recipient grants', layer === 'rec') + '<span style="flex:1;"></span>' + pc + '<button data-sf-share="1" title="Copy a direct link to this view" style="' + tabStyle(false, '#14432F') + '">Copy link</button><button data-sf-print="1" title="Print or save this state as a PDF one-pager" style="' + tabStyle(false, '#14432F') + '">Print / PDF</button></div>';
  }

  function card(label, val, sub) {
    return '<div style="border-top:2px solid #17140F; padding-top:14px;"><div style="font-family:Archivo,sans-serif; font-weight:800; font-size:30px; letter-spacing:-.02em; line-height:1; color:#17140F; font-variant-numeric:tabular-nums;">' + val + '</div><div style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; font-weight:700; color:#14432F; margin:10px 0 4px;">' + label + '</div><div style="font-size:12px; color:#8A857B;">' + sub + '</div></div>';
  }

  function addToCompare(abbr) {
    if (layer === 'cf') {
      var msgEl = $('sf-cmpmsg'); if (msgEl) msgEl.textContent = 'Loading ' + stName(abbr) + '…';
      fetchCF(abbr, function (d) {
        compare.push({ abbr: abbr, name: stName(abbr), color: PALETTE[compare.length % PALETTE.length], years: d.years, cf: true });
        renderChart();
      });
    } else {
      compare.push({ abbr: abbr, name: DATA.states[abbr].name, color: PALETTE[compare.length % PALETTE.length], years: DATA.states[abbr].years });
      renderChart();
    }
  }

  function renderChart() {
    var box = $('sf-chart'); if (!box) return;
    var W = 760, H = 300, padL = 62, padR = 18, padT = 18, padB = 34;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var axis = [];
    compare.forEach(function (c) { (c.years || []).forEach(function (yr) { if (axis.indexOf(yr.y) < 0) axis.push(yr.y); }); });
    axis.sort(function (a, b) { return a - b; });
    var maxV = 1;
    compare.forEach(function (c) { (c.years || []).forEach(function (yr) { var v = valAdj(yr, c.abbr); if (v > maxV) maxV = v; }); });
    function xFor(y) { return axis.length <= 1 ? padL + plotW / 2 : padL + (axis.indexOf(y) / (axis.length - 1)) * plotW; }
    function yFor(v) { return padT + plotH - (v / maxV) * plotH; }

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%; height:auto; display:block;" font-family="Archivo, sans-serif">';
    for (var g = 0; g <= 4; g++) {
      var gv = maxV * g / 4, gy = yFor(gv);
      svg += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="#EDEBE4" stroke-width="1"/>';
      svg += '<text x="' + (padL - 8) + '" y="' + (gy + 3) + '" text-anchor="end" font-size="10" fill="#8A857B">' + fmtMetric(gv) + '</text>';
    }
    axis.forEach(function (y) { svg += '<text x="' + xFor(y) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="10" fill="#8A857B">' + y + '</text>'; });
    compare.forEach(function (c) {
      var pts = (c.years || []).map(function (yr) { return { x: xFor(yr.y), y: yFor(valAdj(yr, c.abbr)) }; });
      if (pts.length > 1) svg += '<polyline points="' + pts.map(function (p) { return p.x + ',' + p.y; }).join(' ') + '" fill="none" stroke="' + c.color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
      pts.forEach(function (p) { svg += '<circle cx="' + p.x + '" cy="' + p.y + '" r="3.5" fill="' + c.color + '"/>'; });
    });
    svg += '</svg>';

    var toggle = '<div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px; align-items:baseline;">';
    metricSet().forEach(function (m) { var on = m[0] === metric; toggle += '<button data-sf-metric="' + m[0] + '" style="' + tabStyle(on) + ' margin-right:16px;">' + m[1] + '</button>'; });
    toggle += '<span style="flex:1;"></span><button data-sf-real="1" title="Adjust dollar figures to 2023 purchasing power (CPI-U)" style="' + tabStyle(realDollars, '#14432F') + '">2023 dollars ' + (realDollars ? 'on' : 'off') + '</button>';
    toggle += '</div>';

    var legend = '<div style="display:flex; flex-wrap:wrap; gap:8px 14px; margin-top:14px;">';
    compare.forEach(function (c, i) { legend += '<span style="display:inline-flex; align-items:center; gap:7px; font-size:13px; color:#17140F; background:#F5F4F0; border:1px solid #DDDBD2; border-radius:4px; padding:5px 10px;"><span style="width:11px; height:11px; border-radius:2px; background:' + c.color + '; flex:none;"></span>' + esc(c.name) + (i > 0 ? ' <button data-sf-rm="' + i + '" title="Remove" style="border:none; background:none; cursor:pointer; color:#8A857B; font-size:15px; line-height:1; padding:0 0 0 4px;">&times;</button>' : '') + '</span>'; });
    legend += '</div>';

    var adder = '';
    if (compare.length < 5) {
      var keys = Object.keys(DATA.states).sort(function (a, b) { return DATA.states[a].name.localeCompare(DATA.states[b].name); });
      var opts = keys.filter(function (k) { return !compare.some(function (c) { return c.abbr === k; }); }).map(function (k) { return '<option value="' + k + '">' + esc(DATA.states[k].name) + '</option>'; }).join('');
      adder = '<form id="sf-addform" style="display:flex; gap:8px; flex-wrap:wrap; margin-top:16px; max-width:460px;"><select id="sf-add" style="flex:1; min-width:200px; font-family:inherit; font-size:14px; padding:10px 12px; border:1.5px solid #DDDBD2; border-radius:4px; background:#fff;"><option value="">Add a state to compare…</option>' + opts + '</select><button type="submit" style="font-family:inherit; font-weight:700; font-size:14px; color:#17140F; background:#C98A2B; border:none; border-radius:4px; padding:10px 18px; cursor:pointer;">Add</button></form><div id="sf-cmpmsg" style="font-size:12.5px; color:#8A857B; margin-top:8px; min-height:14px;"></div>';
    } else {
      adder = '<div style="font-size:12.5px; color:#8A857B; margin-top:14px;">Comparing the maximum of 5 states. Remove one to add another.</div>';
    }

    box.innerHTML = '<div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:22px 24px; margin-bottom:26px;"><div style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#8A857B; margin-bottom:16px;">' + metricLabel() + ' over time' + (realDollars && metric !== 'count' ? ' \u00b7 inflation-adjusted (2023 dollars)' : '') + '</div>' + toggle + svg + legend + adder + '</div>';
  }

  function buildGate(name, isCF) {
    var done = false; try { done = localStorage.getItem('nc_states_unlock') === '1'; } catch (e) {}
    var gate = $('sf-gate');
    if (done) { gate.innerHTML = ''; return; }
    gate.innerHTML = '<div style="background:#EEF3E9; border:1px solid #DDDBD2; border-radius:4px; padding:24px 26px;"><div style="font-family:Archivo,sans-serif; font-weight:700; font-size:20px; margin-bottom:6px;">See every state, and compare</div><div style="font-size:14px; line-height:1.55; color:#57534A; margin-bottom:16px; max-width:60ch;">Enter your email to unlock the full multi-year dashboard: live community-foundation data, metric toggles, and up to five states side by side.</div><form id="sf-gateform" style="display:flex; gap:10px; flex-wrap:wrap;"><input id="sf-email" type="email" required placeholder="you@org.com" style="flex:1; min-width:220px; font-family:inherit; font-size:15px; padding:13px 15px; border:1.5px solid #DDDBD2; border-radius:4px; background:#fff;"><button type="submit" style="font-family:inherit; font-weight:700; font-size:15px; color:#fff; background:#14432F; border:none; border-radius:4px; padding:13px 22px; cursor:pointer;">Unlock dashboard</button></form></div>';
    var chart = $('sf-chart');
    var el = chart ? (chart.closest('[data-yearsgrid]') || chart) : null; while (el) { el.style.filter = 'blur(6px)'; el.style.pointerEvents = 'none'; el = el.nextElementSibling; }
    setTimeout(function () {
      var gf = $('sf-gateform'); if (!gf) return;
      gf.addEventListener('submit', function (e) {
        e.preventDefault();
        var em = $('sf-email').value.trim();
        if (em.indexOf('@') < 1) { $('sf-email').style.borderColor = '#B04A3C'; return; }
        try {
          var trail = '';
          try { trail = (JSON.parse(sessionStorage.getItem('nc_sf_trail') || '[]')).join(', '); } catch (e3) {}
          var body = new URLSearchParams({ name: '', email: em, organization: '', message: 'State Foundation Overview unlock: ' + name + ' (' + (isCF ? 'community foundations' : 'all foundations') + ')' + (trail ? ' \u00b7 explored: ' + trail : ''), submittedAt: new Date().toISOString(), source: 'State Foundation Overview' });
          fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
        } catch (err) {}
        try { localStorage.setItem('nc_states_unlock', '1'); } catch (e2) {}
        gate.innerHTML = '';
        var x = $('sf-chart'); if (x) x = x.closest('[data-yearsgrid]') || x; while (x) { x.style.filter = ''; x.style.pointerEvents = ''; x = x.nextElementSibling; }
      });
    }, 30);
  }

  // ---------- GEOGRAPHIC DEPTH (county / CBSA / metro-vs-rural) ----------
  var GEO = null, USTOPO = null, GEOFEAT = null, geoTab = 'county', geoMetric = 'count', geoAbbr = null;
  function pad5(x) { x = String(x); while (x.length < 5) x = '0' + x; return x; }
  function fips2(abbr) { for (var k in GEO.stateFips) if (GEO.stateFips[k] === abbr) return k; return null; }
  function geoMetricLabel() { return geoMetric === 'count' ? 'Foundations' : geoMetric === 'assets' ? 'Assets' : 'Giving'; }
  function geoFeatures() { if (GEOFEAT) return GEOFEAT; GEOFEAT = { counties: topojson.feature(USTOPO, USTOPO.objects.counties).features, mesh: topojson.mesh(USTOPO, USTOPO.objects.states, function (a, b) { return a !== b; }) }; return GEOFEAT; }
  function makeProj(feats, W, H) { var pr = d3.geoAlbersUsa().fitExtent([[8, 8], [W - 8, H - 8]], { type: 'FeatureCollection', features: feats }); return { pr: pr, path: d3.geoPath(pr) }; }
  function geoFmt(v, pop) { if (geoMetric === 'count') { if (perCapita && pop) return (Math.round(v / pop * 100000 * 10) / 10).toLocaleString() + ' /100k'; return num(v); } if (perCapita && pop) return money(v / pop) + ' /res'; return money(v); }
  function countyVal(fips, base, statePop) { var ci = GEO.countyIndex[fips]; if (!ci) return null; var share = ci.pop / statePop; return { name: ci.name, pop: ci.pop, cbsa: ci.cbsa, share: share, count: base.count * share, assets: base.assets * share, giving: base.giving * share }; }
  function mergeCbsa(memberFips) { var geoms = USTOPO.objects.counties.geometries.filter(function (g) { return memberFips.indexOf(pad5(g.id)) >= 0; }); if (!geoms.length) return null; try { return topojson.merge(USTOPO, geoms); } catch (e) { return null; } }
  function geoLegend(max) { var isC = geoMetric === 'count'; var hi = max == null ? 'Higher' : (isC ? num(max) : money(max)); return '<div style="display:flex; align-items:center; gap:10px; margin-top:12px; flex-wrap:wrap;"><span style="font-family:Archivo,sans-serif; font-weight:700; font-size:12px; color:#57534A;">' + (isC ? '0' : '$0') + '</span><span style="display:inline-block; width:170px; height:11px; border-radius:3px; background:linear-gradient(90deg,' + ramp(0) + ',' + ramp(.25) + ',' + ramp(.5) + ',' + ramp(.75) + ',' + ramp(1) + ');"></span><span style="font-family:Archivo,sans-serif; font-weight:700; font-size:12px; color:#57534A; font-variant-numeric:tabular-nums;">' + hi + '</span><span style="font-size:11.5px; color:#8A857B;">' + geoMetricLabel().toLowerCase() + '</span></div>'; }
  function geoCard(svg, aside, max) { return '<div data-stack style="display:grid; grid-template-columns:1.35fr 1fr; gap:20px; align-items:start; background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:20px 22px;"><div>' + svg + geoLegend(max) + '</div><div>' + aside + '</div></div>'; }

  function geoCounty(abbr, base, statePop) {
    var W = 560, H = 430, f2 = fips2(abbr);
    var feats = geoFeatures().counties.filter(function (f) { return pad5(f.id).slice(0, 2) === f2; });
    if (!feats.length) return '<div style="color:#8A857B; font-size:13px;">No county geometry available for this state.</div>';
    var proj = makeProj(feats, W, H);
    var covered = [], max = 1;
    feats.forEach(function (f) { var cv = countyVal(pad5(f.id), base, statePop); if (cv) { covered.push(cv); if (cv[geoMetric] > max) max = cv[geoMetric]; } });
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%; height:auto; display:block; overflow:hidden;">';
    feats.forEach(function (f) { var fips = pad5(f.id), d = proj.path(f); if (!d) return; var cv = countyVal(fips, base, statePop); var fill = cv ? ramp(cv[geoMetric] / max) : '#E7E3D8'; var t = cv ? (esc(cv.name) + ' · ' + geoFmt(cv[geoMetric], cv.pop)) : 'non-metro county'; svg += '<path d="' + d + '" fill="' + fill + '" stroke="#F5F4F0" stroke-width="0.6"><title>' + t + '</title></path>'; });
    svg += '</svg>';
    covered.sort(function (a, b) { return b[geoMetric] - a[geoMetric]; });
    var aside = '<div style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#8A857B; margin-bottom:12px;">Top counties · ' + geoMetricLabel() + '</div>';
    covered.slice(0, 10).forEach(function (cv) { var pct = Math.round(cv[geoMetric] / max * 100); aside += '<div style="margin-bottom:9px;"><div style="display:flex; justify-content:space-between; gap:8px; font-size:12.5px; margin-bottom:3px;"><span style="color:#17140F; font-weight:600;">' + esc(cv.name) + '</span><span style="font-family:Archivo,sans-serif; font-weight:700; color:#14432F;">' + geoFmt(cv[geoMetric], cv.pop) + '</span></div><div style="background:#F0EEE7; border-radius:3px; height:7px; overflow:hidden;"><div style="height:100%; width:' + pct + '%; background:' + ramp(cv[geoMetric] / max) + ';"></div></div></div>'; });
    var total = (GEO.stateCounties[abbr] || []).length;
    var cpop = covered.reduce(function (s, c) { return s + c.pop; }, 0);
    var rpop = Math.max(0, statePop - cpop), rshare = rpop / statePop, rval = base[geoMetric] * rshare;
    aside += '<div style="margin-top:14px; padding-top:12px; border-top:1px dashed #DDDBD2; display:flex; justify-content:space-between; gap:8px; font-size:12.5px;"><span style="color:#57534A;">Non-metro balance (' + Math.max(0, total - covered.length) + ' counties)</span><span style="font-family:Archivo,sans-serif; font-weight:700; color:#8A857B;">' + geoFmt(rval, rpop) + '</span></div>';
    return geoCard(svg, aside, max);
  }

  function geoCbsa(abbr, base, statePop) {
    var W = 560, H = 430, f2 = fips2(abbr);
    var feats = geoFeatures().counties.filter(function (f) { return pad5(f.id).slice(0, 2) === f2; });
    if (!feats.length) return '<div style="color:#8A857B; font-size:13px;">No geometry available.</div>';
    var proj = makeProj(feats, W, H);
    var list = GEO.cbsas.filter(function (c) { return c.states.indexOf(abbr) >= 0; }).map(function (c) {
      var inState = c.counties.filter(function (fp) { return GEO.countyIndex[fp] && GEO.countyIndex[fp].st === abbr; });
      var inPop = inState.reduce(function (s, fp) { return s + GEO.countyIndex[fp].pop; }, 0);
      var share = inPop / statePop;
      return { name: c.name, pop: c.pop, inPop: inPop, multi: c.states.length > 1, counties: c.counties, count: base.count * share, assets: base.assets * share, giving: base.giving * share };
    });
    var max = list.reduce(function (m, c) { return Math.max(m, c[geoMetric]); }, 1);
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%; height:auto; display:block; overflow:hidden;">';
    feats.forEach(function (f) { var d = proj.path(f); if (d) svg += '<path d="' + d + '" fill="#EFEBE1" stroke="#F5F4F0" stroke-width="0.5"></path>'; });
    list.forEach(function (c) { var merged = mergeCbsa(c.counties); if (!merged) return; var d = proj.path(merged); if (!d) return; svg += '<path d="' + d + '" fill="' + ramp(c[geoMetric] / max) + '" fill-opacity="0.92" stroke="#17140F" stroke-width="0.7"><title>' + esc(c.name) + ' · ' + geoFmt(c[geoMetric], c.inPop) + (c.multi ? ' (in-state portion)' : '') + '</title></path>'; });
    svg += '</svg>';
    var sorted = list.slice().sort(function (a, b) { return b[geoMetric] - a[geoMetric]; });
    var aside = '<div style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#8A857B; margin-bottom:12px;">Metros · ' + geoMetricLabel() + '</div>';
    if (!sorted.length) aside += '<div style="font-size:13px; color:#8A857B;">No CBSA in the crosswalk for this state yet.</div>';
    sorted.forEach(function (c) { var pct = Math.round(c[geoMetric] / max * 100); var short = esc(c.name.split(',')[0]); aside += '<div style="margin-bottom:9px;"><div style="display:flex; justify-content:space-between; gap:8px; font-size:12.5px; margin-bottom:3px;"><span style="color:#17140F; font-weight:600;">' + short + (c.multi ? ' <span style="color:#8A857B; font-weight:400; font-size:11px;">multi-state</span>' : '') + '</span><span style="font-family:Archivo,sans-serif; font-weight:700; color:#14432F;">' + geoFmt(c[geoMetric], c.inPop) + '</span></div><div style="background:#F0EEE7; border-radius:3px; height:7px; overflow:hidden;"><div style="height:100%; width:' + pct + '%; background:' + ramp(c[geoMetric] / max) + ';"></div></div></div>'; });
    return geoCard(svg, aside, max);
  }

  function geoSplit(abbr, base, statePop) {
    var covered = [];
    (GEO.stateCounties[abbr] || []).forEach(function (fp) { var ci = GEO.countyIndex[fp]; if (ci) covered.push(ci); });
    var metroPop = Math.min(statePop, covered.reduce(function (s, c) { return s + c.pop; }, 0));
    var mShare = metroPop / statePop, rShare = 1 - mShare;
    var metro = { pop: metroPop, count: base.count * mShare, assets: base.assets * mShare, giving: base.giving * mShare };
    var rural = { pop: statePop - metroPop, count: base.count * rShare, assets: base.assets * rShare, giving: base.giving * rShare };
    function bigCard(title, sub, obj, accent, shareN) { return '<div style="background:#17140F; color:#F5F4F0; border-radius:4px; padding:22px 24px;"><div style="font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:' + accent + '; margin-bottom:10px;">' + title + '</div><div style="font-family:Archivo,sans-serif; font-weight:800; font-size:30px; letter-spacing:-.02em; line-height:1;">' + geoFmt(obj[geoMetric], obj.pop) + '</div><div style="font-size:12px; color:rgba(245,244,240,.62); margin-top:8px;">' + sub + ' · ' + num(obj.pop) + ' residents · ' + Math.round(shareN * 100) + '% of population</div></div>'; }
    var cards = '<div data-stack style="display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:16px;">' + bigCard('Metro (CBSA)', 'In ' + covered.length + ' metro counties', metro, '#C98A2B', mShare) + bigCard('Non-metro / rural', 'Balance of the state', rural, '#7FA88C', rShare) + '</div>';
    var mv = metro[geoMetric], rv = rural[geoMetric], tot = mv + rv || 1, mp = Math.round(mv / tot * 100);
    var bar = '<div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:18px 20px;"><div style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#8A857B; margin-bottom:12px;">Share of ' + geoMetricLabel().toLowerCase() + ' (state totals)</div><div style="display:flex; height:26px; border-radius:4px; overflow:hidden;"><div style="width:' + mp + '%; background:#C98A2B; min-width:2px;"></div><div style="flex:1; background:#7FA88C;"></div></div><div style="display:flex; justify-content:space-between; font-size:12px; color:#57534A; margin-top:8px;"><span>Metro ' + mp + '%</span><span>' + (100 - mp) + '% rural</span></div></div>';
    return cards + bar;
  }

  // Recipient-level grant flows (CONCEPT). Demo corridors derived deterministically
  // from the crosswalk: each metro county "gives out" its population share of the
  // state total, split between its own county, other counties, and out of state.
  // Goes live when 990-PF Part XIV / Schedule I grant rows are parsed and each
  // recipient is geocoded through the same ZIP→county→CBSA crosswalk.
  function geoFlow(abbr, base, statePop) {
    var W = 560, H = 430, f2 = fips2(abbr);
    var feats = geoFeatures().counties.filter(function (f) { return pad5(f.id).slice(0, 2) === f2; });
    if (!feats.length) return '<div style="color:#8A857B; font-size:13px;">No geometry available.</div>';
    var proj = makeProj(feats, W, H);
    function hash01(s) { var hh = 0; for (var i = 0; i < s.length; i++) hh = (hh * 31 + s.charCodeAt(i)) >>> 0; return (hh % 1000) / 1000; }
    function pt(fp) { var c = GEO.centroids[fp]; return c ? proj.pr(c) : null; }

    var giving = base.giving;
    var all = GEO.stateCounties[abbr] || [];
    var metros = all.filter(function (fp) { return GEO.countyIndex[fp]; });
    var rural = all.filter(function (fp) { return !GEO.countyIndex[fp]; });
    var flows = [], localTotal = 0, outTotal = 0, ruralTotal = 0;
    var origins = [];
    metros.forEach(function (fp) {
      var ci = GEO.countyIndex[fp];
      var out = giving * (ci.pop / statePop);
      var local = out * (0.5 + 0.18 * hash01(fp));
      var leave = out * (0.1 + 0.1 * hash01(fp + 'x'));
      var rest = out - local - leave;
      var others = metros.filter(function (o) { return o !== fp; });
      if (!others.length && !rural.length) { local += rest; rest = 0; }
      localTotal += local; outTotal += leave;
      if (rest > 0) {
        var ruralShare = others.length ? (rural.length ? 0.28 : 0) : 1;
        var oPop = others.reduce(function (s, o) { return s + GEO.countyIndex[o].pop; }, 0) || 1;
        others.forEach(function (o) { var v = rest * (1 - ruralShare) * (GEO.countyIndex[o].pop / oPop); if (v > 0) flows.push({ from: fp, to: o, val: v }); });
        var rv = rest * ruralShare;
        if (rv > 0 && rural.length) {
          var rt = rural.slice().sort(function (a, b) { return hash01(fp + a) - hash01(fp + b); }).slice(0, 2);
          rt.forEach(function (r) { flows.push({ from: fp, to: r, val: rv / rt.length, rural: true }); });
          ruralTotal += rv;
        }
      }
      origins.push({ fips: fp, name: ci.name, out: out });
    });
    var inbound = giving * (0.08 + 0.1 * hash01(abbr));
    var interTotal = flows.reduce(function (s, f) { return s + (f.rural ? 0 : f.val); }, 0);

    // map
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%; height:auto; display:block; overflow:hidden;">';
    feats.forEach(function (f) { var d = proj.path(f); if (d) svg += '<path d="' + d + '" fill="#EFEBE1" stroke="#F5F4F0" stroke-width="0.5"></path>'; });
    var top = flows.slice().sort(function (a, b) { return b.val - a.val; }).slice(0, 16);
    var maxF = top.reduce(function (m, f) { return Math.max(m, f.val); }, 1);
    function arc(a, b) { var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], k = 0.18; return 'M' + a[0].toFixed(1) + ',' + a[1].toFixed(1) + ' Q' + (mx - dy * k).toFixed(1) + ',' + (my + dx * k).toFixed(1) + ' ' + b[0].toFixed(1) + ',' + b[1].toFixed(1); }
    top.forEach(function (f) {
      var a = pt(f.from), b = pt(f.to); if (!a || !b) return;
      var w = 0.8 + 4.2 * Math.sqrt(f.val / maxF);
      var fromN = GEO.countyIndex[f.from] ? GEO.countyIndex[f.from].name : f.from;
      var toN = GEO.countyIndex[f.to] ? GEO.countyIndex[f.to].name : 'non-metro county';
      svg += '<path d="' + arc(a, b) + '" fill="none" stroke="' + (f.rural ? '#C98A2B' : '#B04A3C') + '" stroke-opacity="' + (f.rural ? 0.5 : 0.65) + '" stroke-width="' + w.toFixed(1) + '" stroke-linecap="round"><title>' + esc(fromN) + ' \u2192 ' + esc(toN) + ' \u00b7 ' + money(f.val) + ' (demo)</title></path>';
      svg += '<circle cx="' + b[0].toFixed(1) + '" cy="' + b[1].toFixed(1) + '" r="' + (1.4 + w * 0.5).toFixed(1) + '" fill="' + (f.rural ? '#C98A2B' : '#B04A3C') + '" fill-opacity="0.85"></circle>';
    });
    var maxO = origins.reduce(function (m, o) { return Math.max(m, o.out); }, 1);
    origins.sort(function (a, b) { return b.out - a.out; });
    origins.forEach(function (o, i) {
      var a = pt(o.fips); if (!a) return;
      var r = 3 + 7 * Math.sqrt(o.out / maxO);
      svg += '<circle cx="' + a[0].toFixed(1) + '" cy="' + a[1].toFixed(1) + '" r="' + r.toFixed(1) + '" fill="#14432F" stroke="#F5F4F0" stroke-width="1.4"><title>' + esc(o.name) + ' \u00b7 ' + money(o.out) + ' granted out (demo)</title></circle>';
      if (i < 3) svg += '<text x="' + (a[0] + r + 4).toFixed(1) + '" y="' + (a[1] + 3).toFixed(1) + '" font-family="Archivo,sans-serif" font-size="10" font-weight="700" fill="#17140F" stroke="#F5F4F0" stroke-width="2.6" paint-order="stroke">' + esc(o.name) + '</text>';
    });
    svg += '</svg>';
    var mapLegend = '<div style="display:flex; flex-wrap:wrap; gap:8px 16px; margin-top:12px; font-size:11.5px; color:#8A857B; align-items:center;"><span style="display:inline-flex; align-items:center; gap:6px;"><span style="width:10px; height:10px; border-radius:999px; background:#14432F;"></span>Funder county (sized by grants out)</span><span style="display:inline-flex; align-items:center; gap:6px;"><span style="width:18px; height:3px; border-radius:2px; background:#B04A3C;"></span>To another metro county</span><span style="display:inline-flex; align-items:center; gap:6px;"><span style="width:18px; height:2px; border-radius:2px; background:#C98A2B;"></span>To non-metro counties</span><span style="font-family:Archivo,sans-serif; font-weight:700; font-size:12px; color:#57534A; font-variant-numeric:tabular-nums;">Largest corridor ' + money(maxF) + ' \u00b7 largest funder county ' + money(maxO) + '</span></div>';

    // aside
    var alloc = (localTotal + interTotal + ruralTotal + outTotal) || 1;
    var lp = Math.round(localTotal / alloc * 100), sp = Math.round((interTotal + ruralTotal) / alloc * 100), op = Math.max(0, 100 - lp - sp);
    var aside = '<div style="display:flex; align-items:center; gap:8px; margin-bottom:14px;"><span style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#8A857B;">Where grants land</span>' + srcTag('Concept \u00b7 demo flows', '#A2643F') + '</div>';
    aside += '<div style="display:flex; height:22px; border-radius:4px; overflow:hidden; margin-bottom:10px;"><div style="width:' + lp + '%; background:#14432F; min-width:2px;"></div><div style="width:' + sp + '%; background:#C98A2B; min-width:2px;"></div><div style="flex:1; background:#B04A3C; min-width:2px;"></div></div>';
    function legRow(sw, lbl, val) { return '<div style="display:flex; align-items:center; gap:8px; font-size:12.5px; margin-bottom:6px;"><span style="width:10px; height:10px; border-radius:2px; background:' + sw + '; flex:none;"></span><span style="color:#57534A; flex:1;">' + lbl + '</span><span style="font-family:Archivo,sans-serif; font-weight:700; color:#14432F;">' + val + '</span></div>'; }
    aside += legRow('#14432F', 'Stays in the funder\u2019s county', money(localTotal) + ' \u00b7 ' + lp + '%');
    aside += legRow('#C98A2B', 'Elsewhere in the state', money(interTotal + ruralTotal) + ' \u00b7 ' + sp + '%');
    aside += legRow('#B04A3C', 'Leaves the state', money(outTotal) + ' \u00b7 ' + op + '%');
    aside += '<div style="font-size:12px; color:#57534A; background:#F5F4F0; border:1px solid #DDDBD2; border-radius:4px; padding:8px 11px; margin:10px 0 16px;">+ ' + money(inbound) + ' flows <strong>into</strong> ' + esc(stName(abbr)) + ' from out-of-state funders (demo)</div>';
    var corr = flows.filter(function (f) { return !f.rural; }).sort(function (a, b) { return b.val - a.val; }).slice(0, 6);
    if (corr.length) {
      aside += '<div style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#8A857B; margin-bottom:10px;">Top corridors</div>';
      var maxC = corr[0].val;
      corr.forEach(function (f) {
        var pct = Math.round(f.val / maxC * 100);
        aside += '<div style="margin-bottom:8px;"><div style="display:flex; justify-content:space-between; gap:8px; font-size:12.5px; margin-bottom:3px;"><span style="color:#17140F; font-weight:600;">' + esc(GEO.countyIndex[f.from].name) + ' <span style="color:#8A857B; font-weight:400;">\u2192</span> ' + esc(GEO.countyIndex[f.to].name) + '</span><span style="font-family:Archivo,sans-serif; font-weight:700; color:#14432F;">' + money(f.val) + '</span></div><div style="background:#F0EEE7; border-radius:3px; height:6px; overflow:hidden;"><div style="height:100%; width:' + pct + '%; background:#B04A3C;"></div></div></div>';
      });
    }
    aside += '<div style="font-size:11.5px; color:#8A857B; margin-top:12px; line-height:1.5;">Corridors here are illustrative. This view goes live when 990-PF grant rows (Part XIV / Schedule I) are parsed and each recipient is geocoded through the same ZIP\u2192county\u2192CBSA crosswalk; then every arc is a real funder\u2192recipient dollar flow, filterable by program area.</div>';

    return '<div data-stack style="display:grid; grid-template-columns:1.35fr 1fr; gap:20px; align-items:start; background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:20px 22px;"><div>' + svg + mapLegend + '</div><div>' + aside + '</div></div>';
  }

  function drawGeo() {
    var box = $('sf-geo'); if (!box || !GEO || !USTOPO || !window.d3 || !window.topojson) return;
    var abbr = geoAbbr, st = DATA.states[abbr]; if (!st) return;
    var y = st.years[st.years.length - 1];
    var base = { count: y.count, assets: y.assets, giving: y.giving, year: y.y };
    var statePop = popOf(abbr) || 1;
    var h = '<div style="border-top:1px solid #DDDBD2; padding-top:26px;">';
    h += '<div style="display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin-bottom:4px;"><span style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#14432F;">Geographic depth</span>' + srcTag('Population-anchored estimate', '#A2643F') + '</div>';
    h += '<h3 style="font-family:Archivo,sans-serif; font-weight:700; font-size:clamp(20px,2.4vw,28px); letter-spacing:-.02em; margin:0 0 6px;">Inside ' + esc(stName(abbr)) + ': county &amp; metro distribution</h3>';
    h += '<p style="font-size:13.5px; line-height:1.55; color:#57534A; margin:0 0 16px; max-width:72ch;">' + esc(stName(abbr)) + ' has ' + num(base.count) + ' foundations (' + base.year + ', all-foundations estimate), distributed to counties and metros by resident population through the ZIP→county→CBSA crosswalk. ' + GEO.meta.cbsaCount + ' metros carry Census populations; every other county rolls into the state\u2019s non-metro balance.</p>';
    var tabs = [['county', 'County map'], ['cbsa', 'Metro / CBSA'], ['split', 'Metro vs rural'], ['flow', 'Grant flow']];
    h += '<div style="display:flex; flex-wrap:wrap; align-items:baseline; margin-bottom:14px; border-bottom:1px solid #DDDBD2; padding-bottom:10px;">';
    tabs.forEach(function (t) { var on = t[0] === geoTab; h += '<button data-geo-tab="' + t[0] + '" style="' + tabStyle(on) + ' margin-right:18px;">' + t[1] + '</button>'; });
    h += '</div>';
    if (geoTab !== 'flow') {
      var mets = [['count', 'Foundations'], ['assets', 'Assets'], ['giving', 'Giving']];
      h += '<div style="display:flex; flex-wrap:wrap; gap:2px 16px; align-items:baseline; margin-bottom:20px;">' + grpLabel('Measure');
      mets.forEach(function (m) { var on = m[0] === geoMetric; h += '<button data-geo-metric="' + m[0] + '" style="' + tabStyle(on, '#14432F') + '">' + m[1] + '</button>'; });
      h += '<span style="flex:1;"></span><button data-geo-pc="1" style="' + tabStyle(perCapita, '#14432F') + '">Per capita ' + (perCapita ? 'on' : 'off') + '</button></div>';
    }
    h += geoTab === 'county' ? geoCounty(abbr, base, statePop) : geoTab === 'cbsa' ? geoCbsa(abbr, base, statePop) : geoTab === 'flow' ? geoFlow(abbr, base, statePop) : geoSplit(abbr, base, statePop);
    h += '<div style="font-size:12px; color:#8A857B; margin-top:14px; line-height:1.5; max-width:88ch;">County and metro figures split the state total by resident population (crosswalk vintage: ' + esc(GEO.meta.popVintage) + '), not per-organization filings. It is a representative estimate for orientation. Verified per-foundation numbers come from the Funder Intelligence Report.</div>';
    h += '</div>';
    box.innerHTML = h;
  }

  function ensureGeoDeps(cb) {
    function afterLibs() {
      var m = location.search.match(/[?&]t=([^&]+)/);
      var p1 = GEO ? Promise.resolve() : fetch('./data/zip-county-cbsa.json' + (m ? '?t=' + m[1] : '')).then(function (r) { return r.json(); }).then(function (d) { GEO = d; });
      var p2 = USTOPO ? Promise.resolve() : fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json').then(function (r) { return r.json(); }).then(function (d) { USTOPO = d; });
      Promise.all([p1, p2]).then(function () { cb(); }).catch(function (e) { cb(e || new Error('geo load')); });
    }
    var need = [];
    if (!window.d3) need.push('https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js');
    if (!window.topojson) need.push('https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js');
    (function next(i) { if (i >= need.length) return afterLibs(); var s = document.createElement('script'); s.src = need[i]; s.onload = function () { next(i + 1); }; s.onerror = function () { cb(new Error('script ' + need[i])); }; document.head.appendChild(s); })(0);
  }

  function renderGeo(abbr) {
    var box = $('sf-geo'); if (!box) return; geoAbbr = abbr;
    if (GEO && USTOPO && window.d3 && window.topojson) { drawGeo(); return; }
    box.innerHTML = '<div style="border-top:1px solid #DDDBD2; padding-top:26px;"><div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:48px; text-align:center; color:#57534A; font-size:14px;"><span style="display:inline-block;width:16px;height:16px;border:2px solid #EDEBE4;border-top-color:#C98A2B;border-radius:50%;animation:sfspin .8s linear infinite;vertical-align:-3px;margin-right:8px;"></span>Loading county &amp; metro geometry…</div></div>';
    ensureGeoDeps(function (err) { if (err) { box.innerHTML = '<div style="border-top:1px solid #DDDBD2; padding-top:26px; color:#8A857B; font-size:13px;">County &amp; metro geometry could not load in this environment; it renders on the deployed site.</div>'; return; } if (geoAbbr) drawGeo(); });
  }
})();
