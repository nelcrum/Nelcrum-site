/* NELCRUM Solutions — State Foundation Overview
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
  var DATA = null, compare = [], metric = 'giving', layer = 'cf', current = null, perCapita = false;
  var CFCACHE = {};
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
  function ready(cb) { var t = 0; (function p() { if ($('sf-form')) return cb(); if (t++ > 600) return; requestAnimationFrame(p); })(); }
  function stName(abbr) { return (DATA && DATA.states[abbr]) ? DATA.states[abbr].name : abbr; }
  function isAvgMetric() { return metric === 'avgGrant' || metric === 'avgPer'; }
  function valFor(yr) { return yr[metric]; }
  // Value adjusted for the active per-capita mode, using the given state's population.
  function valAdj(yr, abbr) {
    var v = yr[metric];
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
      // The DC runtime may re-render the template after our first fill, replacing
      // the <select> with an empty one. Watch for that and repopulate.
      var mo = new MutationObserver(function () { fillStates(); });
      if (document.body) mo.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { mo.disconnect(); }, 12000);
    });
  });

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
    var lb = e.target && e.target.closest ? e.target.closest('[data-sf-layer]') : null;
    if (lb) { var nl = lb.getAttribute('data-sf-layer'); if (nl !== layer) { layer = nl; metric = 'giving'; if (current) run(current); } return; }
    var pcb = e.target && e.target.closest ? e.target.closest('[data-sf-pc]') : null;
    if (pcb) { perCapita = !perCapita; if (current) run(current); return; }
    var mb = e.target && e.target.closest ? e.target.closest('[data-sf-metric]') : null;
    if (mb) { metric = mb.getAttribute('data-sf-metric'); renderChart(); return; }
    var rm = e.target && e.target.closest ? e.target.closest('[data-sf-rm]') : null;
    if (rm) { e.preventDefault(); var i = +rm.getAttribute('data-sf-rm'); if (i > 0 && i < compare.length) { compare.splice(i, 1); renderChart(); } }
  });

  function msg(t, err) { var m = $('sf-msg'); if (m) { m.textContent = t || ''; m.style.color = err ? '#F2B8A2' : 'rgba(245,244,240,.6)'; } }

  function run(abbr) {
    loadDataset(function () {
      if (!DATA.states[abbr]) return;
      current = abbr;
      if (layer === 'cf') runCF(abbr); else if (layer === 'pf') runPF(abbr); else runEstimate(abbr);
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
    var badge = isSample
      ? '<span style="margin-left:auto; font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#A2643F; background:#F3E4DA; border:1px solid #E2CDB6; padding:3px 9px; border-radius:4px;">Demo · run BMF build for live data</span>'
      : '<span style="margin-left:auto; display:inline-flex; align-items:center; gap:6px; font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#3F7A55; background:#E6F1E9; border:1px solid #CBE3D2; padding:3px 9px; border-radius:4px;"><span style="width:6px; height:6px; border-radius:999px; background:#6FBF8B;"></span>Live · IRS BMF</span>';

    var h = layerToggle();
    h += '<div style="display:flex; align-items:baseline; gap:8px; margin-bottom:18px;"><span style="font-family:Archivo,sans-serif; font-weight:800; font-size:15px; letter-spacing:.12em; color:#17140F;">NELCRUM</span><span style="font-family:Archivo,sans-serif; font-size:9px; letter-spacing:.24em; text-transform:uppercase; color:#C98A2B;">Solutions</span><span style="font-size:11px; color:#8A857B; margin-left:6px;">State Foundation Overview</span>' + badge + '</div>';
    h += '<h2 style="font-family:Archivo,sans-serif; font-weight:700; font-size:clamp(24px,3vw,36px); letter-spacing:-.02em; margin:0 0 4px;">' + esc(stName(abbr)) + ' <span style="color:#8A857B; font-weight:600; font-size:.6em;">private foundations</span></h2>';
    h += '<div style="font-size:14px; color:#57534A; margin-bottom:26px;">' + num(d.count) + ' private foundations \u00b7 ' + (d.source || 'IRS Business Master File') + (d.built ? ' \u00b7 built ' + d.built : '') + '</div>';

    h += '<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:14px; margin-bottom:26px;">';
    h += card('Private foundations', pc ? (Math.round(d.count / P * 100000 * 10) / 10) + ' /100k' : num(d.count), 'registered with the IRS');
    h += card('Total assets', pc ? money(d.assets / P) + ' /res' : money(d.assets), 'book value, all PFs');
    h += card('Total income', pc ? money(d.income / P) + ' /res' : money(d.income), 'latest filed year');
    h += card('Avg assets / foundation', money(avg), 'across the state');
    h += '</div>';

    // NTEE allocation by assets
    var letters = Object.keys(d.ntee || {}).map(function (k) { return { k: k, n: d.ntee[k].n, a: d.ntee[k].a }; }).sort(function (a, b) { return b.a - a.a; }).slice(0, 10);
    var maxA = letters.reduce(function (m, x) { return Math.max(m, x.a); }, 1);
    h += '<div id="sf-chart" style="display:none;"></div>';
    h += '<div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:22px 24px; margin-bottom:16px;">';
    h += '<div style="display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:16px;"><span style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#8A857B;">Assets by program area</span><span style="font-size:11.5px; color:#8A857B;">' + money(d.assets) + ' total</span></div>';
    letters.forEach(function (x) {
      h += '<div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;"><div style="width:170px; font-size:13px; color:#17140F; flex:none;">' + esc(NTEE_LABELS[x.k] || x.k) + '</div><div style="flex:1; background:#F0EEE7; border-radius:3px; height:16px; overflow:hidden;"><div style="height:100%; width:' + Math.round(x.a / maxA * 100) + '%; background:#C98A2B;"></div></div><div style="width:70px; text-align:right; font-family:Archivo,sans-serif; font-weight:700; font-size:13px; color:#14432F; flex:none;">' + money(x.a) + '</div><div style="width:60px; text-align:right; font-size:12px; color:#8A857B; flex:none;">' + num(x.n) + '</div></div>';
    });
    h += '<div style="font-size:12px; color:#8A857B; margin-top:12px; line-height:1.5;">Counts and assets are by each foundation\u2019s own NTEE classification. Grant giving and multi-year trend are not in the Business Master File; those come with the SOI 990-PF step. ZIP data is captured (' + (d.zipCount || 0) + ' ZIPs) so county and metro (MSA) rollups can be added next.</div>';
    h += '</div>';

    $('sf-teaser').innerHTML = h;
    buildGate(stName(abbr), false);
  }

  // ---------- COMMUNITY FOUNDATION LAYER (LIVE) ----------
  function runCF(abbr) {
    var res = $('sf-results'); res.style.display = 'block';
    $('sf-teaser').innerHTML = layerToggle() + '<div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:40px; text-align:center; color:#57534A;"><span style="display:inline-block;width:16px;height:16px;border:2px solid #EDEBE4;border-top-color:#C98A2B;border-radius:50%;animation:sfspin .8s linear infinite;vertical-align:-3px;margin-right:8px;"></span>Pulling live IRS 990 filings for ' + esc(stName(abbr)) + ' community foundations…</div>';
    try { var y = res.getBoundingClientRect().top + window.scrollY - 120; window.scrollTo({ top: y, behavior: 'smooth' }); } catch (e) {}
    fetchCF(abbr, function (d, isSample) {
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
      settled = true; clearTimeout(timer); d.__sample = false; CFCACHE[abbr] = d; cb(d, false);
    }).catch(function () { if (settled) return; settled = true; clearTimeout(timer); var s = cfSample(abbr); CFCACHE[abbr] = s; cb(s, true); });
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
  function renderBody(d, isCF, isSample) {
    var res = $('sf-results'); res.style.display = 'block';
    var years = d.years || [];
    var latest = years[years.length - 1] || {};
    var prev = years[years.length - 2] || latest;
    function delta(a, b) { if (!b) return ''; var p = (a - b) / b * 100; var up = p >= 0; return '<span style="font-size:12px; font-weight:700; color:' + (up ? '#3F7A55' : '#B04A3C') + ';">' + (up ? '▲ ' : '▼ ') + Math.abs(p).toFixed(1) + '%</span>'; }

    var badge = isCF
      ? (isSample
        ? '<span style="margin-left:auto; font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#A2643F; background:#F3E4DA; border:1px solid #E2CDB6; padding:3px 9px; border-radius:4px;">Demo · deploy proxy for live data</span>'
        : '<span style="margin-left:auto; display:inline-flex; align-items:center; gap:6px; font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#3F7A55; background:#E6F1E9; border:1px solid #CBE3D2; padding:3px 9px; border-radius:4px;"><span style="width:6px; height:6px; border-radius:999px; background:#6FBF8B;"></span>Live · IRS 990</span>')
      : '<span style="margin-left:auto; font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#A2643F; background:#F3E4DA; border:1px solid #E2CDB6; padding:3px 9px; border-radius:4px;">Representative estimates</span>';

    var abbr = isCF ? d.state : d.abbr;
    var sub = isCF
      ? (d.total || latest.count || 0) + ' community foundations \u00b7 ' + (d.source || 'IRS Form 990') + ' \u00b7 latest year ' + (latest.y || '')
      : num(latest.count) + ' grantmaking foundations \u00b7 latest year ' + (latest.y || '');

    var h = '';
    h += layerToggle();
    h += '<div style="display:flex; align-items:baseline; gap:8px; margin-bottom:18px;"><span style="font-family:Archivo,sans-serif; font-weight:800; font-size:15px; letter-spacing:.12em; color:#17140F;">NELCRUM</span><span style="font-family:Archivo,sans-serif; font-size:9px; letter-spacing:.24em; text-transform:uppercase; color:#C98A2B;">Solutions</span><span style="font-size:11px; color:#8A857B; margin-left:6px;">State Foundation Overview</span>' + badge + '</div>';
    h += '<h2 style="font-family:Archivo,sans-serif; font-weight:700; font-size:clamp(24px,3vw,36px); letter-spacing:-.02em; margin:0 0 4px;">' + esc(stName(abbr)) + ' <span style="color:#8A857B; font-weight:600; font-size:.6em;">' + (isCF ? 'community foundations' : 'foundation landscape') + '</span></h2>';
    h += '<div style="font-size:14px; color:#57534A; margin-bottom:26px;">' + esc(sub) + '</div>';

    var P = popOf(abbr);
    var pc = perCapita && P;
    h += '<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:14px; margin-bottom:26px;">';
    h += card('Foundations', pc ? (Math.round(latest.count / P * 100000 * 10) / 10) + ' /100k' : num(latest.count), delta(latest.count, prev.count) + (prev.y && prev.y !== latest.y ? ' vs ' + prev.y : ''));
    h += card('Total giving', pc ? money(latest.giving / P) + ' /res' : money(latest.giving), delta(latest.giving, prev.giving) + (prev.y && prev.y !== latest.y ? ' vs ' + prev.y : ''));
    h += card('Total assets', pc ? money(latest.assets / P) + ' /res' : money(latest.assets), delta(latest.assets, prev.assets) + (prev.y && prev.y !== latest.y ? ' vs ' + prev.y : ''));
    h += isCF ? card('Avg per foundation', money(latest.avgPer), 'giving, latest year') : card('Avg grant size', money(latest.avgGrant), 'across the state');
    h += '</div>';

    h += '<div id="sf-chart"></div>';

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
    buildGate(stName(abbr), isCF);
  }

  function layerToggle() {
    function seg(id, label, on) {
      return '<button data-sf-layer="' + id + '" style="font-family:Archivo,sans-serif; font-weight:700; font-size:12.5px; padding:9px 14px; border:1px solid ' + (on ? '#17140F' : '#DDDBD2') + '; background:' + (on ? '#17140F' : '#fff') + '; color:' + (on ? '#F5F4F0' : '#57534A') + '; cursor:pointer; border-radius:4px;">' + label + '</button>';
    }
    var pc = '<button data-sf-pc="1" title="Show figures per resident" style="font-family:Archivo,sans-serif; font-weight:700; font-size:12.5px; padding:9px 14px; border:1px solid ' + (perCapita ? '#14432F' : '#DDDBD2') + '; background:' + (perCapita ? '#14432F' : '#fff') + '; color:' + (perCapita ? '#fff' : '#57534A') + '; cursor:pointer; border-radius:4px;">Per capita ' + (perCapita ? 'on' : 'off') + '</button>';
    return '<div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:22px;">' + seg('pf', 'All private foundations · live IRS', layer === 'pf') + seg('cf', 'Community foundations · live IRS', layer === 'cf') + seg('estimate', 'All foundations · estimate', layer === 'estimate') + '<span style="flex:1;"></span>' + pc + '</div>';
  }

  function card(label, val, sub) {
    return '<div style="background:#17140F; color:#F5F4F0; border-radius:4px; padding:18px;"><div style="font-family:Archivo,sans-serif; font-weight:800; font-size:25px; letter-spacing:-.02em; line-height:1;">' + val + '</div><div style="font-size:12px; color:#C98A2B; margin:8px 0 4px; font-weight:600;">' + label + '</div><div style="font-size:11.5px; color:rgba(245,244,240,.6);">' + sub + '</div></div>';
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

    var toggle = '<div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px;">';
    metricSet().forEach(function (m) { var on = m[0] === metric; toggle += '<button data-sf-metric="' + m[0] + '" style="font-family:Archivo,sans-serif; font-weight:600; font-size:12.5px; padding:7px 13px; border:1px solid ' + (on ? '#17140F' : '#DDDBD2') + '; border-radius:4px; background:' + (on ? '#17140F' : '#fff') + '; color:' + (on ? '#F5F4F0' : '#57534A') + '; cursor:pointer;">' + m[1] + '</button>'; });
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

    box.innerHTML = '<div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:22px 24px; margin-bottom:26px;"><div style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#8A857B; margin-bottom:16px;">' + metricLabel() + ' over time</div>' + toggle + svg + legend + adder + '</div>';
  }

  function buildGate(name, isCF) {
    var done = false; try { done = localStorage.getItem('nc_states_unlock') === '1'; } catch (e) {}
    var gate = $('sf-gate');
    if (done) { gate.innerHTML = ''; return; }
    gate.innerHTML = '<div style="background:#EEF3E9; border:1px solid #DDDBD2; border-radius:4px; padding:24px 26px;"><div style="font-family:Archivo,sans-serif; font-weight:700; font-size:20px; margin-bottom:6px;">See every state, and compare</div><div style="font-size:14px; line-height:1.55; color:#57534A; margin-bottom:16px; max-width:60ch;">Enter your email to unlock the full multi-year dashboard: live community-foundation data, metric toggles, and up to five states side by side.</div><form id="sf-gateform" style="display:flex; gap:10px; flex-wrap:wrap;"><input id="sf-email" type="email" required placeholder="you@org.com" style="flex:1; min-width:220px; font-family:inherit; font-size:15px; padding:13px 15px; border:1.5px solid #DDDBD2; border-radius:4px; background:#fff;"><button type="submit" style="font-family:inherit; font-weight:700; font-size:15px; color:#fff; background:#14432F; border:none; border-radius:4px; padding:13px 22px; cursor:pointer;">Unlock dashboard</button></form></div>';
    var chart = $('sf-chart');
    var el = chart; while (el) { el.style.filter = 'blur(6px)'; el.style.pointerEvents = 'none'; el = el.nextElementSibling; }
    setTimeout(function () {
      var gf = $('sf-gateform'); if (!gf) return;
      gf.addEventListener('submit', function (e) {
        e.preventDefault();
        var em = $('sf-email').value.trim();
        if (em.indexOf('@') < 1) { $('sf-email').style.borderColor = '#B04A3C'; return; }
        try {
          var body = new URLSearchParams({ name: '', email: em, organization: '', message: 'State Foundation Overview unlock: ' + name + ' (' + (isCF ? 'community foundations' : 'all foundations') + ')', submittedAt: new Date().toISOString(), source: 'State Foundation Overview' });
          fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
        } catch (err) {}
        try { localStorage.setItem('nc_states_unlock', '1'); } catch (e2) {}
        gate.innerHTML = '';
        var x = $('sf-chart'); while (x) { x.style.filter = ''; x.style.pointerEvents = ''; x = x.nextElementSibling; }
      });
    }, 30);
  }
})();
