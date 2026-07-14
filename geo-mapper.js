/* NELCRUM Solutions — Portfolio Geography Mapper.
 * Paste grantees (Name | address, or Name | County, ST) → pins over county LMI
 * concentration, coverage stats, and a funding-desert gap table.
 * All processing client-side; addresses geocoded by the U.S. Census Bureau.
 */
(function () {
  function $(id) { return document.getElementById(id); }
  function G() { return window.NCGeo; }
  var counties = null, tracts = null, centers = null;
  var last = null; // {pins, unmatched, footprint}

  var SAMPLE = [
    'Westside Futures Fund | Fulton County, GA',
    'River Valley Initiative | Bibb County, GA',
    'Coastal Empire Housing | Chatham County, GA',
    'Northwest Georgia Works | Whitfield County, GA',
    'Piedmont Health Collaborative | Richmond County, GA',
    'Appalachian Craft Alliance | Fannin County, GA',
    'Delta Family Services | Dougherty County, GA',
    'Sandhills Opportunity Center | Richland County, SC',
    'Lowcountry Land Trust | Charleston County, SC',
    'Black Belt Growers Cooperative | Dallas County, AL'
  ].join('\n');

  function ready(cb) { var t = 0; (function p() { if ($('gm-form') && window.NCGeo) return cb(); if (t++ > 800) return; requestAnimationFrame(p); })(); }

  document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'gm-form') { e.preventDefault(); go(); }
  });
  document.addEventListener('click', function (e) {
    if (!e.target || !e.target.closest) return;
    if (e.target.closest('#gm-sample')) { e.preventDefault(); if ($('gm-input')) { $('gm-input').value = SAMPLE; } go(); }
  });

  ready(function () {
    Promise.all([G().loadCounties(), G().loadTracts(), G().loadCenters()]).then(function (res) {
      counties = res[0].byFips; tracts = res[1]; centers = res[2];
    });
  });

  function setMsg(t, err) {
    var m = $('gm-msg'); if (!m) return;
    m.innerHTML = t || '';
    m.style.color = err ? '#F2B8A2' : 'rgba(245,244,240,.6)';
  }
  function spin(t) { return '<span style="display:inline-block;width:13px;height:13px;border:2px solid rgba(245,244,240,.4);border-top-color:#C98A2B;border-radius:50%;animation:gmspin .8s linear infinite;vertical-align:-2px;margin-right:9px;"></span>' + t; }

  // ---------- resolve one line ----------
  function countyByName(text) {
    if (!counties) return null;
    var m = text.match(/^(.+?)(?:\s+county)?\s*,\s*([A-Za-z]{2})$/i);
    if (!m) return null;
    var want = m[1].trim().toLowerCase(), st = m[2].toUpperCase();
    var hit = null;
    counties.forEach(function (c, fips) {
      if (hit || c.st !== st) return;
      var base = c.name.toLowerCase().replace(/\s+(county|parish|borough|census area|city and borough|municipality|city)$/i, '');
      if (base === want || c.name.toLowerCase() === want) hit = { fips: fips, label: c.name + ', ' + st };
    });
    return hit;
  }

  function resolveLine(line) {
    var name = line, locStr = line;
    var bar = line.indexOf('|');
    if (bar >= 0) { name = line.slice(0, bar).trim(); locStr = line.slice(bar + 1).trim(); }
    else {
      var cm = line.indexOf(',');
      if (cm > 0) name = line.slice(0, cm).trim();
    }
    if (!locStr) return Promise.resolve({ name: name, ok: false, reason: 'empty location' });

    // "County, ST" (local, instant)
    var c = countyByName(locStr);
    if (c) {
      var ctr = centers && centers.get(c.fips);
      if (ctr) return Promise.resolve({ name: name, ok: true, lon: ctr.lon, lat: ctr.lat, county: c.fips, label: c.label, kind: 'county' });
    }
    // street address → Census geocoder
    return G().geocode(locStr).then(function (loc) {
      return { name: name, ok: true, lon: loc.lon, lat: loc.lat, county: loc.county, geoid: loc.geoid, label: loc.matched, kind: 'address' };
    }).catch(function () {
      return { name: name, ok: false, reason: 'could not geocode \u201c' + locStr.slice(0, 60) + '\u201d' };
    });
  }

  // ---------- main ----------
  function go() {
    var raw = $('gm-input') ? $('gm-input').value : '';
    var lines = raw.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).slice(0, 60);
    if (!lines.length) { setMsg('Paste at least one grantee line first, or try the sample.', true); return; }
    if (!tracts || !centers) { setMsg('Still loading base data \u2014 try again in a second.', true); return; }

    var pins = [], unmatched = [], i = 0;
    setMsg(spin('Locating 0 / ' + lines.length + '\u2026'));
    (function next() {
      if (i >= lines.length) { finish(pins, unmatched); return; }
      var idx = i++;
      resolveLine(lines[idx]).then(function (r) {
        if (r.ok) pins.push(r); else unmatched.push(r);
        setMsg(spin('Locating ' + (pins.length + unmatched.length) + ' / ' + lines.length + '\u2026'));
        setTimeout(next, r.kind === 'address' ? 120 : 0); // gentle on the geocoder
      });
    })();
  }

  function lmiShare(fips) {
    var m = tracts.counties.get(fips);
    return m && m.n ? m.lmi / m.n * 100 : null;
  }

  function finish(pins, unmatched) {
    if (!pins.length) { setMsg('None of the lines could be located. Use \u201cName | street address, city, ST ZIP\u201d or \u201cName | County, ST\u201d.', true); return; }
    setMsg('');
    var states = {};
    var inLMIcounty = 0, shares = [];
    pins.forEach(function (p) {
      var st = G().FIPS_STATE[p.county.slice(0, 2)];
      if (st) states[st] = 1;
      var s = lmiShare(p.county);
      p.share = s;
      if (s != null) { shares.push(s); if (s >= 40) inLMIcounty++; }
      // tract-level check for address pins
      if (p.geoid) {
        var tr = tracts.byGeoid.get(p.geoid);
        if (tr) p.tractLMI = G().band(tr.t24).lmi;
      }
    });
    var tractKnown = pins.filter(function (p) { return p.tractLMI != null; });
    var tractLMIn = tractKnown.filter(function (p) { return p.tractLMI; }).length;
    shares.sort(function (a, b) { return a - b; });
    var medShare = shares.length ? shares[Math.floor(shares.length / 2)] : null;

    // gaps: high-LMI counties in footprint states with no pin within 60 miles
    var footprint = Object.keys(states);
    var gaps = [];
    tracts.counties.forEach(function (c, fips) {
      if (footprint.indexOf(c.st) < 0) return;
      if (c.n < 8) return;
      var share = c.lmi / c.n * 100;
      if (share < 40) return;
      var ctr = centers.get(fips); if (!ctr) return;
      var nearest = Infinity;
      pins.forEach(function (p) { var d = G().distMi(p.lat, p.lon, ctr.lat, ctr.lon); if (d < nearest) nearest = d; });
      if (nearest > 60) gaps.push({ fips: fips, st: c.st, share: share, n: c.n, lmi: c.lmi, dist: nearest });
    });
    gaps.sort(function (a, b) { return b.share - a.share; });
    gaps = gaps.slice(0, 10);

    last = { pins: pins, unmatched: unmatched, footprint: footprint };

    // stats
    $('gm-stats').innerHTML =
      stat(G().fmt(pins.length), 'Grantees mapped', unmatched.length ? unmatched.length + ' unmatched' : 'all lines located') +
      stat(footprint.length, 'States in footprint', footprint.sort().join(', ') || '\u2014') +
      stat(G().pct(pins.length ? inLMIcounty / pins.length * 100 : null, 0), 'In high-LMI counties', '40%+ LMI tract share') +
      (tractKnown.length ? stat(tractLMIn + ' of ' + tractKnown.length, 'Address pins in LMI tracts', 'tract-level, where addresses given') : stat(G().pct(medShare, 0), 'Median county LMI share', 'across your pins')) +
      stat(G().fmt(gaps.length), 'Funding deserts found', 'high-need, no grantee within 60 mi');

    // unmatched
    $('gm-unmatched').innerHTML = unmatched.length ?
      '<div style="margin-top:14px;background:#FCF6EC;border:1px solid #E2CDB6;border-radius:4px;padding:14px 18px;font-size:13px;color:#8A4225;">Could not locate: ' + unmatched.map(function (u) { return G().esc(u.name); }).join(' · ') + '. Use \u201cName | street address, city, ST ZIP\u201d or \u201cName | County, ST\u201d.</div>' : '';

    // gap table
    $('gm-gaps').innerHTML =
      '<div style="background:#fff;border:1px solid #DDDBD2;border-radius:4px;padding:26px 28px;overflow-x:auto;">' +
        '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;">' +
          '<h3 style="font-family:Archivo,sans-serif;font-weight:700;font-size:20px;margin:0;">Funding deserts in your footprint</h3>' +
          '<span style="font-size:12.5px;color:#8A857B;">Counties with 40%+ LMI tracts and no grantee within 60 miles</span></div>' +
        (gaps.length ?
          '<table style="width:100%;border-collapse:collapse;font-size:13.5px;min-width:560px;">' +
            '<thead><tr>' + ['County', 'State', 'LMI tracts', 'LMI share', 'Nearest grantee'].map(function (h, i) {
              return '<th style="text-align:' + (i > 1 ? 'right' : 'left') + ';padding:9px 10px;border-bottom:2px solid #17140F;font-family:Archivo,sans-serif;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#8A857B;">' + h + '</th>';
            }).join('') + '</tr></thead><tbody>' +
            gaps.map(function (g) {
              var a = counties ? counties.get(g.fips) : null;
              return '<tr>' +
                '<td style="padding:9px 10px;border-bottom:1px solid #EFEEE9;font-weight:600;">' + G().esc(a ? a.name : 'FIPS ' + g.fips) + '</td>' +
                '<td style="padding:9px 10px;border-bottom:1px solid #EFEEE9;color:#57534A;">' + g.st + '</td>' +
                '<td style="padding:9px 10px;border-bottom:1px solid #EFEEE9;text-align:right;">' + g.lmi + ' of ' + g.n + '</td>' +
                '<td style="padding:9px 10px;border-bottom:1px solid #EFEEE9;text-align:right;font-weight:700;color:#8A2E1F;">' + g.share.toFixed(0) + '%</td>' +
                '<td style="padding:9px 10px;border-bottom:1px solid #EFEEE9;text-align:right;color:#57534A;">' + Math.round(g.dist) + ' mi</td>' +
              '</tr>';
            }).join('') + '</tbody></table>' :
          '<p style="font-size:14px;color:#57534A;margin:0;">No uncovered high-LMI counties in your footprint states at the 60-mile screen \u2014 strong geographic coverage.</p>') +
      '</div>';

    $('gm-result').style.display = 'block';
    drawMap(pins, footprint);
    try { var y = $('gm-result').getBoundingClientRect().top + window.scrollY - 90; window.scrollTo({ top: y, behavior: 'smooth' }); } catch (e) {}

    function stat(v, l, sub) {
      return '<div style="background:#fff;border:1px solid #DDDBD2;border-radius:4px;padding:18px 20px;">' +
        '<div style="font-family:Archivo,sans-serif;font-weight:800;font-size:26px;letter-spacing:-.01em;">' + v + '</div>' +
        '<div style="font-size:13px;font-weight:600;margin-top:5px;">' + l + '</div>' +
        '<div style="font-size:11.5px;color:#8A857B;margin-top:3px;">' + sub + '</div></div>';
    }
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
  function shareColor(s) {
    if (s == null) return '#EFEDE6';
    if (s >= 40) return '#B04A3C';
    if (s >= 25) return '#D9A05B';
    if (s >= 12) return '#E0C79E';
    return '#E5DFD2';
  }
  function drawMap(pins, footprint) {
    var canvas = $('gm-map'); if (!canvas) return;
    loadD3().then(function (us) {
      var r = canvas.getBoundingClientRect();
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
      var ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, r.width, r.height);

      var statesGeo = topojson.feature(us, us.objects.states);
      // zoom to footprint states if few, else nation
      var FIPS = G().STATE_FIPS;
      var fit = statesGeo;
      if (footprint.length && footprint.length <= 8) {
        var want = footprint.map(function (ab) { return FIPS[ab]; });
        var feats = statesGeo.features.filter(function (f) { return want.indexOf(f.id) >= 0; });
        if (feats.length) fit = { type: 'FeatureCollection', features: feats };
      }
      var proj = d3.geoAlbersUsa().fitExtent([[14, 14], [r.width - 14, r.height - 14]], fit);
      var path = d3.geoPath(proj, ctx);

      // county LMI dots
      ctx.globalAlpha = 0.85;
      tracts.counties.forEach(function (c, fips) {
        var ctr = centers.get(fips); if (!ctr) return;
        var xy = proj([ctr.lon, ctr.lat]); if (!xy) return;
        var s = c.n ? c.lmi / c.n * 100 : null;
        var rad = Math.max(2, Math.min(9, Math.sqrt(c.n) * 0.55));
        ctx.beginPath(); ctx.arc(xy[0], xy[1], rad, 0, 6.283185);
        ctx.fillStyle = shareColor(s); ctx.fill();
      });
      ctx.globalAlpha = 1;

      // state borders
      ctx.beginPath(); path(topojson.mesh(us, us.objects.states)); ctx.strokeStyle = '#B9B5A8'; ctx.lineWidth = 1; ctx.stroke();

      // pins
      pins.forEach(function (p) {
        var xy = proj([p.lon, p.lat]); if (!xy) return;
        ctx.beginPath(); ctx.arc(xy[0], xy[1], 7, 0, 6.283185);
        ctx.fillStyle = '#C98A2B'; ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = '#17140F'; ctx.stroke();
      });
    }).catch(function () {});
  }
})();
