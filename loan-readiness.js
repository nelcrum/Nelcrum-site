/* NELCRUM — CDFI / Loan Readiness Check. Eight Yes/Partly/No questions ->
 * readiness band + priority gaps. Results email-gated. Delegation-bound. */
(function () {
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycby6VPp5kEWJupRvJH2xRvs5D14CEGQvxaMR3kDFH43WTTv69_DL3ZesS8NFKdTxvMgFGg/exec';
  var KEY = 'nc_loanready_unlock';
  function $(id){ return document.getElementById(id); }

  var Q = [
    { dim: 'Cash flow & repayment', q: 'Have you had positive or break-even cash flow over the last 12 months?', rec: 'Build at least a few months of positive or break-even cash flow, and be ready to show it on a statement.' },
    { dim: 'Cash flow & repayment', q: 'Can you cover a new loan payment from reliable, recurring revenue?', rec: 'Map a specific, recurring revenue source to the new payment; lenders want to see repayment does not depend on hoped-for grants.' },
    { dim: 'Collateral & security', q: 'Do you have assets or property you could pledge as collateral?', rec: 'Inventory pledgeable assets (property, equipment, receivables). If none, explore CDFIs that lend against cash flow or offer guarantees.' },
    { dim: 'Collateral & security', q: 'Could a board member, partner, or funder provide a guarantee if asked?', rec: 'Line up a potential guarantor or a grant-funded loan-loss reserve early; it widens the lenders who can say yes.' },
    { dim: 'Governance & financials', q: 'Do you have current financial statements, ideally reviewed or audited?', rec: 'Get current statements in order; a review or audit signals reliability and is often required above a certain loan size.' },
    { dim: 'Governance & financials', q: 'Does your board review finances regularly and formally approve major debt?', rec: 'Adopt a board practice of regular financial review and a documented vote to approve borrowing.' },
    { dim: 'Use of funds & mission', q: 'Is your use of funds specific, with a budget and a timeline?', rec: 'Write a clear use-of-funds: line-item budget, timeline, and what the capital unlocks.' },
    { dim: 'Use of funds & mission', q: 'Does the project clearly advance your mission and community benefit?', rec: 'State the community-development outcome plainly; mission lenders and CRA-motivated banks weigh it heavily.' }
  ];
  var OPTS = [ ['Yes', 1], ['Partly', 0.5], ['Not yet', 0] ];

  var state = {};

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest && t.closest('#lr-start')) { e.preventDefault(); renderForm(); return; }
    var opt = t.closest && t.closest('[data-lrq]');
    if (opt) { state[+opt.getAttribute('data-lrq')] = +opt.getAttribute('data-lro'); paintSel(); return; }
    if (t.closest && t.closest('#lr-submit')) { e.preventDefault(); submit(); return; }
  });
  document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'lr-gateform') { e.preventDefault(); unlock(); }
  });

  function sec(){ return '<div style="max-width:820px; margin:0 auto; padding:clamp(40px,6vw,72px) 0;">'; }

  function renderForm() {
    var h = sec();
    Q.forEach(function (item, qi) {
      h += '<div style="margin-bottom:26px;">';
      h += '<div style="font-family:Archivo,sans-serif; font-size:10.5px; letter-spacing:.12em; text-transform:uppercase; color:#8A857B; margin-bottom:8px;">' + item.dim + '</div>';
      h += '<div style="font-family:Archivo,sans-serif; font-weight:700; font-size:clamp(16px,2vw,20px); margin-bottom:12px;"><span style="color:#C98A2B; font-variant-numeric:tabular-nums; margin-right:10px;">' + (qi + 1) + '</span>' + item.q + '</div>';
      h += '<div style="display:flex; gap:8px; flex-wrap:wrap;">';
      OPTS.forEach(function (o, oi) {
        h += '<button data-lrq="' + qi + '" data-lro="' + oi + '" style="cursor:pointer; font-family:inherit; font-size:14.5px; font-weight:600; color:#17140F; background:#fff; border:1.5px solid #DDDBD2; border-radius:4px; padding:11px 22px;">' + o[0] + '</button>';
      });
      h += '</div></div>';
    });
    h += '<button id="lr-submit" style="font-family:inherit; font-weight:700; font-size:16px; color:#fff; background:#14432F; border:none; border-radius:4px; padding:15px 28px; cursor:pointer;">See my readiness</button>';
    h += '<div id="lr-warn" style="font-size:13.5px; color:#B04A3C; margin-top:12px; min-height:16px;"></div></div>';
    $('lr-root').innerHTML = h;
    try { var y = $('lr-root').getBoundingClientRect().top + window.scrollY - 90; window.scrollTo({ top: y, behavior: 'smooth' }); } catch (e) {}
  }

  function paintSel() {
    var btns = document.querySelectorAll('[data-lrq]');
    for (var i = 0; i < btns.length; i++) {
      var qi = btns[i].getAttribute('data-lrq'), oi = btns[i].getAttribute('data-lro'), on = String(state[qi]) === oi;
      btns[i].style.borderColor = on ? '#14432F' : '#DDDBD2';
      btns[i].style.background = on ? '#EEF3E9' : '#fff';
    }
  }

  function band(pct) {
    if (pct >= 75) return { label: 'Loan-ready', color: '#3F7A55', note: 'You present well to a CDFI or mission lender. Tighten the few gaps below and assemble your package.' };
    if (pct >= 50) return { label: 'Nearly ready', color: '#14432F', note: 'The foundation is there. Close the gaps below before you sit down with a lender.' };
    if (pct >= 25) return { label: 'Building the foundation', color: '#C08A2E', note: 'Real groundwork remains. Focus on the priorities below over the next few quarters.' };
    return { label: 'Early stage', color: '#B04A3C', note: 'Borrowing is likely premature. Build cash flow and financial systems first; grants may fit better for now.' };
  }

  function submit() {
    if (Object.keys(state).length < Q.length) { $('lr-warn').textContent = 'Please answer all eight questions.'; return; }
    var sum = 0; Q.forEach(function (item, qi) { sum += OPTS[state[qi]][1]; });
    var pct = Math.round((sum / Q.length) * 100);
    var gaps = Q.map(function (item, qi) { return { item: item, v: OPTS[state[qi]][1] }; })
      .filter(function (g) { return g.v < 1; })
      .sort(function (a, b) { return a.v - b.v; }).slice(0, 3);
    // dimension rollup
    var dims = {};
    Q.forEach(function (item, qi) { (dims[item.dim] = dims[item.dim] || []).push(OPTS[state[qi]][1]); });
    render(pct, gaps, dims);
  }

  function render(pct, gaps, dims) {
    var b = band(pct);
    var done = false; try { done = localStorage.getItem(KEY) === '1'; } catch (e) {}
    var h = sec();
    h += '<div style="display:flex; align-items:baseline; gap:8px; margin-bottom:18px;"><span style="font-family:Archivo,sans-serif; font-weight:800; font-size:15px; letter-spacing:.12em; color:#17140F;">NELCRUM</span><span style="font-family:Archivo,sans-serif; font-size:9px; letter-spacing:.24em; text-transform:uppercase; color:#C98A2B;">Solutions</span><span style="font-size:11px; color:#8A857B; margin-left:6px;">CDFI / Loan Readiness</span></div>';
    h += '<div style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:#C98A2B; margin-bottom:14px;">Your loan-readiness</div>';
    h += '<div style="display:flex; align-items:baseline; gap:16px; flex-wrap:wrap; margin-bottom:10px;"><div style="font-family:Archivo,sans-serif; font-weight:800; font-size:clamp(44px,7vw,72px); letter-spacing:-.03em; line-height:1;">' + pct + '<span style="font-size:.4em; color:#8A857B;">/100</span></div><div style="font-family:Archivo,sans-serif; font-weight:700; font-size:18px; color:' + b.color + ';">' + b.label + '</div></div>';
    h += '<p style="font-size:16px; line-height:1.6; color:#57534A; margin:0 0 28px; max-width:60ch;">' + b.note + '</p>';

    if (!done) {
      h += '<div style="background:#EEF3E9; border:1px solid #DDDBD2; border-radius:4px; padding:24px 26px;"><div style="font-family:Archivo,sans-serif; font-weight:700; font-size:20px; margin-bottom:6px;">Unlock your readiness plan</div><div style="font-size:14px; line-height:1.55; color:#57534A; margin-bottom:16px; max-width:60ch;">See your score by area and the specific gaps to close before you approach a lender. Enter your email to unlock it.</div><form id="lr-gateform" style="display:flex; gap:10px; flex-wrap:wrap;"><input id="lr-email" type="email" required placeholder="you@org.com" style="flex:1; min-width:220px; font-family:inherit; font-size:15px; padding:13px 15px; border:1.5px solid #DDDBD2; border-radius:4px; background:#fff;"><button type="submit" style="font-family:inherit; font-weight:700; font-size:15px; color:#fff; background:#14432F; border:none; border-radius:4px; padding:13px 22px; cursor:pointer;">Unlock plan</button></form></div>';
    } else {
      h += fullView(dims, gaps);
    }
    h += '</div>';
    $('lr-root').innerHTML = h;
    window.__lr = { pct: pct, gaps: gaps, dims: dims, band: b.label };
    try { var y = $('lr-root').getBoundingClientRect().top + window.scrollY - 90; window.scrollTo({ top: y, behavior: 'smooth' }); } catch (e) {}
  }

  function fullView(dims, gaps) {
    var h = '<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:24px;" data-stack>';
    Object.keys(dims).forEach(function (d) {
      var arr = dims[d], avg = Math.round((arr.reduce(function (a, b) { return a + b; }, 0) / arr.length) * 100);
      var c = avg >= 67 ? '#3F7A55' : (avg >= 40 ? '#C08A2E' : '#B04A3C');
      h += '<div style="background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:18px 20px;"><div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px;"><span style="font-weight:600; font-size:14px;">' + d + '</span><span style="font-family:Archivo,sans-serif; font-weight:700; font-size:14px; color:' + c + ';">' + avg + '%</span></div><div style="height:7px; background:#EEF3E9; border-radius:4px;"><div style="height:7px; width:' + Math.max(avg, 3) + '%; background:' + c + '; border-radius:4px;"></div></div></div>';
    });
    h += '</div>';
    if (gaps.length) {
      h += '<div style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#C98A2B; margin-bottom:12px;">Close these first</div>';
      h += '<div style="display:flex; flex-direction:column; gap:10px;">';
      gaps.forEach(function (g, i) {
        h += '<div style="background:#fff; border:1px solid #DDDBD2; border-left:3px solid #14432F; border-radius:4px; padding:18px 20px;"><div style="font-family:Archivo,sans-serif; font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; color:#8A857B; margin-bottom:6px;">' + g.item.dim + '</div><div style="font-family:Archivo,sans-serif; font-weight:700; font-size:16px; margin-bottom:6px;">' + g.item.q + '</div><div style="font-size:14px; line-height:1.55; color:#57534A;">' + g.item.rec + '</div></div>';
      });
      h += '</div>';
    }
    h += (window.ncUpsell ? window.ncUpsell({
      headline: 'Ready to build a lender-ready package?',
      body: 'We assemble the financials, use-of-funds, and narrative that CDFIs and mission lenders want to see. Start with the audit: a full capacity review with a written action plan \u2014 the same fundamentals lenders underwrite.',
      pkg: { name: 'Grant Readiness Audit', price: '$550', meta: 'flat \u00b7 ~2 weeks', deliverable: 'Six-area capacity assessment + prioritized action plan + debrief call.', href: 'packages.html#audit' }
    }) : '<div style="margin-top:22px;"><a href="packages.html#audit" style="color:#14432F; font-weight:700;">See the Grant Readiness Audit \u2192</a></div>');
    return h;
  }

  function unlock() {
    var em = $('lr-email').value.trim();
    if (em.indexOf('@') < 1) { $('lr-email').style.borderColor = '#B04A3C'; return; }
    try {
      var body = new URLSearchParams({ name: '', email: em, organization: '', hp: '', elapsed: String(Math.round(performance.now())), message: 'CDFI / Loan Readiness: ' + window.__lr.pct + '/100 (' + window.__lr.band + ')', submittedAt: new Date().toISOString(), source: 'CDFI / Loan Readiness' });
      fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    } catch (e) {}
    try { localStorage.setItem(KEY, '1'); } catch (e2) {}
    render(window.__lr.pct, window.__lr.gaps, window.__lr.dims);
  }
})();
