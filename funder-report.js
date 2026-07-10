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
    if (e.target && e.target.id === 'fr-form') { e.preventDefault(); var q = $('fr-q'); run(q ? q.value.trim() : ''); }
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

  function run(query) {
    if (!query) { setMsg('Enter a foundation name or EIN.', true); return; }
    setMsg('<span style="display:inline-block;width:13px;height:13px;border:2px solid rgba(245,244,240,.4);border-top-color:#C98A2B;border-radius:50%;animation:frspin .8s linear infinite;vertical-align:-2px;"></span> Pulling IRS 990 filings...');
    var ein = query.replace(/[^0-9]/g, '');
    var url = ENDPOINT + (ein.length === 9 ? '?action=funder&ein=' + ein : '?action=funder&q=' + encodeURIComponent(query));
    fetch(url).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.organizations && !d.organization) { pickList(d.organizations); return; }
      if (d && d.organization) { setMsg(''); render(d); return; }
      throw new Error('no data');
    }).catch(function () {
      setMsg('Could not reach the live IRS data service yet (the proxy may not be deployed). Showing a sample report so you can see the format.', true);
      render(SAMPLE);
    });
  }

  function pickList(orgs) {
    setMsg('');
    $('fr-results').style.display = 'block';
    var h = '<div style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#8A857B; margin-bottom:14px;">Select an organization</div>';
    h += '<div style="display:flex; flex-direction:column; gap:8px;">';
    orgs.slice(0, 8).forEach(function (o) {
      h += '<button data-ein="' + esc(o.ein) + '" class="fr-pick" style="text-align:left; cursor:pointer; background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:14px 16px; font-family:inherit;"><span style="font-weight:700; font-size:15px; color:#17140F;">' + esc(o.name) + '</span><br><span style="font-size:12.5px; color:#8A857B;">' + esc(o.city || '') + (o.state ? ', ' + esc(o.state) : '') + ' &middot; EIN ' + esc(o.ein) + '</span></button>';
    });
    h += '</div>';
    $('fr-picker').innerHTML = h;
    $('fr-teaser').innerHTML = ''; $('fr-gate').innerHTML = ''; $('fr-full').innerHTML = ''; $('fr-full').style.display = 'none';
    var btns = document.querySelectorAll('.fr-pick');
    for (var i = 0; i < btns.length; i++) { btns[i].addEventListener('click', function () { run(this.getAttribute('data-ein')); }); }
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

    var series = fils.slice(0, 5).reverse().map(function (f) { var g = pick(f, GIVE_KEYS); if (g == null) g = pick(f, ['totfuncexpns']); return { y: f.tax_prd_yr, v: g || 0 }; });
    var max = Math.max.apply(null, series.map(function (s) { return s.v; }).concat([1]));
    h += '<div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:22px 24px; margin-bottom:26px;">';
    h += '<div style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#8A857B; margin-bottom:16px;">' + (givingIsEst ? 'Annual outlay trend' : 'Giving trend') + '</div>';
    h += '<div style="display:flex; align-items:flex-end; gap:14px; height:120px;">';
    series.forEach(function (s) {
      var pct = Math.round(s.v / max * 100);
      h += '<div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:8px;"><div style="font-family:Archivo,sans-serif; font-size:11px; font-weight:700; color:#14432F;">' + money(s.v) + '</div><div style="width:100%; background:#C98A2B; border-radius:3px 3px 0 0; height:' + Math.max(pct, 3) + '%;"></div><div style="font-size:11px; color:#8A857B;">' + s.y + '</div></div>';
    });
    h += '</div></div>';
    $('fr-teaser').innerHTML = h;

    buildGate(d, fils, givingIsEst);
    try { var y = res.getBoundingClientRect().top + window.scrollY - 120; window.scrollTo({ top: y, behavior: 'smooth' }); } catch (e) {}
  }

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
    if (pdfs && pdfs.length) {
      h += '<div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:24px 26px; margin-top:16px;"><div style="font-family:Archivo,sans-serif; font-weight:700; font-size:20px; margin-bottom:14px;">Original 990 filings</div><div style="display:flex; flex-wrap:wrap; gap:8px;">';
      pdfs.slice(0, 12).forEach(function (p) { if (p.pdf_url) h += '<a href="' + esc(p.pdf_url) + '" target="_blank" rel="noopener" style="text-decoration:none; font-family:Archivo,sans-serif; font-weight:600; font-size:13px; color:#14432F; border:1px solid #DDDBD2; border-radius:4px; padding:8px 13px;">' + (p.tax_prd_yr || '990') + ' PDF &#8599;</a>'; });
      h += '</div></div>';
    }
    h += '<div style="display:flex; flex-wrap:wrap; align-items:center; gap:16px 24px; background:#17140F; color:#F5F4F0; border-radius:4px; padding:26px 30px; margin-top:16px;"><div style="flex:1; min-width:260px;"><div style="font-family:Archivo,sans-serif; font-weight:700; font-size:19px; margin-bottom:5px;">Want a tailored funder shortlist?</div><div style="font-size:14px; line-height:1.55; color:rgba(245,244,240,.72);">We build prospect lists matched to your mission, budget, and geography, with the case for support to win them.</div></div><a href="contact.html" style="text-decoration:none; background:#C98A2B; color:#17140F; padding:13px 22px; border-radius:4px; font-family:Archivo,sans-serif; font-weight:700; font-size:14.5px; white-space:nowrap;">Book a consultation &#8594;</a></div>';
    full.innerHTML = h;
  }
})();
