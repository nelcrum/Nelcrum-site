/* NELCRUM — Funder-Fit Finder. Six questions -> ranked funder archetypes.
 * Pure client-side. Results email-gated. Delegation-bound so it survives
 * support.js re-mounting the template. */
(function () {
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycby6VPp5kEWJupRvJH2xRvs5D14CEGQvxaMR3kDFH43WTTv69_DL3ZesS8NFKdTxvMgFGg/exec';
  var KEY = 'nc_funderfit_unlock';
  function $(id){ return document.getElementById(id); }

  var ARCH = {
    community: { name: 'Community foundation', want: 'A clear local need, your board and budget, and evidence you are rooted in the community you serve.' },
    national:  { name: 'National / private foundation', want: 'A theory of change, outcome evidence, and tight alignment to their published funding priorities.' },
    gov:       { name: 'Government / public grants', want: 'Compliance capacity, measurable outputs, and the systems to manage and report on restricted funds.' },
    cra:       { name: 'CRA-motivated bank', want: 'Activity in low-to-moderate-income areas, a community-development purpose, and measurable local reach.' },
    corp:      { name: 'Corporate / sponsorship', want: 'Brand-aligned visibility, an audience, and a simple sponsorship menu with clear benefits.' },
    impact:    { name: 'Impact investor / CDFI', want: 'A repayment story: reliable cash flow, use of funds, and collateral or a guarantee, plus mission return.' }
  };

  var Q = [
    { q: 'What is your geographic reach?', o: [
      ['A single city or neighborhood', {community:3, cra:2}],
      ['Regional or statewide', {community:2, gov:2, national:1}],
      ['National', {national:3, corp:1}],
      ['International', {national:2, impact:1}] ] },
    { q: 'What are you primarily seeking?', o: [
      ['General operating support', {community:3, national:1}],
      ['Program or project funding', {national:2, gov:3}],
      ['Capital, a facility, or a loan', {impact:3, cra:2}],
      ['Event or campaign sponsorship', {corp:3}] ] },
    { q: 'What is your annual operating budget?', o: [
      ['Under $250K', {community:3, corp:1}],
      ['$250K to $1M', {community:2, gov:2, national:1}],
      ['$1M to $5M', {national:2, gov:1, impact:1}],
      ['Over $5M', {national:2, impact:2, cra:1}] ] },
    { q: 'Can your organization repay borrowed capital?', o: [
      ['No, we rely on grants and gifts', {community:2, national:2, gov:1}],
      ['Somewhat, we have some earned revenue', {impact:2, corp:1}],
      ['Yes, we have reliable earned revenue', {impact:3, cra:2}] ] },
    { q: 'Who or where do you primarily serve?', o: [
      ['A low-income or underserved community', {cra:3, community:2, gov:1}],
      ['A specific issue or population nationally', {national:3}],
      ['A broad or general audience', {corp:2, community:1}] ] },
    { q: 'What stage is your organization in?', o: [
      ['Grassroots or just starting', {community:3, corp:1}],
      ['Established and steady', {national:2, gov:2}],
      ['Scaling or running an enterprise', {impact:2, cra:1, national:1}] ] }
  ];

  var state = {};

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest && t.closest('#ff-start')) { e.preventDefault(); renderForm(); return; }
    var opt = t.closest && t.closest('[data-ffq]');
    if (opt) { var qi = +opt.getAttribute('data-ffq'), oi = +opt.getAttribute('data-ffo'); state[qi] = oi; paintSel(); return; }
    if (t.closest && t.closest('#ff-submit')) { e.preventDefault(); submit(); return; }
  });
  document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'ff-gateform') { e.preventDefault(); unlock(); }
  });

  function sec(){ return '<div style="max-width:820px; margin:0 auto; padding:clamp(40px,6vw,72px) 0;">'; }

  function renderForm() {
    var h = sec();
    Q.forEach(function (item, qi) {
      h += '<div style="margin-bottom:30px;">';
      h += '<div style="font-family:Archivo,sans-serif; font-weight:700; font-size:clamp(18px,2.2vw,22px); margin-bottom:14px;"><span style="color:#C98A2B; font-variant-numeric:tabular-nums; margin-right:10px;">' + (qi + 1) + '</span>' + item.q + '</div>';
      h += '<div style="display:flex; flex-direction:column; gap:8px;">';
      item.o.forEach(function (o, oi) {
        h += '<button data-ffq="' + qi + '" data-ffo="' + oi + '" style="text-align:left; cursor:pointer; font-family:inherit; font-size:15px; color:#17140F; background:#fff; border:1.5px solid #DDDBD2; border-radius:4px; padding:14px 16px;">' + o[0] + '</button>';
      });
      h += '</div></div>';
    });
    h += '<button id="ff-submit" style="font-family:inherit; font-weight:700; font-size:16px; color:#fff; background:#14432F; border:none; border-radius:4px; padding:15px 28px; cursor:pointer;">See my matches</button>';
    h += '<div id="ff-warn" style="font-size:13.5px; color:#B04A3C; margin-top:12px; min-height:16px;"></div>';
    h += '</div>';
    $('ff-root').innerHTML = h;
    try { var y = $('ff-root').getBoundingClientRect().top + window.scrollY - 90; window.scrollTo({ top: y, behavior: 'smooth' }); } catch (e) {}
  }

  function paintSel() {
    var btns = document.querySelectorAll('[data-ffq]');
    for (var i = 0; i < btns.length; i++) {
      var qi = btns[i].getAttribute('data-ffq'), oi = btns[i].getAttribute('data-ffo'), on = String(state[qi]) === oi;
      btns[i].style.borderColor = on ? '#14432F' : '#DDDBD2';
      btns[i].style.background = on ? '#EEF3E9' : '#fff';
      btns[i].style.fontWeight = on ? '700' : '400';
    }
  }

  function submit() {
    if (Object.keys(state).length < Q.length) { $('ff-warn').textContent = 'Please answer all six questions.'; return; }
    var score = {}; Object.keys(ARCH).forEach(function (k) { score[k] = 0; });
    Q.forEach(function (item, qi) { var w = item.o[state[qi]][1]; for (var k in w) score[k] += w[k]; });
    var ranked = Object.keys(score).sort(function (a, b) { return score[b] - score[a]; });
    render(ranked, score);
  }

  function render(ranked, score) {
    var max = score[ranked[0]] || 1;
    var top = ranked[0];
    var done = false; try { done = localStorage.getItem(KEY) === '1'; } catch (e) {}
    var h = sec();
    h += '<div style="display:flex; align-items:baseline; gap:8px; margin-bottom:18px;"><span style="font-family:Archivo,sans-serif; font-weight:800; font-size:15px; letter-spacing:.12em; color:#17140F;">NELCRUM</span><span style="font-family:Archivo,sans-serif; font-size:9px; letter-spacing:.24em; text-transform:uppercase; color:#C98A2B;">Solutions</span><span style="font-size:11px; color:#8A857B; margin-left:6px;">Funder-Fit Finder</span></div>';
    h += '<div style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:#C98A2B; margin-bottom:12px;">Your strongest match</div>';
    h += '<h2 style="font-family:Archivo,sans-serif; font-weight:700; font-size:clamp(28px,4vw,44px); letter-spacing:-.02em; margin:0 0 8px;">' + ARCH[top].name + '</h2>';
    h += '<p style="font-size:16px; line-height:1.6; color:#57534A; margin:0 0 28px; max-width:60ch;">Based on your reach, budget, and what you are seeking, this funder type is your closest fit. Unlock the full ranking to see every match and exactly what each one wants to see.</p>';

    if (!done) {
      h += '<div style="background:#EEF3E9; border:1px solid #DDDBD2; border-radius:4px; padding:24px 26px;"><div style="font-family:Archivo,sans-serif; font-weight:700; font-size:20px; margin-bottom:6px;">Unlock your full funder match</div><div style="font-size:14px; line-height:1.55; color:#57534A; margin-bottom:16px; max-width:60ch;">See all six funder types ranked for your organization, and what each expects in an application. Enter your email to unlock it.</div><form id="ff-gateform" style="display:flex; gap:10px; flex-wrap:wrap;"><input id="ff-email" type="email" required placeholder="you@org.com" style="flex:1; min-width:220px; font-family:inherit; font-size:15px; padding:13px 15px; border:1.5px solid #DDDBD2; border-radius:4px; background:#fff;"><button type="submit" style="font-family:inherit; font-weight:700; font-size:15px; color:#fff; background:#14432F; border:none; border-radius:4px; padding:13px 22px; cursor:pointer;">Unlock ranking</button></form></div>';
    } else {
      h += full(ranked, score, max);
    }
    h += '</div>';
    $('ff-root').innerHTML = h;
    window.__ffRanked = ranked; window.__ffScore = score; window.__ffMax = max;
    try { var y = $('ff-root').getBoundingClientRect().top + window.scrollY - 90; window.scrollTo({ top: y, behavior: 'smooth' }); } catch (e) {}
  }

  function full(ranked, score, max) {
    var h = '<div style="display:flex; flex-direction:column; gap:14px;">';
    ranked.forEach(function (k, i) {
      var pct = Math.round((score[k] / max) * 100);
      h += '<div style="background:' + (i === 0 ? '#17140F' : '#fff') + '; color:' + (i === 0 ? '#F5F4F0' : '#17140F') + '; border:1px solid ' + (i === 0 ? '#17140F' : '#DDDBD2') + '; border-radius:4px; padding:22px 24px;">';
      h += '<div style="display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:8px;"><div style="font-family:Archivo,sans-serif; font-weight:700; font-size:19px;">' + (i + 1) + '. ' + ARCH[k].name + '</div><div style="font-family:Archivo,sans-serif; font-size:12px; font-weight:700; color:' + (i === 0 ? '#C98A2B' : '#8A857B') + ';">' + pct + '% fit</div></div>';
      h += '<div style="height:6px; background:' + (i === 0 ? 'rgba(245,244,240,.15)' : '#EEF3E9') + '; border-radius:3px; margin-bottom:12px;"><div style="height:6px; width:' + Math.max(pct, 4) + '%; background:#C98A2B; border-radius:3px;"></div></div>';
      h += '<div style="font-size:13.5px; line-height:1.55; color:' + (i === 0 ? 'rgba(245,244,240,.75)' : '#57534A') + ';"><strong style="color:' + (i === 0 ? '#fff' : '#17140F') + ';">Wants to see:</strong> ' + ARCH[k].want + '</div>';
      h += '</div>';
    });
    h += '</div>';
    h += '<div style="display:flex; flex-wrap:wrap; align-items:center; gap:16px 24px; background:#14432F; color:#F5F4F0; border-radius:4px; padding:26px 30px; margin-top:20px;"><div style="flex:1; min-width:260px;"><div style="font-family:Archivo,sans-serif; font-weight:700; font-size:19px; margin-bottom:5px;">Want a named prospect list?</div><div style="font-size:14px; line-height:1.55; color:rgba(245,244,240,.72);">We turn this profile into specific funders to approach, with the case for support to win them.</div></div><a href="contact.html" style="text-decoration:none; background:#C98A2B; color:#17140F; padding:13px 22px; border-radius:4px; font-family:Archivo,sans-serif; font-weight:700; font-size:14.5px; white-space:nowrap;">Book a consultation &#8594;</a></div>';
    return h;
  }

  function unlock() {
    var em = $('ff-email').value.trim();
    if (em.indexOf('@') < 1) { $('ff-email').style.borderColor = '#B04A3C'; return; }
    try {
      var body = new URLSearchParams({ name: '', email: em, organization: '', message: 'Funder-Fit Finder: top match ' + ARCH[window.__ffRanked[0]].name, submittedAt: new Date().toISOString(), source: 'Funder-Fit Finder' });
      fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    } catch (e) {}
    try { localStorage.setItem(KEY, '1'); } catch (e2) {}
    render(window.__ffRanked, window.__ffScore);
  }
})();
