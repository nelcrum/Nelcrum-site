/* NELCRUM Solutions — Community Needs Brief generator.
 * County (or address → county) → one-page citable needs profile.
 * ACS 2023 5-year (live Census API, cached) + tract-mobility.csv + CBSA spine.
 * Narrative + print are email-gated (nc_needs_unlock), same sheet as other tools.
 */
(function () {
  function $(id) { return document.getElementById(id); }
  function G() { return window.NCGeo; }
  var counties = null, hasACS = false, tracts = null, cbsa = null;
  var current = null; // last rendered brief context

  function ready(cb) { var t = 0; (function p() { if ($('nb-form') && window.NCGeo) return cb(); if (t++ > 800) return; requestAnimationFrame(p); })(); }

  document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'nb-form') { e.preventDefault(); goCounty(); }
  });
  document.addEventListener('click', function (e) {
    if (!e.target || !e.target.closest) return;
    if (e.target.closest('#nb-addr-go')) { e.preventDefault(); goAddress(); }
    if (e.target.closest('#nb-print')) { e.preventDefault(); window.print(); }
    var cp = e.target.closest('#nb-copy');
    if (cp) {
      e.preventDefault();
      var n = $('nb-narrative');
      if (n) { try { navigator.clipboard.writeText(n.innerText); cp.textContent = 'Copied ✓'; setTimeout(function () { cp.textContent = 'Copy narrative'; }, 1800); } catch (err) {} }
    }
  });
  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'nb-state') fillCounties(e.target.value);
  });
  document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'nb-gateform') {
      e.preventDefault();
      var em = $('nb-email') ? $('nb-email').value.trim() : '';
      if (!em || em.indexOf('@') < 1) return;
      G().logLead(em, 'Community Needs Brief', current ? current.title : '');
      try { localStorage.setItem('nc_needs_unlock', '1'); } catch (er) {}
      if (current) renderGateOrFull();
    }
  });

  ready(function () {
    setMsg(spin('Loading county data\u2026'));
    Promise.all([G().loadCounties(), G().loadTracts(), G().loadCBSA()]).then(function (res) {
      counties = res[0].byFips; hasACS = res[0].hasACS; tracts = res[1]; cbsa = res[2];
      setMsg(hasACS ? '' : 'Note: the live Census statistics service is unreachable right now \u2014 briefs will cover tract income mix and mobility; demographic tables return when it reconnects.', !hasACS);
      fillStates();
      var mo = new MutationObserver(function () { fillStates(); });
      if (document.body) mo.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { mo.disconnect(); }, 12000);
    });
  });

  function setMsg(t, err) {
    var m = $('nb-msg'); if (!m) return;
    m.innerHTML = t || '';
    m.style.color = err ? '#F2B8A2' : 'rgba(245,244,240,.6)';
  }
  function spin(t) { return '<span style="display:inline-block;width:13px;height:13px;border:2px solid rgba(245,244,240,.4);border-top-color:#C98A2B;border-radius:50%;animation:nbspin .8s linear infinite;vertical-align:-2px;margin-right:9px;"></span>' + t; }

  function fillStates() {
    var sel = $('nb-state'); if (!sel || sel.options.length > 1) return;
    var names = G().STATE_NAMES;
    sel.innerHTML = '<option value="">Choose a state\u2026</option>' + Object.keys(names).sort(function (a, b) { return names[a] < names[b] ? -1 : 1; }).map(function (ab) {
      return '<option value="' + ab + '">' + names[ab] + '</option>';
    }).join('');
    if (sel.value) fillCounties(sel.value);
  }
  function fillCounties(st) {
    var sel = $('nb-county'); if (!sel) return;
    if (!st) { sel.disabled = true; sel.innerHTML = '<option value="">County\u2026</option>'; return; }
    var fp = G().STATE_FIPS[st], opts = [];
    if (counties) {
      counties.forEach(function (c, fips) { if (fips.slice(0, 2) === fp) opts.push([fips, c.name]); });
    }
    opts.sort(function (a, b) { return a[1] < b[1] ? -1 : 1; });
    sel.innerHTML = '<option value="">County\u2026</option>' + opts.map(function (o) { return '<option value="' + o[0] + '">' + G().esc(o[1]) + '</option>'; }).join('');
    sel.disabled = false;
  }

  function goCounty() {
    var fips = $('nb-county') ? $('nb-county').value : '';
    if (!fips) { setMsg('Pick a state, then a county.', true); return; }
    render(fips, null);
  }
  function goAddress() {
    var q = $('nb-addr') ? $('nb-addr').value.trim() : '';
    if (!q) { setMsg('Enter a street address first.', true); return; }
    setMsg(spin('Geocoding address\u2026'));
    G().geocode(q).then(function (loc) { setMsg(''); render(loc.county, loc); })
      .catch(function () { setMsg('Could not match that address \u2014 add city, state, and ZIP, or pick the county directly.', true); });
  }

  // ---------- brief ----------
  function render(fips, loc) {
    var entry = counties ? counties.get(fips) : null;
    var a = (hasACS && entry && entry.pop != null) ? entry : null;
    var m = tracts ? tracts.counties.get(fips) : null;
    if (!entry && !m) { setMsg('No data available for that county.', true); return; }
    var st = (entry && entry.st) || (m && m.st) || G().FIPS_STATE[fips.slice(0, 2)];
    var stName = G().STATE_NAMES[st] || st;
    var name = entry ? entry.name : 'County FIPS ' + fips;
    var metro = cbsa ? cbsa.get(fips) : null;
    var today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // state medians for comparison
    var peers = [];
    if (hasACS && counties) counties.forEach(function (c2) { if (c2.st === st && c2.mhi != null) peers.push(c2); });
    function median(arr) { if (!arr.length) return null; var s = arr.slice().sort(function (x, y) { return x - y; }); return s[Math.floor(s.length / 2)]; }
    var stMHI = median(peers.map(function (c) { return c.mhi; }).filter(Boolean));
    var stPov = median(peers.map(function (c) { return c.povRate; }).filter(function (v) { return v != null; }));

    var lmiShare = m && m.n ? m.lmi / m.n * 100 : null;
    var avg24 = m && m.n ? m.sum24 / m.n : null;
    var avg20 = m && m.n20 ? m.sum20 / m.n20 : null;
    var trendPts = (avg24 != null && avg20 != null) ? avg24 - avg20 : null;

    var tractLine = '';
    if (loc && tracts) {
      var tr = tracts.byGeoid.get(loc.geoid);
      if (tr) {
        var b = G().band(tr.t24);
        tractLine = '<div style="margin-top:14px;padding:14px 16px;background:#F5F4F0;border-radius:4px;font-size:13.5px;line-height:1.6;color:#404A3D;"><strong>Project site:</strong> ' + G().esc(loc.matched || '') + ' \u2014 census tract ' + G().esc(loc.geoid) + ', a <strong>' + b.label.toLowerCase() + '</strong> tract (' + G().pct(tr.t24, 0) + ' of area median family income)' + (b.lmi ? ', a CRA-qualifying LMI geography' : '') + '.</div>';
      }
    }

    current = { fips: fips, title: name + ', ' + st };

    var stats = [];
    if (a) {
      stats.push(stat('Population', G().fmt(a.pop), 'ACS 2023 5-yr, B01003'));
      stats.push(stat('Median household income', G().money(a.mhi), stMHI ? (a.mhi < stMHI ? G().money(stMHI) + ' state county median' : 'above state county median') : 'ACS B19013'));
      stats.push(stat('Poverty rate', G().pct(a.povRate), stPov != null ? G().pct(stPov, 1) + ' state county median' : 'ACS B17001'));
      stats.push(stat('Unemployment', G().pct(a.unempRate), 'civilian labor force, ACS B23025'));
      stats.push(stat('Bachelor\u2019s degree or higher', G().pct(a.baRate), 'adults 25+, ACS B15003'));
      stats.push(stat('Median gross rent', a.rent ? '$' + G().fmt(a.rent) : 'n/a', 'ACS B25064'));
    }
    if (m) {
      stats.push(stat('Census tracts', G().fmt(m.n), 'FFIEC 2024 vintage'));
      stats.push(stat('Low/moderate-income tracts', G().pct(lmiShare, 0), G().fmt(m.lmi) + ' of ' + G().fmt(m.n) + ' tracts'));
    }

    var doc = $('nb-doc');
    doc.innerHTML =
      '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:14px;flex-wrap:wrap;border-bottom:2px solid #17140F;padding-bottom:18px;margin-bottom:24px;">' +
        '<div><div style="font-family:Archivo,sans-serif;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8A4225;margin-bottom:8px;">Community needs brief</div>' +
        '<h2 style="font-family:Archivo,sans-serif;font-weight:800;font-size:clamp(26px,3vw,36px);letter-spacing:-.02em;line-height:1.05;margin:0;">' + G().esc(name) + ', ' + G().esc(stName) + '</h2>' +
        '<div style="font-size:13px;color:#57534A;margin-top:8px;">' + (metro ? G().esc(metro) + ' metro area' : 'Non-metro (rural) county') + ' · FIPS ' + G().esc(fips) + ' · Prepared ' + today + '</div></div>' +
        '<div style="display:flex;align-items:baseline;gap:8px;"><span style="font-family:Archivo,sans-serif;font-weight:600;font-size:15px;letter-spacing:.14em;">NELCRUM</span><span style="font-family:Archivo,sans-serif;font-size:9px;letter-spacing:.26em;color:#14432F;text-transform:uppercase;">Solutions</span></div>' +
      '</div>' +

      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:26px;">' + stats.join('') + '</div>' +

      (m ? mobilityBlock(m, lmiShare, avg24, avg20, trendPts, st) : '') +
      tractLine +

      '<div style="margin-top:26px;">' +
        '<h3 style="font-family:Archivo,sans-serif;font-weight:700;font-size:17px;margin:0 0 10px;">Narrative summary <span data-noprint style="font-weight:500;font-size:12px;color:#8A857B;">(copy this into your application)</span></h3>' +
        '<div id="nb-narr-wrap"></div>' +
      '</div>' +

      '<div style="margin-top:28px;padding-top:16px;border-top:1px solid #DDDBD2;font-size:11.5px;line-height:1.6;color:#8A857B;">' +
        'Sources: ' + (a ? 'U.S. Census Bureau, American Community Survey 2023 5-year estimates (tables B01003, B19013, B17001, B23025, B15003, B25064); ' : '') + 'FFIEC census tract income designations, 2024 vintage, analyzed by NELCRUM Solutions. Tract income levels reflect median family income as a percent of area (metro or statewide non-metro) median. Generated free at nelcrum.com/needs-brief.html.' +
      '</div>';

    renderNarrative(a, m, name, stName, metro, lmiShare, trendPts, stMHI, stPov);
    renderGateOrFull();

    $('nb-result').style.display = 'block';
    $('nb-explain').style.display = 'none';
    try { var y = $('nb-result').getBoundingClientRect().top + window.scrollY - 90; window.scrollTo({ top: y, behavior: 'smooth' }); } catch (e) {}

    function stat(label, val, sub) {
      return '<div style="border:1px solid #DDDBD2;border-radius:4px;padding:16px 18px;">' +
        '<div style="font-family:Archivo,sans-serif;font-weight:800;font-size:24px;letter-spacing:-.01em;">' + val + '</div>' +
        '<div style="font-size:13px;font-weight:600;color:#17140F;margin-top:5px;">' + label + '</div>' +
        '<div style="font-size:11.5px;color:#8A857B;margin-top:3px;">' + sub + '</div></div>';
    }
  }

  function mobilityBlock(m, lmiShare, avg24, avg20, trendPts, st) {
    var total = m.low + m.mod + m.mid + m.up;
    if (!total) return '';
    var segs = [
      { n: m.low, c: '#C4674A', l: 'Low' }, { n: m.mod, c: '#D99A55', l: 'Moderate' },
      { n: m.mid, c: '#7FAE8F', l: 'Middle' }, { n: m.up, c: '#3F6A55', l: 'Upper' }
    ];
    return '<div style="border:1px solid #DDDBD2;border-radius:4px;padding:20px 22px;margin-bottom:4px;">' +
      '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px;">' +
        '<h3 style="font-family:Archivo,sans-serif;font-weight:700;font-size:17px;margin:0;">Tract income mix &amp; trajectory</h3>' +
        '<span style="font-size:12px;color:#8A857B;">' + (trendPts == null ? '' : 'Avg. tract income ' + (trendPts >= 0 ? 'up ' : 'down ') + Math.abs(trendPts).toFixed(1) + ' pts vs. area median since 2020') + '</span></div>' +
      '<div style="display:flex;height:20px;border-radius:4px;overflow:hidden;">' +
        segs.map(function (s) { return s.n ? '<span title="' + s.l + ': ' + s.n + '" style="width:' + (s.n / total * 100) + '%;background:' + s.c + ';"></span>' : ''; }).join('') + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px 18px;font-size:12px;color:#57534A;margin-top:10px;">' +
        segs.map(function (s) { return '<span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:9px;height:9px;border-radius:3px;background:' + s.c + ';"></span>' + s.l + ' · ' + s.n + '</span>'; }).join('') +
        '<span style="margin-left:auto;">' + m.upCls + ' tracts gaining vs. area median since 2020 · ' + m.dnCls + ' losing ground</span>' +
      '</div></div>';
  }

  function renderNarrative(a, m, name, stName, metro, lmiShare, trendPts, stMHI, stPov) {
    var parts = [];
    parts.push(G().esc(name) + ' is a ' + (metro ? 'county in the ' + G().esc(metro) + ' metropolitan area' : 'non-metropolitan county') + ' of ' + G().esc(stName) + (a ? ' with a population of ' + G().fmt(a.pop) : '') + '.');
    if (a) {
      var below = stMHI && a.mhi && a.mhi < stMHI;
      parts.push('Median household income is ' + G().money(a.mhi) + (stMHI ? (below ? ', below' : ', above') + ' the median for ' + G().esc(stName) + ' counties (' + G().money(stMHI) + ')' : '') + ', and ' + G().pct(a.povRate) + ' of residents live below the federal poverty line' + (stPov != null ? ' (state county median: ' + G().pct(stPov) + ')' : '') + '.');
      parts.push('Unemployment stands at ' + G().pct(a.unempRate) + ' of the civilian labor force, and ' + G().pct(a.baRate) + ' of adults 25 and older hold a bachelor\u2019s degree or higher. Median gross rent is $' + G().fmt(a.rent) + ' per month.');
    }
    if (m && m.n) {
      parts.push('Of the county\u2019s ' + G().fmt(m.n) + ' census tracts, ' + G().fmt(m.lmi) + ' (' + G().pct(lmiShare, 0) + ') are designated low- or moderate-income under FFIEC criteria' +
        (trendPts != null ? ', and average tract income has ' + (trendPts >= 0 ? 'risen' : 'fallen') + ' ' + Math.abs(trendPts).toFixed(1) + ' points relative to the area median since 2020' : '') + '.');
      if (m.dnCls > m.upCls) parts.push('More tracts are losing ground against the area median (' + m.dnCls + ') than gaining (' + m.upCls + '), indicating a community losing economic ground and a strong case for targeted investment.');
      else if (m.upCls > m.dnCls) parts.push('More tracts are gaining against the area median (' + m.upCls + ') than losing ground (' + m.dnCls + '), suggesting momentum that well-placed investment can extend to residents at risk of being left behind.');
    }
    parts.push('Data: U.S. Census Bureau ACS 2023 5-year estimates; FFIEC 2024 tract income designations.');
    window.__nbNarrative = '<p id="nb-narrative" style="font-size:14.5px;line-height:1.7;color:#2B2B26;margin:0;background:#F5F4F0;border-radius:4px;padding:18px 20px;">' + parts.join(' ') + '</p>';
  }

  function renderGateOrFull() {
    var unlocked = false;
    try { unlocked = localStorage.getItem('nc_needs_unlock') === '1'; } catch (e) {}
    var wrap = $('nb-narr-wrap'), gate = $('nb-gate'), actions = $('nb-actions');
    if (!wrap) return;
    if (unlocked) {
      wrap.innerHTML = window.__nbNarrative || '';
      if (gate) gate.innerHTML = '';
      if (actions) actions.innerHTML =
        '<button id="nb-copy" style="font-family:inherit;font-weight:700;font-size:14px;color:#14432F;background:#fff;border:1px solid #DDDBD2;border-radius:4px;padding:11px 18px;cursor:pointer;">Copy narrative</button>' +
        '<button id="nb-print" style="font-family:inherit;font-weight:700;font-size:14px;color:#fff;background:#14432F;border:none;border-radius:4px;padding:11px 18px;cursor:pointer;">Print / save as PDF</button>';
    } else {
      wrap.innerHTML = '<div style="position:relative;">' +
        '<p style="font-size:14.5px;line-height:1.7;color:#2B2B26;margin:0;background:#F5F4F0;border-radius:4px;padding:18px 20px;filter:blur(5px);user-select:none;">' + 'The narrative summary weaves every statistic above into a citable paragraph you can paste directly into a needs statement, with state comparisons and the mobility trend included. Unlock it with your email below. '.repeat(3) + '</p></div>';
      if (actions) actions.innerHTML = '';
      if (gate) gate.innerHTML =
        '<div style="background:#EEF3E9;border:1px solid #DDDBD2;border-radius:4px;padding:24px 26px;">' +
          '<div style="font-family:Archivo,sans-serif;font-weight:700;font-size:19px;margin-bottom:6px;">Unlock the written narrative + print</div>' +
          '<p style="font-size:14px;line-height:1.6;color:#57534A;margin:0 0 16px;">The statistics are free. Enter your email to unlock the copy-ready narrative paragraph and the print/PDF export \u2014 and we\u2019ll send occasional tools and funding insights (no spam).</p>' +
          '<form id="nb-gateform" style="display:flex;gap:10px;flex-wrap:wrap;">' +
            '<input id="nb-email" type="email" required placeholder="you@organization.org" style="flex:1 1 240px;font-family:inherit;font-size:15px;border:1px solid #DDDBD2;border-radius:4px;padding:12px 14px;outline:none;">' +
            '<button type="submit" style="font-family:inherit;font-weight:700;font-size:15px;color:#fff;background:#14432F;border:none;border-radius:4px;padding:12px 22px;cursor:pointer;">Unlock the brief</button>' +
          '</form></div>';
    }
  }
})();
