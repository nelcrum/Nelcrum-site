/* NELCRUM Solutions — CRA & LMI Policy Dashboard
 * Address or GEOID → tract CRA income level + LMI flag, trend, county/state context.
 * Runs on tract-mobility.csv (FFIEC 2024 vintage) + Census geocoder + local CBSA spine.
 */
(function () {
  function $(id) { return document.getElementById(id); }
  function G() { return window.NCGeo; }
  var esc, band;

  function ready(cb) { var t = 0; (function p() { if ($('cc-form') && window.NCGeo) return cb(); if (t++ > 800) return; requestAnimationFrame(p); })(); }

  document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'cc-form') { e.preventDefault(); go($('cc-q') ? $('cc-q').value.trim() : ''); }
  });
  document.addEventListener('click', function (e) {
    var r = e.target && e.target.closest ? e.target.closest('[data-cc-recent]') : null;
    if (r) { e.preventDefault(); if ($('cc-q')) $('cc-q').value = r.getAttribute('data-cc-recent'); go(r.getAttribute('data-cc-recent')); }
  });

  ready(function () {
    esc = G().esc; band = G().band;
    G().loadTracts(); // warm the cache
    renderRecent();
    var mo = new MutationObserver(function () { if ($('cc-recent') && !$('cc-recent').hasChildNodes()) renderRecent(); });
    if (document.body) mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { mo.disconnect(); }, 12000);
  });

  function setMsg(t, err) {
    var m = $('cc-msg'); if (!m) return;
    m.innerHTML = t || '';
    m.style.color = err ? '#F2B8A2' : 'rgba(245,244,240,.6)';
  }
  function spinner(t) { return '<span style="display:inline-block;width:13px;height:13px;border:2px solid rgba(245,244,240,.4);border-top-color:#C98A2B;border-radius:50%;animation:ccspin .8s linear infinite;vertical-align:-2px;margin-right:9px;"></span>' + t; }

  // ---------- recent lookups ----------
  function recents() { try { return JSON.parse(localStorage.getItem('nc_cra_recent') || '[]'); } catch (e) { return []; } }
  function pushRecent(q) {
    var r = recents().filter(function (x) { return x !== q; });
    r.unshift(q); r = r.slice(0, 4);
    try { localStorage.setItem('nc_cra_recent', JSON.stringify(r)); } catch (e) {}
    renderRecent();
  }
  function renderRecent() {
    var el = $('cc-recent'); if (!el) return;
    var r = recents();
    el.innerHTML = r.length ? '<span style="font-size:12px;color:rgba(245,244,240,.45);align-self:center;">Recent:</span>' + r.map(function (q) {
      return '<a href="#" data-cc-recent="' + esc(q) + '" style="font-size:12.5px;color:rgba(245,244,240,.75);border:1px solid rgba(245,244,240,.22);border-radius:999px;padding:5px 12px;text-decoration:none;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(q) + '</a>';
    }).join('') : '';
  }

  // ---------- main flow ----------
  function go(q) {
    if (!q) { setMsg('Enter a street address or an 11-digit tract GEOID.', true); return; }
    var digits = q.replace(/[^0-9]/g, '');
    setMsg(spinner(digits.length === 11 && digits === q.trim() ? 'Looking up tract…' : 'Geocoding address with the U.S. Census Bureau…'));
    var p;
    if (/^[0-9]{11}$/.test(q.trim())) {
      p = Promise.resolve({ geoid: q.trim(), county: q.trim().slice(0, 5), matched: null, tractName: 'Tract ' + q.trim().slice(5) });
    } else {
      p = G().geocode(q);
    }
    Promise.all([p, G().loadTracts(), G().loadCBSA(), G().loadCounties()])
      .then(function (res) {
        var loc = res[0], data = res[1], cbsa = res[2], counties = res[3].byFips;
        var rec = data.byGeoid.get(loc.geoid);
        if (!rec) { setMsg('That location resolved to tract ' + esc(loc.geoid) + ', which is outside the 44 states in this dataset. <a href="index.html#contact" style="color:#C98A2B;">Ask us to run it manually</a>.', true); return; }
        setMsg('');
        pushRecent(q);
        render(q, loc, rec, data, cbsa, counties);
      })
      .catch(function (err) {
        if (err && err.message === 'NOMATCH') setMsg('The Census geocoder could not match that address. Try adding city, state, and ZIP, or paste the 11-digit tract GEOID instead.', true);
        else setMsg('Lookup failed (the Census geocoder may be temporarily unreachable). Try again in a moment, or paste a tract GEOID.', true);
      });
  }

  // ---------- render ----------
  function render(q, loc, rec, data, cbsa, counties) {
    var b24 = band(rec.t24), b20 = band(rec.t20);
    var county = data.counties.get(loc.county);
    var state = county ? data.states.get(county.st) : null;
    var stAb = county ? county.st : G().FIPS_STATE[loc.geoid.slice(0, 2)];
    var metro = cbsa.get(loc.county) || null;

    // gauge: position of tmfi on 0–160 scale with band cutoffs
    function gaugePos(v) { return Math.max(0, Math.min(100, (v / 160) * 100)); }
    var segs = [
      { w: (50 / 160) * 100, c: '#C4674A', l: 'Low · under 50%' },
      { w: (30 / 160) * 100, c: '#D99A55', l: 'Moderate · 50–80%' },
      { w: (40 / 160) * 100, c: '#7FAE8F', l: 'Middle · 80–120%' },
      { w: (40 / 160) * 100, c: '#3F6A55', l: 'Upper · 120%+' }
    ];
    var gauge = '<div style="margin-top:22px;">' +
      '<div style="position:relative;height:14px;border-radius:999px;overflow:hidden;display:flex;">' + segs.map(function (s) { return '<span style="width:' + s.w + '%;background:' + s.c + ';"></span>'; }).join('') + '</div>' +
      '<div style="position:relative;height:0;">' +
        '<div style="position:absolute;left:' + gaugePos(rec.t24) + '%;top:-22px;transform:translateX(-50%);width:3px;height:30px;background:#17140F;border-radius:2px;"></div>' +
        (isNaN(rec.t20) ? '' : '<div title="2020" style="position:absolute;left:' + gaugePos(rec.t20) + '%;top:-19px;transform:translateX(-50%);width:2px;height:24px;background:#8A857B;border-radius:2px;opacity:.7;"></div>') +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;font-size:11.5px;color:#8A857B;margin-top:10px;"><span>0%</span><span>50%</span><span>80%</span><span>120%</span><span>160%+</span></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px 18px;font-size:12px;color:#57534A;margin-top:10px;">' + segs.map(function (s) { return '<span style="display:inline-flex;align-items:center;gap:7px;"><span style="width:9px;height:9px;border-radius:3px;background:' + s.c + ';"></span>' + s.l + '</span>'; }).join('') +
      '<span style="display:inline-flex;align-items:center;gap:7px;"><span style="width:3px;height:12px;background:#17140F;border-radius:2px;"></span>This tract, 2024</span>' +
      '<span style="display:inline-flex;align-items:center;gap:7px;"><span style="width:2px;height:12px;background:#8A857B;border-radius:2px;"></span>2020</span></div></div>';

    var moved = (!isNaN(rec.t20) && b20.key !== b24.key);
    var delta = (!isNaN(rec.t20) && !isNaN(rec.t24)) ? rec.t24 - rec.t20 : null;

    $('cc-verdict').innerHTML =
      '<div data-stack style="display:grid;grid-template-columns:1.25fr 1fr;gap:20px;">' +
        // big verdict
        '<div style="background:#fff;border:1px solid #DDDBD2;border-radius:4px;padding:32px;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px;">' +
            '<span style="font-family:Archivo,sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8A857B;">CRA income level · 2024 FFIEC vintage</span>' +
            '<span style="font-size:12px;color:#8A857B;">Tract ' + esc(loc.geoid) + '</span>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;">' +
            '<span style="font-family:Archivo,sans-serif;font-weight:800;font-size:clamp(30px,3.4vw,44px);letter-spacing:-.02em;color:' + b24.color + ';">' + b24.label + '</span>' +
            '<span style="font-size:13px;font-weight:700;color:' + (b24.lmi ? '#3F7A55' : '#57534A') + ';background:' + (b24.lmi ? '#E6F1E9' : '#EFEEE9') + ';border-radius:4px;padding:7px 14px;">' + (b24.lmi ? 'LMI tract — CRA-qualifying geography' : 'Not an LMI tract') + '</span>' +
          '</div>' +
          '<p style="font-size:15px;line-height:1.6;color:#57534A;margin:16px 0 0;">Median family income here is <strong>' + G().pct(rec.t24) + '</strong> of the area median' + (metro ? ' for ' + esc(metro) : '') + '.' +
          (delta == null ? '' : (moved ?
            ' Since 2020 the tract moved from <strong>' + b20.label.toLowerCase() + '</strong> to <strong>' + b24.label.toLowerCase() + '</strong> (' + (delta > 0 ? '+' : '') + delta.toFixed(1) + ' pts).' :
            ' It was ' + G().pct(rec.t20) + ' in 2020 (' + (delta > 0 ? '+' : '') + delta.toFixed(1) + ' pts), staying ' + b24.label.toLowerCase() + '.')) +
          (rec.cls ? ' Our mobility classification: <strong>' + esc(rec.cls) + '</strong>.' : '') + '</p>' +
          gauge +
        '</div>' +
        // location facts
        '<div style="display:flex;flex-direction:column;gap:14px;">' +
          card('Location', (loc.matched ? '<div style="font-size:15px;font-weight:600;color:#17140F;margin-bottom:8px;">' + esc(loc.matched) + '</div>' : '') +
            row('Census tract', esc(loc.geoid)) +
            row('County', countyLabel(loc.county, stAb)) +
            row('Metro area', metro ? esc(metro) : 'Non-metro / rural balance') +
            row('State', esc(G().STATE_NAMES[stAb] || stAb))) +
          (county ? card('County context — ' + countyLabel(loc.county, stAb),
            row('Tracts in county', G().fmt(county.n)) +
            row('LMI tracts', G().fmt(county.lmi) + ' (' + G().pct(county.n ? county.lmi / county.n * 100 : null, 0) + ')') +
            row('Avg. tract income', G().pct(county.n ? county.sum24 / county.n : null, 0) + ' of area median') +
            row('Tracts gaining vs. area median', G().fmt(county.upCls)) +
            row('Tracts losing ground', G().fmt(county.dnCls))) : '') +
        '</div>' +
      '</div>';

    // policy layers
    $('cc-layers').innerHTML =
      '<div style="margin-top:20px;background:#fff;border:1px solid #DDDBD2;border-radius:4px;padding:26px 28px;">' +
        '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px;">' +
          '<h3 style="font-family:Archivo,sans-serif;font-weight:700;font-size:20px;margin:0;">Place-based policy layers</h3>' +
          '<span style="font-size:12.5px;color:#8A857B;">One address, every designation that moves capital</span>' +
        '</div>' +
        '<div data-stack style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">' +
          layer(true, 'CRA — LMI geography', b24.lmi ? 'Qualifies' : 'Does not qualify', b24.lmi ? 'Activity here can count toward a bank\u2019s Community Reinvestment Act obligations.' : 'This tract is ' + b24.label.toLowerCase() + '; CRA credit would need another basis (e.g. LMI individuals served).', b24.lmi) +
          layer(false, 'Opportunity Zone', 'Layer in development', 'Designated QOZ status for capital-gains-driven investment. Coming to this dashboard.', null) +
          layer(false, 'NMTC — Low-Income Community', 'Layer in development', 'New Markets Tax Credit qualification (80% AMI or 20% poverty test). Coming to this dashboard.', null) +
        '</div>' +
      '</div>';

    // state context histogram
    if (state) {
      var bandsMeta = [
        { l: 'Low', c: '#C4674A' }, { l: 'Moderate', c: '#D99A55' }, { l: 'Middle', c: '#7FAE8F' }, { l: 'Upper', c: '#3F6A55' }
      ];
      var maxB = Math.max.apply(null, state.bands);
      var idx = b24.key === 'low' ? 0 : b24.key === 'moderate' ? 1 : b24.key === 'middle' ? 2 : 3;
      $('cc-context').innerHTML =
        '<div style="margin-top:20px;background:#fff;border:1px solid #DDDBD2;border-radius:4px;padding:26px 28px;">' +
          '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:6px;">' +
            '<h3 style="font-family:Archivo,sans-serif;font-weight:700;font-size:20px;margin:0;">Where this tract sits in ' + esc(G().STATE_NAMES[stAb] || stAb) + '</h3>' +
            '<span style="font-size:12.5px;color:#8A857B;">' + G().fmt(state.n) + ' tracts statewide · ' + G().pct(state.n ? state.lmi / state.n * 100 : null, 0) + ' LMI</span>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;align-items:end;height:150px;margin-top:18px;">' +
          state.bands.map(function (n, i) {
            var h = maxB ? Math.max(6, n / maxB * 100) : 6;
            return '<div style="display:flex;flex-direction:column;justify-content:flex-end;height:100%;gap:8px;">' +
              '<div style="font-size:12.5px;font-weight:700;color:#57534A;text-align:center;">' + G().fmt(n) + '</div>' +
              '<div style="height:' + h + '%;background:' + bandsMeta[i].c + ';border-radius:4px 4px 0 0;' + (i === idx ? 'outline:3px solid #17140F;outline-offset:2px;' : 'opacity:.55;') + '"></div>' +
              '<div style="font-size:12px;color:' + (i === idx ? '#17140F' : '#8A857B') + ';font-weight:' + (i === idx ? '700' : '500') + ';text-align:center;">' + bandsMeta[i].l + (i === idx ? ' · this tract' : '') + '</div>' +
            '</div>';
          }).join('') +
          '</div>' +
        '</div>';
    } else { $('cc-context').innerHTML = ''; }

    // what this means
    $('cc-meaning').innerHTML =
      '<div data-stack style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px;">' +
        '<div style="background:#EEF3E9;border:1px solid #DDDBD2;border-radius:4px;padding:26px 28px;">' +
          '<h3 style="font-family:Archivo,sans-serif;font-weight:700;font-size:18px;margin:0 0 10px;">What this means</h3>' +
          '<p style="font-size:14.5px;line-height:1.65;color:#404A3D;margin:0;">' + meaning(b24, moved, b20, rec) + '</p>' +
        '</div>' +
        '<div style="background:#17140F;color:#F5F4F0;border-radius:4px;padding:26px 28px;display:flex;flex-direction:column;gap:14px;justify-content:center;">' +
          '<h3 style="font-family:Archivo,sans-serif;font-weight:700;font-size:18px;margin:0;">Need this across a whole footprint?</h3>' +
          '<p style="font-size:14px;line-height:1.6;color:rgba(245,244,240,.72);margin:0;">We run batch screens, CRA assessment-area analyses, and custom eligibility dashboards for banks, CDFIs, and agencies.</p>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap;"><a href="index.html#contact" style="text-decoration:none;background:#C98A2B;color:#17140F;padding:12px 20px;border-radius:4px;font-size:14px;font-weight:700;">Book a consultation</a>' +
          '<a href="geo-mapper.html" style="text-decoration:none;color:#F5F4F0;border:1px solid rgba(245,244,240,.34);padding:12px 20px;border-radius:4px;font-size:14px;font-weight:700;">Map a portfolio &rarr;</a></div>' +
        '</div>' +
      '</div>';

    $('cc-result').style.display = 'block';
    $('cc-explain').style.display = 'none';
    try { var y = $('cc-result').getBoundingClientRect().top + window.scrollY - 90; window.scrollTo({ top: y, behavior: 'smooth' }); } catch (e) {}

    function card(title, inner) {
      return '<div style="background:#fff;border:1px solid #DDDBD2;border-radius:4px;padding:22px 24px;flex:1;">' +
        '<div style="font-family:Archivo,sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8A857B;margin-bottom:12px;">' + title + '</div>' + inner + '</div>';
    }
    function row(k, v) {
      return '<div style="display:flex;justify-content:space-between;gap:14px;padding:7px 0;border-bottom:1px solid #EFEEE9;font-size:13.5px;"><span style="color:#8A857B;">' + k + '</span><span style="font-weight:600;color:#17140F;text-align:right;">' + v + '</span></div>';
    }
    function layer(live, name, status, desc, yes) {
      var chip = live ?
        '<span style="font-size:11.5px;font-weight:700;color:' + (yes ? '#3F7A55' : '#8A4225') + ';background:' + (yes ? '#E6F1E9' : '#F6E3DC') + ';border-radius:4px;padding:4px 10px;">' + status + '</span>' :
        '<span style="font-size:11.5px;font-weight:700;color:#A2643F;border:1px solid #E2CDB6;border-radius:4px;padding:3px 10px;">' + status + '</span>';
      return '<div style="border:1px ' + (live ? 'solid #DDDBD2' : 'dashed #DCCDB4') + ';border-radius:4px;padding:18px;' + (live ? '' : 'background:#FCFCFA;') + '">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;"><span style="font-family:Archivo,sans-serif;font-weight:700;font-size:14.5px;">' + name + '</span>' + chip + '</div>' +
        '<p style="font-size:13px;line-height:1.55;color:#57534A;margin:0;">' + desc + '</p></div>';
    }
    function countyLabel(fips, st) {
      var c = counties && counties.get(fips);
      return c ? esc(c.name) + (st ? ', ' + esc(st) : '') : 'FIPS ' + esc(fips) + (st ? ' · ' + esc(st) : '');
    }
  }

  function meaning(b, moved, b20, rec) {
    if (b.lmi) {
      return 'This is a CRA-qualifying geography. Bank loans, investments, and services here can earn Community Reinvestment Act consideration, and many federal and philanthropic place-based programs use the same low- and moderate-income test. ' +
        (moved ? 'Note the tract changed bands since 2020 (' + b20.label.toLowerCase() + ' \u2192 ' + b.label.toLowerCase() + '), so re-verify at each exam cycle.' : 'The designation has been stable since 2020.') +
        ' Cite the tract GEOID and the 2024 FFIEC vintage in any memo or application.';
    }
    return 'This tract is ' + b.label.toLowerCase() + ', so it does not qualify as an LMI geography on its own. CRA credit is still possible on other bases: lending to LMI borrowers, small businesses, or community development activity that serves nearby LMI tracts. ' +
      (rec.cls === 'Real Decline' ? 'The tract is in real income decline since 2020, which is worth flagging in needs assessments even without the designation.' : 'Check adjacent tracts \u2014 LMI geographies often border middle-income ones.');
  }
})();
