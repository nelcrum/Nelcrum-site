/* NELCRUM Solutions — Peer Community Comparator.
 * County-level statistical peer matching (Chicago Fed PCIT lineage, advanced with
 * adjustable dimension weights + 2020–24 trajectory matching).
 * Data: ACS 2023 5-yr (live, cached) + tract-mobility.csv + county centers.
 */
(function () {
  function $(id) { return document.getElementById(id); }
  function G() { return window.NCGeo; }
  var counties = null, hasACS = false, tracts = null, centers = null, cbsa = null;
  var universe = null; // [{fips,name,st,metro,pop,realPop,nTracts,f:{...}}]
  var lastResult = null;
  var FEATS = null; // set in buildUniverse based on data availability

  var FEATS_FULL = {
    econ: ['mhi', 'unempRate', 'baRate', 'avgInc'],
    need: ['povRate', 'lmiShare', 'rentBurden'],
    traj: ['trend', 'netGrowth']
  };
  var FEATS_MOBILITY = {
    econ: ['avgInc'],
    need: ['lmiShare', 'lowShare'],
    traj: ['trend', 'netGrowth']
  };
  var LABELS = {
    mhi: 'Median household income', unempRate: 'Unemployment rate', baRate: 'Bachelor\u2019s or higher',
    povRate: 'Poverty rate', lmiShare: 'LMI tract share', rentBurden: 'Rent burden (rent \u00f7 income)',
    avgInc: 'Avg. tract income (% of area median)', lowShare: 'Low-income tract share',
    trend: 'Tract income trend, 2020\u201324', netGrowth: 'Net tracts gaining since 2020'
  };

  function ready(cb) { var t = 0; (function p() { if ($('pc-form') && window.NCGeo) return cb(); if (t++ > 800) return; requestAnimationFrame(p); })(); }

  document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'pc-form') { e.preventDefault(); go(); }
  });
  document.addEventListener('change', function (e) {
    if (!e.target) return;
    if (e.target.id === 'pc-state') fillCounties(e.target.value);
    if (['pc-w-econ', 'pc-w-need', 'pc-w-traj', 'pc-metro', 'pc-size'].indexOf(e.target.id) >= 0 && lastResult) go();
  });

  ready(function () {
    setMsg(spin('Loading 3,000+ county profiles\u2026'));
    Promise.all([G().loadCounties(), G().loadTracts(), G().loadCenters(), G().loadCBSA()]).then(function (res) {
      counties = res[0].byFips; hasACS = res[0].hasACS; tracts = res[1]; centers = res[2]; cbsa = res[3];
      buildUniverse();
      setMsg(hasACS ? '' : 'Running on tract income data (the live Census statistics service is unreachable right now \u2014 demographic indicators return when it reconnects).');
      fillStates();
      var mo = new MutationObserver(function () { fillStates(); });
      if (document.body) mo.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { mo.disconnect(); }, 12000);
    });
  });

  function setMsg(t, err) {
    var m = $('pc-msg'); if (!m) return;
    m.innerHTML = t || '';
    m.style.color = err ? '#F2B8A2' : 'rgba(245,244,240,.6)';
  }
  function spin(t) { return '<span style="display:inline-block;width:13px;height:13px;border:2px solid rgba(245,244,240,.4);border-top-color:#C98A2B;border-radius:50%;animation:pcspin .8s linear infinite;vertical-align:-2px;margin-right:9px;"></span>' + t; }

  function fillStates() {
    var sel = $('pc-state'); if (!sel || sel.options.length > 1) return;
    var names = G().STATE_NAMES;
    sel.innerHTML = '<option value="">Choose a state\u2026</option>' + Object.keys(names).sort(function (a, b) { return names[a] < names[b] ? -1 : 1; }).map(function (ab) { return '<option value="' + ab + '">' + names[ab] + '</option>'; }).join('');
    if (sel.value) fillCounties(sel.value);
  }
  function fillCounties(st) {
    var sel = $('pc-county'); if (!sel) return;
    if (!st) { sel.disabled = true; sel.innerHTML = '<option value="">County\u2026</option>'; return; }
    var fp = G().STATE_FIPS[st], opts = [];
    counties.forEach(function (c, fips) { if (fips.slice(0, 2) === fp && (c.tr || c.pop != null)) opts.push([fips, c.name]); });
    opts.sort(function (a, b) { return a[1] < b[1] ? -1 : 1; });
    sel.innerHTML = '<option value="">County\u2026</option>' + opts.map(function (o) { return '<option value="' + o[0] + '">' + G().esc(o[1]) + '</option>'; }).join('');
    sel.disabled = false;
  }

  // ---------- feature universe ----------
  function buildUniverse() {
    FEATS = hasACS ? FEATS_FULL : FEATS_MOBILITY;
    universe = [];
    counties.forEach(function (e, fips) {
      var m = e.tr;
      if (!m || !m.n) return; // need tract data to say anything meaningful
      var lmiShare = m.lmi / m.n * 100;
      var lowShare = m.low / m.n * 100;
      var avgInc = m.sum24 / m.n;
      var trend = m.n20 ? (m.sum24 / m.n) - (m.sum20 / m.n20) : null;
      var netGrowth = (m.upCls - m.dnCls) / m.n * 100;
      universe.push({
        fips: fips, name: e.name, st: e.st,
        realPop: e.pop, pop: e.pop != null ? e.pop : m.n * 4000, nTracts: m.n,
        metro: !!(cbsa && cbsa.get(fips)),
        f: {
          mhi: e.mhi, unempRate: e.unempRate, baRate: e.baRate,
          povRate: e.povRate, lmiShare: lmiShare, lowShare: lowShare, avgInc: avgInc,
          rentBurden: (e.rent && e.mhi) ? (e.rent * 12 / e.mhi * 100) : null,
          trend: trend, netGrowth: netGrowth
        }
      });
    });
    // z-score params over active features
    var keys = activeKeys();
    var stats = {};
    keys.forEach(function (k) {
      var vals = universe.map(function (u) { return u.f[k]; }).filter(function (v) { return v != null && !isNaN(v); });
      var mean = vals.reduce(function (s, v) { return s + v; }, 0) / (vals.length || 1);
      var sd = Math.sqrt(vals.reduce(function (s, v) { return s + (v - mean) * (v - mean); }, 0) / (vals.length || 1)) || 1;
      stats[k] = { mean: mean, sd: sd };
    });
    universe.forEach(function (u) {
      u.z = {};
      keys.forEach(function (k) { u.z[k] = u.f[k] == null || isNaN(u.f[k]) ? null : (u.f[k] - stats[k].mean) / stats[k].sd; });
    });
  }
  function activeKeys() {
    var keys = [];
    Object.keys(FEATS).forEach(function (d) { FEATS[d].forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); }); });
    return keys;
  }

  // ---------- matching ----------
  function go() {
    var fips = $('pc-county') ? $('pc-county').value : '';
    if (!fips) { setMsg('Pick a state, then a county.', true); return; }
    var me = null;
    for (var i = 0; i < universe.length; i++) if (universe[i].fips === fips) { me = universe[i]; break; }
    if (!me) { setMsg('No profile for that county.', true); return; }
    var w = {
      econ: Number($('pc-w-econ') ? $('pc-w-econ').value : 50),
      need: Number($('pc-w-need') ? $('pc-w-need').value : 50),
      traj: Number($('pc-w-traj') ? $('pc-w-traj').value : 50)
    };
    if (w.econ + w.need + w.traj === 0) w = { econ: 1, need: 1, traj: 1 };
    var metroMatch = $('pc-metro') ? $('pc-metro').checked : true;
    var sizeMatch = $('pc-size') ? $('pc-size').checked : true;

    var scored = [];
    universe.forEach(function (u) {
      if (u.fips === me.fips) return;
      if (metroMatch && u.metro !== me.metro) return;
      if (sizeMatch && (u.pop < me.pop * 0.35 || u.pop > me.pop * 2.8)) return;
      var total = 0, wsum = 0;
      Object.keys(FEATS).forEach(function (dim) {
        var d2 = 0, n = 0;
        FEATS[dim].forEach(function (k) {
          if (me.z[k] == null || u.z[k] == null) return;
          var d = me.z[k] - u.z[k];
          d2 += d * d; n++;
        });
        if (n) { total += w[dim] * (d2 / n); wsum += w[dim]; }
      });
      if (!wsum) return;
      scored.push({ u: u, dist: Math.sqrt(total / wsum) });
    });
    scored.sort(function (a, b) { return a.dist - b.dist; });
    var peers = scored.slice(0, 8);
    lastResult = { me: me, peers: peers };
    render(me, peers);
  }

  // ---------- render ----------
  function render(me, peers) {
    var esc = G().esc;
    var maxD = peers.length ? peers[peers.length - 1].dist || 1 : 1;

    $('pc-selected').innerHTML =
      '<div style="background:#17140F;color:#F5F4F0;border-radius:4px;padding:26px 28px;">' +
        '<div style="font-family:Archivo,sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#C98A2B;margin-bottom:10px;">Your county</div>' +
        '<h2 style="font-family:Archivo,sans-serif;font-weight:800;font-size:26px;letter-spacing:-.01em;margin:0 0 4px;">' + esc(me.name) + ', ' + esc(me.st) + '</h2>' +
        '<div style="font-size:13px;color:rgba(245,244,240,.6);margin-bottom:16px;">' + (me.metro ? 'Metro county' : 'Non-metro county') + ' · ' + popLabel(me) + '</div>' +
        mini(me, 'rgba(245,244,240,.14)', '#F5F4F0', 'rgba(245,244,240,.6)') +
      '</div>';

    $('pc-peers').innerHTML =
      '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:14px;">' +
        '<h2 style="font-family:Archivo,sans-serif;font-weight:700;font-size:24px;margin:0;">Your ' + peers.length + ' closest peers</h2>' +
        '<span style="font-size:12.5px;color:#8A857B;">Adjust weights above \u2014 results update live</span></div>' +
      peers.map(function (p, i) {
        var sim = Math.max(2, 100 - (p.dist / (maxD * 1.15)) * 100);
        var whyKeys = closest(me, p.u, 2);
        return '<div style="background:#fff;border:1px solid #DDDBD2;border-radius:4px;padding:18px 20px;margin-bottom:10px;">' +
          '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">' +
            '<span style="font-family:Archivo,sans-serif;font-weight:800;font-size:15px;color:#8A857B;min-width:24px;">' + (i + 1) + '</span>' +
            '<div style="flex:1;min-width:180px;"><div style="font-family:Archivo,sans-serif;font-weight:700;font-size:17px;">' + esc(p.u.name) + ', ' + esc(p.u.st) + '</div>' +
            '<div style="font-size:12px;color:#8A857B;">' + popLabel(p.u) + ' · ' + (p.u.metro ? 'metro' : 'non-metro') + ' · closest on: ' + whyKeys.map(function (k) { return LABELS[k].toLowerCase(); }).join(', ') + '</div></div>' +
            '<div style="flex:0 0 130px;"><div style="height:8px;border-radius:999px;background:#EFEEE9;overflow:hidden;"><div style="width:' + sim.toFixed(0) + '%;height:100%;background:#14432F;border-radius:999px;"></div></div>' +
            '<div style="font-size:11px;color:#8A857B;margin-top:4px;text-align:right;">similarity ' + sim.toFixed(0) + '</div></div>' +
          '</div></div>';
      }).join('');

    // comparison table
    var keys = activeKeys().filter(function (k) { return me.f[k] != null && !isNaN(me.f[k]); });
    function fmtVal(k, v) {
      if (v == null || isNaN(v)) return '\u2014';
      if (k === 'mhi') return G().money(v);
      if (k === 'trend') return (v >= 0 ? '+' : '') + v.toFixed(1) + ' pts';
      if (k === 'netGrowth') return (v >= 0 ? '+' : '') + v.toFixed(0) + '%';
      return v.toFixed(1) + '%';
    }
    function med(arr) { if (!arr.length) return null; var s = arr.slice().sort(function (x, y) { return x - y; }); return s[Math.floor(s.length / 2)]; }
    $('pc-table').innerHTML =
      '<div style="background:#fff;border:1px solid #DDDBD2;border-radius:4px;padding:26px 28px;overflow-x:auto;">' +
        '<h3 style="font-family:Archivo,sans-serif;font-weight:700;font-size:20px;margin:0 0 16px;">Indicator comparison</h3>' +
        '<table style="width:100%;border-collapse:collapse;font-size:13.5px;min-width:560px;">' +
          '<thead><tr>' +
            '<th style="text-align:left;padding:9px 10px;border-bottom:2px solid #17140F;font-family:Archivo,sans-serif;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#8A857B;">Indicator</th>' +
            '<th style="text-align:right;padding:9px 10px;border-bottom:2px solid #17140F;font-family:Archivo,sans-serif;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#17140F;">' + esc(me.name) + '</th>' +
            '<th style="text-align:right;padding:9px 10px;border-bottom:2px solid #17140F;font-family:Archivo,sans-serif;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#8A857B;">Peer median</th>' +
            '<th style="text-align:right;padding:9px 10px;border-bottom:2px solid #17140F;font-family:Archivo,sans-serif;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#8A857B;">Peer range</th>' +
          '</tr></thead><tbody>' +
          keys.map(function (k) {
            var vals = peers.map(function (p) { return p.u.f[k]; }).filter(function (v) { return v != null && !isNaN(v); });
            var lo = vals.length ? Math.min.apply(null, vals) : null, hi = vals.length ? Math.max.apply(null, vals) : null;
            return '<tr>' +
              '<td style="padding:9px 10px;border-bottom:1px solid #EFEEE9;color:#57534A;">' + LABELS[k] + '</td>' +
              '<td style="padding:9px 10px;border-bottom:1px solid #EFEEE9;text-align:right;font-weight:700;">' + fmtVal(k, me.f[k]) + '</td>' +
              '<td style="padding:9px 10px;border-bottom:1px solid #EFEEE9;text-align:right;">' + fmtVal(k, med(vals)) + '</td>' +
              '<td style="padding:9px 10px;border-bottom:1px solid #EFEEE9;text-align:right;color:#8A857B;">' + (lo == null ? '\u2014' : fmtVal(k, lo) + ' \u2013 ' + fmtVal(k, hi)) + '</td>' +
            '</tr>';
          }).join('') +
        '</tbody></table></div>';

    $('pc-result').style.display = 'block';
    drawMap(me, peers);
    try { var y = $('pc-result').getBoundingClientRect().top + window.scrollY - 90; window.scrollTo({ top: y, behavior: 'smooth' }); } catch (e) {}

    function mini(c, brd, fg, mut) {
      var rows = [];
      if (c.f.mhi != null) rows.push(['Median HH income', G().money(c.f.mhi)]);
      if (c.f.povRate != null) rows.push(['Poverty', G().pct(c.f.povRate)]);
      if (c.f.unempRate != null) rows.push(['Unemployment', G().pct(c.f.unempRate)]);
      rows.push(['Avg. tract income', G().pct(c.f.avgInc, 0) + ' of area median']);
      rows.push(['LMI tract share', G().pct(c.f.lmiShare, 0)]);
      rows.push(['Income trend since 2020', c.f.trend == null ? '\u2014' : (c.f.trend >= 0 ? '+' : '') + c.f.trend.toFixed(1) + ' pts']);
      return rows.map(function (r) {
        return '<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid ' + brd + ';font-size:13.5px;"><span style="color:' + mut + ';">' + r[0] + '</span><span style="font-weight:700;color:' + fg + ';">' + r[1] + '</span></div>';
      }).join('');
    }
    function popLabel(u) {
      return u.realPop != null ? 'pop. ' + G().fmt(u.realPop) : G().fmt(u.nTracts) + ' census tracts';
    }
  }

  function closest(me, u, n) {
    var all = [];
    activeKeys().forEach(function (k) {
      if (me.z[k] == null || u.z[k] == null) return;
      all.push([k, Math.abs(me.z[k] - u.z[k])]);
    });
    all.sort(function (a, b) { return a[1] - b[1]; });
    return all.slice(0, n).map(function (x) { return x[0]; });
  }

  // ---------- map ----------
  var d3Loaded = null;
  function loadD3() {
    if (d3Loaded) return d3Loaded;
    d3Loaded = new Promise(function (resolve, reject) {
      var n = 0;
      function done() { if (++n === 2) resolve(); }
      ['https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js', 'https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js'].forEach(function (src) {
        var s = document.createElement('script'); s.src = src; s.onload = done; s.onerror = reject; document.head.appendChild(s);
      });
    }).then(function () {
      return fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json').then(function (r) { return r.json(); });
    });
    return d3Loaded;
  }
  function drawMap(me, peers) {
    var canvas = $('pc-map'); if (!canvas) return;
    loadD3().then(function (us) {
      var r = canvas.getBoundingClientRect();
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
      var ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, r.width, r.height);
      var statesGeo = topojson.feature(us, us.objects.states);
      var proj = d3.geoAlbersUsa().fitExtent([[8, 8], [r.width - 8, r.height - 8]], statesGeo);
      var path = d3.geoPath(proj, ctx);
      ctx.beginPath(); path(topojson.mesh(us, us.objects.states)); ctx.strokeStyle = '#DDDBD2'; ctx.lineWidth = 1; ctx.stroke();
      function dot(fips, color, rad) {
        var c = centers && centers.get(fips); if (!c) return;
        var xy = proj([c.lon, c.lat]); if (!xy) return;
        ctx.beginPath(); ctx.arc(xy[0], xy[1], rad, 0, 6.283185);
        ctx.fillStyle = color; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#F5F4F0'; ctx.stroke();
      }
      peers.forEach(function (p) { dot(p.u.fips, '#14432F', 6); });
      dot(me.fips, '#C98A2B', 8);
    }).catch(function () { /* map is decorative; fail quiet */ });
  }
})();
