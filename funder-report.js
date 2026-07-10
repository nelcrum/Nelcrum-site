/* NELCRUM Solutions — Funder Intelligence Report (Phase 1)
 * Pulls public IRS Form 990 data (via the Google Apps Script proxy that
 * fetches ProPublica server-side) and summarizes a funder's giving, assets,
 * and multi-year trend. Full report is email-gated. Falls back to a labeled
 * sample when the proxy is unreachable.
 */
(function () {
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycby6VPp5kEWJupRvJH2xRvs5D14CEGQvxaMR3kDFH43WTTv69_DL3ZesS8NFKdTxvMgFGg/exec';

  var NTEE = { A: 'Arts & culture', B: 'Education', C: 'Environment', D: 'Animal welfare', E: 'Health', F: 'Mental health & crisis', G: 'Disease & disorders', H: 'Medical research', I: 'Crime & legal', J: 'Employment', K: 'Food & agriculture', L: 'Housing & shelter', M: 'Public safety & disaster', N: 'Recreation & sports', O: 'Youth development', P: 'Human services', Q: 'International', R: 'Civil rights & advocacy', S: 'Community & economic development', T: 'Philanthropy & grantmaking', U: 'Science & technology', V: 'Social science', W: 'Public & societal benefit', X: 'Religion', Y: 'Mutual benefit', Z: 'Unknown' };

  var GIVE_KEYS = ['grntspdpbks', 'grntspd', 'contrpdpbks', 'grcontrgifts'];

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function money(n) {
    if (n == null || isNaN(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + n;
  }
  function pick(f, keys) {
    for (var i = 0; i < keys.length; i++) { var v = f[keys[i]]; if (v != null && v !== '') return Number(v); }
    return null;
  }
  function ready(cb) { var t = 0; (function p() { if ($('fr-form')) return cb(); if (t++ > 600) return; requestAnimationFrame(p); })(); }

  var STATES = [['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming']];
  function fillStates() {
    var sel = $('fr-state'); if (!sel || sel.options.length > 1) return;
    sel.innerHTML = '<option value="">All states</option>' + STATES.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + '</option>'; }).join('');
  }
  ready(function () {
    fillStates();
    var mo = new MutationObserver(function () { fillStates(); });
    if (document.body) mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { mo.disconnect(); }, 12000);
  });

  var SAMPLE = {
    sample: true,
    organization: { name: 'Example Family Foundation', ein: '000000000', city: 'Atlanta', state: 'GA', ntee_code: 'S20', subsection_code: 3 },
    filings_with_data: [
      { tax_prd_yr: 2022, totrevenue: 14200000, totfuncexpns: 9800000, totassetsend: 132000000, grntspdpbks: 8100000 },
      { tax_prd_yr: 2021, totrevenue: 11900000, totfuncexpns: 9100000, totassetsend: 121000000, grntspdpbks: 7400000 },
      { tax_prd_yr: 2020, totrevenue: 9700000, totfuncexpns: 8300000, totassetsend: 108000000, grntspdpbks: 6900000 },
      { tax_prd_yr: 2019, totrevenue: 10400000, totfuncexpns: 7600000, totassetsend: 112000000, grntspdpbks: 6300000 }
    ],
    filings_without_data: []
  };

  // Bind via document-level delegation so handlers survive support.js
  // re-mounting the <x-dc> template (which replaces #fr-form / #fr-sample).
  document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'fr-form') { e.preventDefault(); doSearch(); }
  });
  document.addEventListener('click', function (e) {
    var s = e.target && e.target.closest ? e.target.closest('#fr-sample') : null;
    if (s) { e.preventDefault(); render(SAMPLE); }
  });

  function setMsg(t, err) {
    var m = $('fr-msg'); if (!m) return;
    m.innerHTML = t || '';
    m.style.color = err ? '#F2B8A2' : 'rgba(245,244,240,.6)';
  }

  // Entry from the search form: read name + state + program-area filters and
  // resolve to either a single org (exact EIN) or a picker of partial matches.
  function doSearch() {
    var q = $('fr-q') ? $('fr-q').value.trim() : '';
    var state = $('fr-state') ? $('fr-state').value : '';
    var ntee = $('fr-ntee') ? $('fr-ntee').value : '';
    var ein = q.replace(/[^0-9]/g, '');
    if (ein.length === 9) { run(ein); return; }
    if (!q && !state && !ntee) { setMsg('Enter a name or EIN, or pick a state or program area.', true); return; }
    setMsg('<span style="display:inline-block;width:13px;height:13px;border:2px solid rgba(245,244,240,.4);border-top-color:#C98A2B;border-radius:50%;animation:frspin .8s linear infinite;vertical-align:-2px;"></span> Searching IRS records...');
    var url = ENDPOINT + '?action=funder&q=' + encodeURIComponent(q) + (state ? '&state=' + state : '') + (ntee ? '&ntee=' + ntee : '');
    fetch(url).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.organizations && d.organizations.length) { pickList(d.organizations, d); return; }
      if (d && d.organization) { setMsg(''); render(d); return; }
      setMsg('No organizations matched. Try fewer words, a different spelling, or widen the filters.', true);
    }).catch(function () {
      setMsg('Could not reach the live IRS data service yet (the proxy may not be deployed). Showing a sample report so you can see the format.', true);
      render(SAMPLE);
    });
  }

  function run(query) {
    if (!query) { setMsg('Enter a foundation name or EIN.', true); return; }
    setMsg('<span style="display:inline-block;width:13px;height:13px;border:2px solid rgba(245,244,240,.4);border-top-color:#C98A2B;border-radius:50%;animation:frspin .8s linear infinite;vertical-align:-2px;"></span> Pulling IRS 990 filings...');
    var ein = query.replace(/[^0-9]/g, '');
    var url = ENDPOINT + (ein.length === 9 ? '?action=funder&ein=' + ein : '?action=funder&q=' + encodeURIComponent(query));
    fetch(url).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.organizations && !d.organization) { pickList(d.organizations, d); return; }
      if (d && d.organization) { setMsg(''); render(d); return; }
      throw new Error('no data');
    }).catch(function () {
      setMsg('Could not reach the live IRS data service yet (the proxy may not be deployed). Showing a sample report so you can see the format.', true);
      render(SAMPLE);
    });
  }

  function pickList(orgs, d) {
    setMsg('');
    $('fr-results').style.display = 'block';
    var total = (d && d.total_results) || orgs.length;
    var shown = Math.min(orgs.length, 25);
    var h = '<div style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#8A857B; margin-bottom:14px;">' + (total > shown ? shown + ' of ' + total + ' matches \u00b7 refine your search to narrow' : total + ' match' + (total === 1 ? '' : 'es')) + '</div>';
    h += '<div style="display:flex; flex-direction:column; gap:8px;">';
    orgs.slice(0, 25).forEach(function (o) {
      h += '<button data-ein="' + esc(o.ein) + '" class="fr-pick" style="text-align:left; cursor:pointer; background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:14px 16px; font-family:inherit;"><span style="font-weight:700; font-size:15px; color:#17140F;">' + esc(o.name) + '</span><br><span style="font-size:12.5px; color:#8A857B;">' + esc(o.city || '') + (o.state ? ', ' + esc(o.state) : '') + ' &middot; EIN ' + esc(o.ein) + '</span></button>';
    });
    h += '</div>';
    $('fr-picker').innerHTML = h;
    $('fr-teaser').innerHTML = ''; $('fr-gate').innerHTML = ''; $('fr-full').innerHTML = ''; $('fr-full').style.display = 'none';
    var btns = document.querySelectorAll('.fr-pick');
    for (var i = 0; i < btns.length; i++) { btns[i].addEventListener('click', function () { run(this.getAttribute('data-ein')); }); }
    try { var y = $('fr-results').getBoundingClientRect().top + window.scrollY - 120; window.scrollTo({ top: y, behavior: 'smooth' }); } catch (e) {}
  }

  function card(label, val, sub) {
    return '<div style="background:#17140F; color:#F5F4F0; border-radius:4px; padding:18px;"><div style="font-family:Archivo,sans-serif; font-weight:800; font-size:26px; letter-spacing:-.02em; line-height:1;">' + val + '</div><div style="font-size:12px; color:#C98A2B; margin:8px 0 2px; font-weight:600;">' + label + '</div><div style="font-size:11.5px; color:rgba(245,244,240,.55);">' + sub + '</div></div>';
  }

  function render(d) {
    var org = d.organization || {};
    var fils = (d.filings_with_data || []).slice().sort(function (a, b) { return b.tax_prd_yr - a.tax_prd_yr; });
    var res = $('fr-results'); res.style.display = 'block'; $('fr-picker').innerHTML = '';
    var cat = org.ntee_code ? (NTEE[String(org.ntee_code).charAt(0)] || 'Other') : 'Not classified';
    var latest = fils[0] || {};
    var giving = pick(latest, GIVE_KEYS);
    var givingIsEst = giving == null;
    if (giving == null) giving = pick(latest, ['totfuncexpns']);
    var yr = latest.tax_prd_yr || 'recent';
    var sampleTag = d.sample ? '<span style="margin-left:10px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#A2643F; background:#F3E4DA; border:1px solid #E2CDB6; padding:3px 9px; border-radius:4px;">Sample</span>' : '';

    var h = '';
    h += '<div style="display:flex; align-items:baseline; gap:8px; margin-bottom:18px;"><span style="font-family:Archivo,sans-serif; font-weight:800; font-size:15px; letter-spacing:.12em; color:#17140F;">NELCRUM</span><span style="font-family:Archivo,sans-serif; font-size:9px; letter-spacing:.24em; text-transform:uppercase; color:#C98A2B;">Solutions</span><span style="font-size:11px; color:#8A857B; margin-left:6px;">Funder Intelligence Report</span></div>';
    h += '<h2 style="font-family:Archivo,sans-serif; font-weight:700; font-size:clamp(24px,3vw,34px); letter-spacing:-.02em; margin:0 0 6px;">' + esc(org.name || 'Funder') + sampleTag + '</h2>';
    h += '<div style="font-size:14px; color:#57534A; margin-bottom:28px;">' + esc([org.city, org.state].filter(Boolean).join(', ')) + (org.ein && org.ein !== '000000000' ? ' &middot; EIN ' + esc(org.ein) : '') + ' &middot; ' + esc(cat) + '</div>';

    h += '<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:14px; margin-bottom:26px;">';
    h += card(givingIsEst ? 'Annual outlay (est.)' : 'Grants paid, latest', money(giving), 'FY ' + yr);
    h += card('Total assets', money(pick(latest, ['totassetsend'])), 'end of year');
    h += card('Total revenue', money(pick(latest, ['totrevenue'])), 'FY ' + yr);
    h += card('Total expenses', money(pick(latest, ['totfuncexpns'])), 'FY ' + yr);
    h += '</div>';

    h += '<div id="fr-chart"></div>';
    $('fr-teaser').innerHTML = h;
    window.__frEst = givingIsEst;
    compare = [{ name: org.name || 'This funder', ein: (org.ein && org.ein !== '000000000') ? org.ein : '', series: seriesOf(fils), color: PALETTE[0] }];
    renderChart();

    buildGate(d, fils, givingIsEst);
    try { var y = res.getBoundingClientRect().top + window.scrollY - 120; window.scrollTo({ top: y, behavior: 'smooth' }); } catch (e) {}
  }

  var PALETTE = ['#C98A2B', '#14432F', '#4E6B43', '#B04A3C', '#2A6FDB'];
  var compare = [];

  function seriesOf(fils) {
    return (fils || []).slice().sort(function (a, b) { return a.tax_prd_yr - b.tax_prd_yr; })
      .map(function (f) { var g = pick(f, GIVE_KEYS); if (g == null) g = pick(f, ['totfuncexpns']); return { y: +f.tax_prd_yr, v: g || 0 }; })
      .filter(function (p) { return p.y; });
  }

  function renderChart() {
    var box = $('fr-chart'); if (!box) return;
    var W = 760, H = 280, padL = 56, padR = 18, padT = 18, padB = 34;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var years = [];
    compare.forEach(function (c) { c.series.forEach(function (p) { if (years.indexOf(p.y) < 0) years.push(p.y); }); });
    years.sort(function (a, b) { return a - b; });
    var maxV = 1;
    compare.forEach(function (c) { c.series.forEach(function (p) { if (p.v > maxV) maxV = p.v; }); });
    function xFor(y) { return years.length <= 1 ? padL + plotW / 2 : padL + (years.indexOf(y) / (years.length - 1)) * plotW; }
    function yFor(v) { return padT + plotH - (v / maxV) * plotH; }

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%; height:auto; display:block;" font-family="Archivo, sans-serif">';
    for (var g = 0; g <= 4; g++) {
      var gv = maxV * g / 4, gy = yFor(gv);
      svg += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="#EDEBE4" stroke-width="1"/>';
      svg += '<text x="' + (padL - 8) + '" y="' + (gy + 3) + '" text-anchor="end" font-size="10" fill="#8A857B">' + money(gv) + '</text>';
    }
    years.forEach(function (y) { svg += '<text x="' + xFor(y) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="10" fill="#8A857B">' + y + '</text>'; });
    compare.forEach(function (c) {
      var pts = c.series.filter(function (p) { return years.indexOf(p.y) >= 0; });
      if (pts.length > 1) {
        var d = pts.map(function (p) { return xFor(p.y) + ',' + yFor(p.v); }).join(' ');
        svg += '<polyline points="' + d + '" fill="none" stroke="' + c.color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
      }
      pts.forEach(function (p) { svg += '<circle cx="' + xFor(p.y) + '" cy="' + yFor(p.v) + '" r="3.5" fill="' + c.color + '"/>'; });
    });
    svg += '</svg>';

    var legend = '<div style="display:flex; flex-wrap:wrap; gap:8px 14px; margin-top:14px;">';
    compare.forEach(function (c, i) {
      legend += '<span style="display:inline-flex; align-items:center; gap:7px; font-size:13px; color:#17140F; background:#F5F4F0; border:1px solid #DDDBD2; border-radius:4px; padding:5px 10px;"><span style="width:11px; height:11px; border-radius:2px; background:' + c.color + '; flex:none;"></span>' + esc(c.name) + (i > 0 ? ' <button data-fr-rm="' + i + '" title="Remove" style="border:none; background:none; cursor:pointer; color:#8A857B; font-size:15px; line-height:1; padding:0 0 0 4px;">&times;</button>' : '') + '</span>';
    });
    legend += '</div>';

    var ctrl;
    if (compare.length < 5) {
      ctrl = '<form id="fr-cmpform" style="display:flex; gap:8px; flex-wrap:wrap; margin-top:16px; max-width:520px;"><input id="fr-cmp" type="text" placeholder="Add an organization to compare (name or EIN)" style="flex:1; min-width:220px; font-family:inherit; font-size:14px; padding:11px 13px; border:1.5px solid #DDDBD2; border-radius:4px; background:#fff;"><button id="fr-add" type="submit" style="font-family:inherit; font-weight:700; font-size:14px; color:#17140F; background:#C98A2B; border:none; border-radius:4px; padding:11px 18px; cursor:pointer;">Add</button></form><div id="fr-cmpmsg" style="font-size:12.5px; color:#8A857B; margin-top:8px; min-height:14px;"></div>';
    } else {
      ctrl = '<div style="font-size:12.5px; color:#8A857B; margin-top:14px;">Comparing the maximum of 5 organizations. Remove one to add another.</div>';
    }

    box.innerHTML = '<div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:22px 24px; margin-bottom:26px;"><div style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#8A857B; margin-bottom:16px;">Annual giving / outlay over time</div>' + svg + legend + ctrl + '</div>';
  }

  function addOrg(query) {
    query = (query || '').trim();
    if (!query || compare.length >= 5) return;
    var msg = $('fr-cmpmsg'); if (msg) msg.textContent = 'Loading...';
    var ein = query.replace(/[^0-9]/g, '');
    var url = ENDPOINT + (ein.length === 9 ? '?action=funder&ein=' + ein : '?action=funder&q=' + encodeURIComponent(query));
    fetch(url).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.organization && d.organizations && d.organizations[0]) { addOrg(d.organizations[0].ein); return; }
      if (!d.organization) throw new Error('no org');
      if (compare.some(function (c) { return c.ein && c.ein === d.organization.ein; })) { if (msg) msg.textContent = 'That organization is already on the chart.'; return; }
      compare.push({ name: d.organization.name || 'Funder', ein: d.organization.ein || '', series: seriesOf(d.filings_with_data || []), color: PALETTE[compare.length % PALETTE.length] });
      renderChart();
    }).catch(function () { var m = $('fr-cmpmsg'); if (m) m.textContent = 'Could not load that organization. Try its 9-digit EIN.'; });
  }

  document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'fr-cmpform') { e.preventDefault(); addOrg($('fr-cmp') ? $('fr-cmp').value : ''); }
  });
  document.addEventListener('click', function (e) {
    var rm = e.target && e.target.closest ? e.target.closest('[data-fr-rm]') : null;
    if (rm) { e.preventDefault(); var i = +rm.getAttribute('data-fr-rm'); if (i > 0 && i < compare.length) { compare.splice(i, 1); renderChart(); } }
  });

  function buildGate(d, fils, givingIsEst) {
    var done = false; try { done = localStorage.getItem('nc_funder_unlock') === '1'; } catch (e) {}
    var gate = $('fr-gate');
    if (done) { gate.innerHTML = ''; showFull(d, fils, givingIsEst); return; }
    $('fr-full').style.display = 'none'; $('fr-full').innerHTML = '';
    gate.innerHTML = '<div style="background:#EEF3E9; border:1px solid #DDDBD2; border-radius:4px; padding:24px 26px;"><div style="font-family:Archivo,sans-serif; font-weight:700; font-size:20px; margin-bottom:6px;">Get the full funder report</div><div style="font-size:14px; line-height:1.55; color:#57534A; margin-bottom:16px; max-width:60ch;">Year-by-year financials and links to every original 990 filing. Enter your email to unlock it.</div><form id="fr-gateform" style="display:flex; gap:10px; flex-wrap:wrap;"><input id="fr-email" type="email" required placeholder="you@org.com" style="flex:1; min-width:220px; font-family:inherit; font-size:15px; padding:13px 15px; border:1.5px solid #DDDBD2; border-radius:4px; background:#fff;"><button type="submit" style="font-family:inherit; font-weight:700; font-size:15px; color:#fff; background:#14432F; border:none; border-radius:4px; padding:13px 22px; cursor:pointer;">Unlock report</button></form></div>';
    $('fr-gateform').addEventListener('submit', function (e) {
      e.preventDefault();
      var em = $('fr-email').value.trim();
      if (em.indexOf('@') < 1) { $('fr-email').style.borderColor = '#B04A3C'; return; }
      try {
        var body = new URLSearchParams({ name: '', email: em, organization: (d.organization && d.organization.name) || '', message: 'Funder Intelligence Report unlock: ' + ((d.organization && d.organization.name) || ''), submittedAt: new Date().toISOString(), source: 'Funder Intelligence Report' });
        fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
      } catch (err) {}
      try { localStorage.setItem('nc_funder_unlock', '1'); } catch (e2) {}
      gate.innerHTML = '';
      showFull(d, fils, givingIsEst);
    });
  }

  function showFull(d, fils, givingIsEst) {
    var full = $('fr-full'); full.style.display = 'block';
    var pdfs = d.filings_without_data || [];
    var rows = fils.map(function (f) {
      var g = pick(f, GIVE_KEYS); if (g == null) g = pick(f, ['totfuncexpns']);
      var td = 'padding:11px 10px; border-top:1px solid #EDEBE4; text-align:right; font-variant-numeric:tabular-nums;';
      return '<tr><td style="padding:11px 10px; border-top:1px solid #EDEBE4; font-family:Archivo,sans-serif; font-weight:700; font-variant-numeric:tabular-nums;">' + (f.tax_prd_yr || 'n/a') + '</td><td style="' + td + '">' + money(pick(f, ['totrevenue'])) + '</td><td style="' + td + '">' + money(pick(f, ['totfuncexpns'])) + '</td><td style="' + td + '">' + money(g) + '</td><td style="' + td + '">' + money(pick(f, ['totassetsend'])) + '</td></tr>';
    }).join('');
    var h = '<div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:24px 26px; margin-top:4px;">';
    h += '<div style="font-family:Archivo,sans-serif; font-weight:700; font-size:20px; margin-bottom:16px;">Year-by-year filings</div>';
    h += '<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:13.5px; color:#2B2A25; min-width:520px;"><thead><tr style="text-align:right; font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#8A857B;"><th style="text-align:left; padding:0 10px 8px;">Year</th><th style="padding:0 10px 8px;">Revenue</th><th style="padding:0 10px 8px;">Expenses</th><th style="padding:0 10px 8px;">Grants/outlay</th><th style="padding:0 10px 8px;">Assets</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    if (givingIsEst) h += '<div style="font-size:12px; color:#8A857B; margin-top:12px; line-height:1.5;">Grants figure shown is total functional expenses as a proxy; the exact grants-paid line appears on the Form 990-PF. Open a filing below to verify.</div>';
    h += '</div>';
    h += '<div id="fr-grants"></div>';
    if (pdfs && pdfs.length) {
      h += '<div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:24px 26px; margin-top:16px;"><div style="font-family:Archivo,sans-serif; font-weight:700; font-size:20px; margin-bottom:14px;">Original 990 filings</div><div style="display:flex; flex-wrap:wrap; gap:8px;">';
      pdfs.slice(0, 12).forEach(function (p) { if (p.pdf_url) h += '<a href="' + esc(p.pdf_url) + '" target="_blank" rel="noopener" style="text-decoration:none; font-family:Archivo,sans-serif; font-weight:600; font-size:13px; color:#14432F; border:1px solid #DDDBD2; border-radius:4px; padding:8px 13px;">' + (p.tax_prd_yr || '990') + ' PDF &#8599;</a>'; });
      h += '</div></div>';
    }
    h += '<div style="display:flex; flex-wrap:wrap; align-items:center; gap:16px 24px; background:#17140F; color:#F5F4F0; border-radius:4px; padding:26px 30px; margin-top:16px;"><div style="flex:1; min-width:260px;"><div style="font-family:Archivo,sans-serif; font-weight:700; font-size:19px; margin-bottom:5px;">Want a tailored funder shortlist?</div><div style="font-size:14px; line-height:1.55; color:rgba(245,244,240,.72);">We build prospect lists matched to your mission, budget, and geography, with the case for support to win them.</div></div><a href="contact.html" style="text-decoration:none; background:#C98A2B; color:#17140F; padding:13px 22px; border-radius:4px; font-family:Archivo,sans-serif; font-weight:700; font-size:14.5px; white-space:nowrap;">Book a consultation &#8594;</a></div>';
    full.innerHTML = h;
    var ein = (d.organization && d.organization.ein) || '';
    if (!d.sample && /^[0-9]{9}$/.test(ein)) loadGrants(ein);
  }

  // Lazy-load the real grant records + estimated program-area split for a funder.
  function loadGrants(ein) {
    var slot = $('fr-grants'); if (!slot) return;
    slot.innerHTML = '<div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:24px 26px; margin-top:16px; color:#57534A; font-size:14px;"><span style="display:inline-block;width:13px;height:13px;border:2px solid #EDEBE4;border-top-color:#C98A2B;border-radius:50%;animation:frspin .8s linear infinite;vertical-align:-2px;margin-right:8px;"></span>Reading the funder\u2019s grant records from its e-file 990...</div>';
    fetch(ENDPOINT + '?action=grants&ein=' + ein).then(function (r) { return r.json(); }).then(function (g) {
      if (!g || g.error || !g.grantCount) { slot.innerHTML = grantsUnavailable(g); return; }
      slot.innerHTML = grantsPanel(g);
    }).catch(function () { slot.innerHTML = grantsUnavailable(null); });
  }

  function grantsUnavailable(g) {
    var note = (g && g.note) ? g.note : 'Grant-level detail is not available for this funder yet. It appears when the funder has a machine-readable e-file 990 with itemized grants.';
    return '<div style="background:#FAF7F1; border:1px solid #E2D7C4; border-radius:4px; padding:20px 24px; margin-top:16px;"><div style="font-family:Archivo,sans-serif; font-weight:700; font-size:16px; margin-bottom:6px;">Where the money goes</div><div style="font-size:13.5px; line-height:1.55; color:#8A857B;">' + esc(note) + '</div></div>';
  }

  function grantsPanel(g) {
    var COLORS = ['#C98A2B', '#14432F', '#4E6B43', '#B04A3C', '#2A6FDB', '#8A6D3B', '#6B7B43', '#A2643F', '#3B6B6B', '#7A5C8A', '#8A857B'];
    var maxA = (g.byNtee[0] && g.byNtee[0].amt) || 1;
    var h = '<div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:24px 26px; margin-top:16px;">';
    h += '<div style="display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:6px;"><div style="font-family:Archivo,sans-serif; font-weight:700; font-size:20px;">Where the money goes</div><div style="font-size:12px; color:#8A857B;">' + money(g.grantTotal) + ' across ' + g.grantCount.toLocaleString() + ' grants \u00b7 FY ' + (g.year || '') + '</div></div>';
    h += '<div style="font-size:12.5px; color:#8A857B; margin-bottom:18px; line-height:1.5;">Program areas are estimated by classifying each grant\u2019s stated purpose. Recipient names and amounts below are exact, taken directly from the funder\u2019s IRS e-file 990.</div>';
    g.byNtee.forEach(function (n, i) {
      h += '<div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;"><div style="width:180px; font-size:13px; color:#17140F; flex:none;">' + esc(n.label) + '</div><div style="flex:1; background:#F0EEE7; border-radius:3px; height:16px; overflow:hidden;"><div style="height:100%; width:' + Math.max(Math.round(n.amt / maxA * 100), 2) + '%; background:' + COLORS[i % COLORS.length] + ';"></div></div><div style="width:74px; text-align:right; font-family:Archivo,sans-serif; font-weight:700; font-size:13px; color:#14432F; flex:none;">' + money(n.amt) + '</div><div style="width:40px; text-align:right; font-size:12px; color:#8A857B; flex:none;">' + n.pct + '%</div></div>';
    });
    h += '</div>';
    if (g.topGrants && g.topGrants.length) {
      h += '<div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:24px 26px; margin-top:16px;"><div style="font-family:Archivo,sans-serif; font-weight:700; font-size:20px; margin-bottom:14px;">Largest grants, most recent year</div><div style="display:flex; flex-direction:column;">';
      g.topGrants.forEach(function (gr, i) {
        h += '<div style="display:flex; align-items:baseline; gap:14px; padding:11px 0; ' + (i ? 'border-top:1px solid #EDEBE4;' : '') + '"><div style="flex:1; min-width:0;"><div style="font-weight:700; font-size:14px; color:#17140F;">' + esc(gr.name) + '</div>' + (gr.purpose ? '<div style="font-size:12.5px; color:#8A857B; line-height:1.45; margin-top:2px;">' + esc(gr.purpose) + '</div>' : '') + '</div><div style="font-family:Archivo,sans-serif; font-weight:700; font-size:14px; color:#14432F; white-space:nowrap; font-variant-numeric:tabular-nums;">' + money(gr.amt) + '</div></div>';
      });
      h += '</div></div>';
    }
    return h;
  }
})();
