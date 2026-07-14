/* NELCRUM — Logic Model Builder. Guided inputs -> a printable, funder-ready
 * logic model. Email-gated before the finished model. Delegation-bound. */
(function () {
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycby6VPp5kEWJupRvJH2xRvs5D14CEGQvxaMR3kDFH43WTTv69_DL3ZesS8NFKdTxvMgFGg/exec';
  var KEY = 'nc_logicmodel_unlock';
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  var FIELDS = [
    ['problem', 'The problem or need', 'What gap or challenge does your program address? Who is affected and how?', 2],
    ['population', 'Who you serve, and where', 'Your target population and geography (e.g. youth aging out of foster care in metro Atlanta).', 1],
    ['resources', 'Inputs / resources', 'What you invest: staff, funding, partners, facilities, expertise. One per line.', 3],
    ['activities', 'Activities', 'What you do with those resources: programs, services, events. One per line.', 3],
    ['outputs', 'Outputs', 'What you produce or count: people served, sessions held, units delivered. One per line.', 3],
    ['short', 'Short-term outcomes', 'Changes in knowledge, skills, or behavior within 1 to 2 years. One per line.', 3],
    ['long', 'Long-term outcomes', 'Deeper changes in condition or status over 3 to 5 years. One per line.', 3],
    ['impact', 'Impact', 'The lasting community-level change your work contributes to.', 2]
  ];
  var state = {};

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest && t.closest('#lm-start')) { e.preventDefault(); renderForm(); return; }
    if (t.closest && t.closest('#lm-build')) { e.preventDefault(); build(); return; }
    if (t.closest && t.closest('#lm-print')) { e.preventDefault(); doPrint(); return; }
    if (t.closest && t.closest('#lm-edit')) { e.preventDefault(); renderForm(true); return; }
  });
  document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'lm-gateform') { e.preventDefault(); unlock(); }
  });
  document.addEventListener('input', function (e) {
    if (e.target && e.target.getAttribute && e.target.getAttribute('data-lmf')) { state[e.target.getAttribute('data-lmf')] = e.target.value; }
  });

  function sec(){ return '<div style="max-width:820px; margin:0 auto; padding:clamp(40px,6vw,72px) 0;">'; }

  function renderForm(keep) {
    var h = sec();
    FIELDS.forEach(function (f, i) {
      var val = keep ? (state[f[0]] || '') : (state[f[0]] || '');
      h += '<div style="margin-bottom:24px;">';
      h += '<label style="display:block; font-family:Archivo,sans-serif; font-weight:700; font-size:16px; margin-bottom:4px;"><span style="color:#C98A2B; font-variant-numeric:tabular-nums; margin-right:10px;">' + (i + 1) + '</span>' + f[1] + '</label>';
      h += '<div style="font-size:13px; color:#8A857B; margin:0 0 10px 28px;">' + f[2] + '</div>';
      h += '<textarea data-lmf="' + f[0] + '" rows="' + f[3] + '" placeholder="Type here..." style="width:100%; font-family:inherit; font-size:15px; line-height:1.5; color:#17140F; background:#fff; border:1.5px solid #DDDBD2; border-radius:4px; padding:12px 14px; resize:vertical; outline:none;">' + esc(val) + '</textarea>';
      h += '</div>';
    });
    h += '<button id="lm-build" style="font-family:inherit; font-weight:700; font-size:16px; color:#fff; background:#14432F; border:none; border-radius:4px; padding:15px 28px; cursor:pointer;">Build my logic model</button>';
    h += '<div id="lm-warn" style="font-size:13.5px; color:#B04A3C; margin-top:12px; min-height:16px;"></div></div>';
    $('lm-root').innerHTML = h;
    try { var y = $('lm-root').getBoundingClientRect().top + window.scrollY - 90; window.scrollTo({ top: y, behavior: 'smooth' }); } catch (e) {}
  }

  function build() {
    // read current DOM values (in case input events missed anything)
    FIELDS.forEach(function (f) { var el = document.querySelector('[data-lmf="' + f[0] + '"]'); if (el) state[f[0]] = el.value; });
    if (!(state.problem && state.problem.trim()) || !(state.activities && state.activities.trim()) || !(state.short && state.short.trim())) {
      $('lm-warn').textContent = 'Please fill in at least the problem, activities, and short-term outcomes.';
      return;
    }
    render();
  }

  function lines(s) { return String(s || '').split(/[\n;]+/).map(function (x) { return x.trim(); }).filter(Boolean); }

  function col(title, items, accent) {
    var h = '<div style="flex:1; min-width:150px; background:#fff; border:1px solid #DDDBD2; border-top:3px solid ' + accent + '; border-radius:4px; padding:16px 16px 18px;">';
    h += '<div style="font-family:Archivo,sans-serif; font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; color:#8A857B; margin-bottom:12px;">' + title + '</div>';
    if (items.length) { h += '<ul style="margin:0; padding-left:16px; display:flex; flex-direction:column; gap:7px;">'; items.forEach(function (x) { h += '<li style="font-size:13px; line-height:1.45; color:#2B2A25;">' + esc(x) + '</li>'; }); h += '</ul>'; }
    else h += '<div style="font-size:13px; color:#B7B0A2;">Not yet specified</div>';
    return h + '</div>';
  }

  function render() {
    var done = false; try { done = localStorage.getItem(KEY) === '1'; } catch (e) {}
    if (!done) {
      var g = sec();
      g += '<div style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:#C98A2B; margin-bottom:12px;">Your logic model is ready</div>';
      g += '<h2 style="font-family:Archivo,sans-serif; font-weight:700; font-size:clamp(26px,4vw,40px); letter-spacing:-.02em; margin:0 0 10px;">One last step to unlock it.</h2>';
      g += '<p style="font-size:16px; line-height:1.6; color:#57534A; margin:0 0 22px; max-width:60ch;">Enter your email and we will reveal your finished logic model, ready to print or drop into a proposal.</p>';
      g += '<form id="lm-gateform" style="display:flex; gap:10px; flex-wrap:wrap; max-width:520px;"><input id="lm-email" type="email" required placeholder="you@org.com" style="flex:1; min-width:220px; font-family:inherit; font-size:15px; padding:13px 15px; border:1.5px solid #DDDBD2; border-radius:4px; background:#fff;"><button type="submit" style="font-family:inherit; font-weight:700; font-size:15px; color:#fff; background:#14432F; border:none; border-radius:4px; padding:13px 22px; cursor:pointer;">Reveal my logic model</button></form>';
      g += '<div style="margin-top:14px;"><a id="lm-edit" href="#" style="font-size:14px; font-weight:600; color:#57534A;">&#8592; Keep editing</a></div>';
      g += '</div>';
      $('lm-root').innerHTML = g;
      try { var y = $('lm-root').getBoundingClientRect().top + window.scrollY - 90; window.scrollTo({ top: y, behavior: 'smooth' }); } catch (e) {}
      return;
    }

    var h = sec();
    h += '<div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:14px; margin-bottom:22px;">';
    h += '<div><div style="font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:#C98A2B; margin-bottom:8px;">Your logic model</div><div style="font-family:Archivo,sans-serif; font-weight:700; font-size:clamp(22px,3vw,30px); letter-spacing:-.02em;">Program logic model</div></div>';
    h += '<div style="display:flex; gap:10px;"><button id="lm-print" style="font-family:inherit; font-weight:700; font-size:14px; color:#17140F; background:#C98A2B; border:none; border-radius:4px; padding:11px 20px; cursor:pointer;">Print / save PDF</button><button id="lm-edit" style="font-family:inherit; font-weight:600; font-size:14px; color:#17140F; background:#fff; border:1px solid #DDDBD2; border-radius:4px; padding:11px 18px; cursor:pointer;">Edit</button></div>';
    h += '</div>';

    h += '<div id="lm-print-area">';
    h += '<div style="display:flex; align-items:baseline; gap:8px; margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid #DDDBD2;"><span style="font-family:Archivo,sans-serif; font-weight:800; font-size:16px; letter-spacing:.12em; color:#17140F;">NELCRUM</span><span style="font-family:Archivo,sans-serif; font-size:9.5px; letter-spacing:.24em; text-transform:uppercase; color:#C98A2B;">Solutions</span><span style="font-size:11px; color:#8A857B; margin-left:auto;">Logic Model Builder &middot; nelcrum.com</span></div>';
    h += '<div style="background:#17140F; color:#F5F4F0; border-radius:4px; padding:22px 24px; margin-bottom:14px;">';
    h += '<div data-stack style="display:grid; grid-template-columns:1fr 1fr; gap:18px 32px;">';
    h += '<div><div style="font-family:Archivo,sans-serif; font-size:10.5px; letter-spacing:.12em; text-transform:uppercase; color:#C98A2B; margin-bottom:6px;">The problem</div><div style="font-size:14.5px; line-height:1.55;">' + esc(state.problem) + '</div></div>';
    h += '<div><div style="font-family:Archivo,sans-serif; font-size:10.5px; letter-spacing:.12em; text-transform:uppercase; color:#C98A2B; margin-bottom:6px;">Who we serve</div><div style="font-size:14.5px; line-height:1.55;">' + (esc(state.population) || '—') + '</div></div>';
    h += '</div></div>';

    h += '<div data-stack style="display:flex; gap:10px; align-items:stretch; flex-wrap:wrap;">';
    h += col('Inputs', lines(state.resources), '#8A857B');
    h += col('Activities', lines(state.activities), '#14432F');
    h += col('Outputs', lines(state.outputs), '#4E6B43');
    h += col('Short-term outcomes', lines(state.short), '#C08A2E');
    h += col('Long-term outcomes', lines(state.long), '#C98A2B');
    h += '</div>';

    if (state.impact && state.impact.trim()) {
      h += '<div style="background:#EEF3E9; border:1px solid #DDDBD2; border-radius:4px; padding:18px 22px; margin-top:14px;"><div style="font-family:Archivo,sans-serif; font-size:10.5px; letter-spacing:.12em; text-transform:uppercase; color:#14432F; margin-bottom:6px;">Impact</div><div style="font-size:15px; line-height:1.55; color:#17140F;">' + esc(state.impact) + '</div></div>';
    }
    h += '<div style="font-family:Archivo,sans-serif; font-size:11px; color:#8A857B; margin-top:14px;">Prepared with the NELCRUM Solutions Logic Model Builder &middot; nelcrum.com</div>';
    h += '</div>'; // print-area

    h += '<div style="display:flex; flex-wrap:wrap; align-items:center; gap:16px 24px; background:#14432F; color:#F5F4F0; border-radius:4px; padding:26px 30px; margin-top:20px;"><div style="flex:1; min-width:260px;"><div style="font-family:Archivo,sans-serif; font-weight:700; font-size:19px; margin-bottom:5px;">Want us to pressure-test the logic?</div><div style="font-size:14px; line-height:1.55; color:rgba(245,244,240,.72);">We refine the causal chain and align your measures to what funders require, so the model holds up under scrutiny.</div></div><a href="contact.html" style="text-decoration:none; background:#C98A2B; color:#17140F; padding:13px 22px; border-radius:4px; font-family:Archivo,sans-serif; font-weight:700; font-size:14.5px; white-space:nowrap;">Book a consultation &#8594;</a></div>';
    h += '</div>';
    $('lm-root').innerHTML = h;
    try { var y = $('lm-root').getBoundingClientRect().top + window.scrollY - 90; window.scrollTo({ top: y, behavior: 'smooth' }); } catch (e) {}
  }

  function unlock() {
    var em = $('lm-email').value.trim();
    if (em.indexOf('@') < 1) { $('lm-email').style.borderColor = '#B04A3C'; return; }
    try {
      var body = new URLSearchParams({ name: '', email: em, organization: '', hp: '', elapsed: String(Math.round(performance.now())), message: 'Logic Model Builder: ' + String(state.problem || '').slice(0, 120), submittedAt: new Date().toISOString(), source: 'Logic Model Builder' });
      fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    } catch (e) {}
    try { localStorage.setItem(KEY, '1'); } catch (e2) {}
    render();
  }

  // Print only the model area.
  function ensurePrintStyle() {
    if (document.getElementById('lm-print-style')) return;
    var st = document.createElement('style');
    st.id = 'lm-print-style';
    st.textContent = '@media print { body * { visibility: hidden !important; } #lm-print-area, #lm-print-area * { visibility: visible !important; } #lm-print-area { position: absolute; left: 0; top: 0; width: 100%; } }';
    document.head.appendChild(st);
  }
  function doPrint() { ensurePrintStyle(); window.print(); }
})();
