/* NELCRUM Solutions — site enhancements
 * -------------------------------------
 * 1. Scroll reveal: sections gently fly in as they enter the viewport.
 * 2. Email capture popup (10% off): brand-matched modal, shows once per
 *    visitor, submits to the same Google Sheet endpoint as the contact form.
 *
 * Loaded from each page's <helmet>. Pages that want the popup set
 *   window.NC_POPUP = true;  before this script. Reveal runs everywhere.
 * No external dependencies. Safe to run before the page finishes rendering.
 */
(function () {
  if (window.__ncEnhanced) return;
  window.__ncEnhanced = true;

  var ENDPOINT = 'https://script.google.com/macros/s/AKfycby6VPp5kEWJupRvJH2xRvs5D14CEGQvxaMR3kDFH43WTTv69_DL3ZesS8NFKdTxvMgFGg/exec';
  var OFFER_CODE = 'NELCRUM10';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Wait until the DC content has actually rendered (support.js mounts the
  // <x-dc> template asynchronously), then run cb. Falls through after 6s.
  function whenContent(cb) {
    var start = Date.now();
    (function poll() {
      if (document.querySelector('section, main, footer')) return cb();
      if (Date.now() - start > 6000) return cb();
      requestAnimationFrame(poll);
    })();
  }

  /* ---------------- 1. Scroll reveal ---------------- */
  function setupReveal() {
    if (reduce || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          var t = e.target;
          t.style.opacity = '1';
          t.style.transform = 'none';
          io.unobserve(t);
          setTimeout(function () { t.style.willChange = 'auto'; }, 850);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });

    function tag(el) {
      if (el.__rv) return;
      el.__rv = true;
      el.style.opacity = '0';
      el.style.transform = 'translateY(32px)';
      el.style.transition = 'opacity .8s cubic-bezier(.2,.7,.2,1), transform .8s cubic-bezier(.2,.7,.2,1)';
      el.style.willChange = 'opacity, transform';
      io.observe(el);
    }
    function scan() {
      var nodes = document.querySelectorAll('section, footer, [data-reveal]');
      for (var i = 0; i < nodes.length; i++) {
        // skip the sticky header and anything already inside a tagged block's reveal
        if (nodes[i].closest && nodes[i].closest('header')) continue;
        tag(nodes[i]);
      }
    }
    scan();
    // Catch any sections rendered slightly later, then stop watching.
    var mo = new MutationObserver(scan);
    if (document.body) mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { mo.disconnect(); }, 6000);
  }

  /* ---------------- 2. Email popup ---------------- */
  function seen() {
    // "Every visit" until they actually sign up: only a completed signup
    // suppresses the popup. Closing it does not remember.
    try {
      return localStorage.getItem('nc_signup') === '1';
    } catch (e) { return false; }
  }

  function el(tag, css, html) {
    var n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (html != null) n.innerHTML = html;
    return n;
  }

  var F_SERIF = "'Archivo', sans-serif";
  var F_SANS = "'Archivo', system-ui, sans-serif";
  var F_MONO = "'Archivo', sans-serif";

  function setupPopup() {
    if (window.NC_POPUP !== true || seen()) return;
    var shown = false;

    function trigger() {
      if (shown || seen()) return;
      shown = true;
      window.removeEventListener('scroll', onScroll);
      render();
    }
    function onScroll() {
      var h = document.body.scrollHeight - window.innerHeight;
      if (h > 0 && window.scrollY / h > 0.5) trigger();
    }
    var timer = setTimeout(trigger, 20000);
    window.addEventListener('scroll', onScroll, { passive: true });

    function render() {
      clearTimeout(timer);

      var overlay = el('div',
        'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
        'padding:20px;background:rgba(28,24,20,.55);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);' +
        'opacity:0;transition:opacity .35s ease;font-family:' + F_SANS + ';');
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');

      var card = el('div',
        'position:relative;width:100%;max-width:440px;background:#F5F4F0;border:1px solid #DDDBD2;' +
        'border-radius: 4px;overflow:hidden;box-shadow:0 40px 80px -30px rgba(28,20,10,.7);' +
        'transform:translateY(24px) scale(.97);opacity:0;transition:transform .45s cubic-bezier(.2,.8,.2,1), opacity .45s ease;');

      // close button
      var close = el('button', 'position:absolute;top:13px;right:13px;z-index:2;width:32px;height:32px;' +
        'border:none;border-radius: 4px;cursor:pointer;background:rgba(245,244,240,.16);color:#F5F4F0;' +
        'font:600 18px/1 ' + F_SANS + ';display:flex;align-items:center;justify-content:center;', '&times;');
      close.setAttribute('aria-label', 'Close');

      // dark header band
      var head = el('div', 'position:relative;background:#17140F;color:#F5F4F0;padding:30px 30px 26px;overflow:hidden;');
      head.appendChild(el('div', 'position:absolute;top:-50px;right:-40px;width:180px;height:180px;border-radius: 4px;border:1px solid rgba(201,138,43,.4);pointer-events:none;'));
      head.appendChild(el('div',
        'position:relative;font-family:' + F_MONO + ';font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#C98A2B;margin-bottom:14px;',
        'NELCRUM &middot; Limited offer'));
      head.appendChild(el('div',
        'position:relative;font-family:' + F_SERIF + ';font-weight:500;font-size:32px;line-height:1.08;letter-spacing:-.01em;',
        'Get <span style="font-style:italic;color:#C98A2B;">10% off</span> your first project.'));

      // body
      var body = el('div', 'padding:24px 30px 30px;');
      body.appendChild(el('p', 'font-size:14.5px;line-height:1.6;color:#57534A;margin:0 0 20px;',
        'Join our list for evidence-led insights and tool updates, and get a code for 10% off your first engagement or Wenbee plan.'));

      var form = el('form', 'display:flex;flex-direction:column;gap:10px;');
      var input = el('input', 'font-family:' + F_SANS + ';font-size:15px;color:#17140F;background:#fff;' +
        'border:1.5px solid #DDDBD2;border-radius: 3px;padding:13px 15px;outline:none;');
      input.type = 'email'; input.required = true; input.placeholder = 'you@org.com';
      input.addEventListener('focus', function () { input.style.borderColor = '#14432F'; });
      input.addEventListener('blur', function () { input.style.borderColor = '#DDDBD2'; });

      var submit = el('button', 'font-family:' + F_SANS + ';font-weight:700;font-size:15.5px;color:#fff;' +
        'background:#14432F;border:none;border-radius: 4px;padding:14px 22px;cursor:pointer;', 'Get my 10% off &rarr;');
      submit.type = 'submit';

      var fine = el('p', 'font-size:11.5px;line-height:1.5;color:#8A857B;margin:14px 0 0;',
        'No spam. Unsubscribe anytime. We never share your details.');

      form.appendChild(input);
      form.appendChild(submit);
      body.appendChild(form);
      body.appendChild(fine);

      card.appendChild(close);
      card.appendChild(head);
      card.appendChild(body);
      overlay.appendChild(card);
      document.body.appendChild(overlay);

      requestAnimationFrame(function () {
        overlay.style.opacity = '1';
        card.style.transform = 'none';
        card.style.opacity = '1';
      });
      setTimeout(function () { try { input.focus(); } catch (e) {} }, 480);

      function dismiss(remember) {
        overlay.style.opacity = '0';
        card.style.transform = 'translateY(24px) scale(.97)';
        card.style.opacity = '0';
        setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 380);
        document.removeEventListener('keydown', onKey);
      }
      function onKey(e) { if (e.key === 'Escape') dismiss(true); }
      document.addEventListener('keydown', onKey);
      close.addEventListener('click', function () { dismiss(true); });
      overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) dismiss(true); });

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = input.value.trim();
        if (email.indexOf('@') < 1) { input.style.borderColor = '#B04A3C'; return; }
        submit.disabled = true; submit.style.opacity = '.6'; submit.innerHTML = 'Sending&hellip;';
        try {
          var payload = new URLSearchParams({
            name: '', email: email, organization: '',
            message: 'Requested 10% off via website popup',
            submittedAt: new Date().toISOString(),
            source: 'Website popup (10% off)'
          });
          fetch(ENDPOINT, {
            method: 'POST', mode: 'no-cors',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: payload.toString()
          });
        } catch (err) {}
        try { localStorage.setItem('nc_signup', '1'); } catch (e2) {}
        success();
      });

      function success() {
        head.innerHTML = '';
        head.appendChild(el('div', 'position:absolute;top:-50px;right:-40px;width:180px;height:180px;border-radius: 4px;border:1px solid rgba(201,138,43,.4);pointer-events:none;'));
        head.appendChild(el('div',
          'position:relative;font-family:' + F_MONO + ';font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#C98A2B;margin-bottom:14px;',
          'You&rsquo;re on the list'));
        head.appendChild(el('div',
          'position:relative;font-family:' + F_SERIF + ';font-weight:500;font-size:30px;line-height:1.1;',
          'Welcome to NELCRUM.'));

        body.innerHTML = '';
        body.appendChild(el('p', 'font-size:14.5px;line-height:1.6;color:#57534A;margin:0 0 18px;',
          'Here is your code. Mention it during your first consultation to claim 10% off.'));
        var codeRow = el('div', 'display:flex;align-items:center;gap:10px;background:#fff;border:1.5px dashed #C98A2B;' +
          'border-radius: 3px;padding:14px 16px;margin-bottom:20px;');
        codeRow.appendChild(el('span', 'font-family:' + F_MONO + ';font-weight:600;font-size:20px;letter-spacing:.12em;color:#14432F;flex:1;', OFFER_CODE));
        var copy = el('button', 'font-family:' + F_SANS + ';font-weight:700;font-size:13px;color:#17140F;background:#E4EDE1;' +
          'border:none;border-radius: 4px;padding:9px 15px;cursor:pointer;', 'Copy');
        copy.addEventListener('click', function () {
          try { navigator.clipboard.writeText(OFFER_CODE); copy.innerHTML = 'Copied'; } catch (e) { copy.innerHTML = 'Copied'; }
          setTimeout(function () { copy.innerHTML = 'Copy'; }, 1600);
        });
        codeRow.appendChild(copy);
        body.appendChild(codeRow);
        var done = el('button', 'width:100%;font-family:' + F_SANS + ';font-weight:700;font-size:15px;color:#fff;' +
          'background:#17140F;border:none;border-radius: 4px;padding:13px 22px;cursor:pointer;', 'Keep exploring');
        done.addEventListener('click', function () { dismiss(false); });
        body.appendChild(done);
      }
    }
  }

  /* ---------------- 3. Nav dropdowns ---------------- */
  var mega = { openWrap: null, closeAll: null, docBound: false };
  function setupMegaMenu() {
    var nav = document.querySelector('nav[data-nav]');
    if (!nav) return;
    var header = nav.closest('header'); if (header) header.style.overflow = 'visible';

    var INK = '#17140F', MUT = '#8A857B', LINE = '#DDDBD2', PAPER = '#F5F4F0';
    var SANS = "'Archivo', system-ui, sans-serif";
    var MENU = {
      'Advisory': [
        ['Strategic Advisory', 'Strategy, governance, and program design', 'advisory.html'],
        ['Research & Evaluation', 'Program evaluation, theory of change, impact', 'advisory.html#evaluation'],
        ['Grant services', 'Research, proposal writing, compliance review', 'advisory.html'],
        ['Free Grant-Readiness Assessment', 'A detailed action plan, at no cost', 'index.html#assessments']
      ],
      'Applications': [
        ['Cairn workplace 360', 'Multi-source team assessment you can act on', 'applications.html'],
        ['Custom dashboards', 'Grant, impact, and portfolio views', 'applications.html'],
        ['Impact & grant reporting', 'Reporting shaped to how you work', 'applications.html'],
        ['Wenbee', 'Our companion product', 'https://wenbee.nelcrum.com']
      ],
      'Free tools': [
        ['Grant Readiness Scorecard', 'Score your org, get your top fixes', 'scorecard.html'],
        ['Funder Intelligence Report', 'Pull a funder\'s IRS 990 giving trends', 'funder-report.html'],
        ['State Foundation Overview', 'Foundation landscape by state, over time', 'state-foundations.html'],
        ['Workplace mini-360', 'A quick read on team health', 'assessment.html'],
        ['Community Mobility Dashboard', 'Census-tract mobility and investment data', 'mobility-dashboard.html'],
        ['See all free tools', 'The full roadmap', 'tools.html']
      ]
    };

    var openWrap = mega.openWrap;
    function closeAll() {
      var o = mega.openWrap;
      if (!o) return;
      o.__panel.style.opacity = '0';
      o.__panel.style.visibility = 'hidden';
      o.__panel.style.transform = 'translateY(6px)';
      o.__caret.style.transform = 'rotate(0deg)';
      mega.openWrap = null;
    }
    function open(w) {
      if (mega.openWrap && mega.openWrap !== w) closeAll();
      var p = w.__panel;
      if (window.innerWidth <= 680 && header) {
        var b = Math.round(header.getBoundingClientRect().bottom);
        p.style.position = 'fixed'; p.style.left = '14px'; p.style.right = '14px'; p.style.top = b + 'px';
        p.style.minWidth = '0'; p.style.maxWidth = 'none'; p.style.paddingTop = '0';
      } else {
        p.style.position = 'absolute'; p.style.left = '0'; p.style.right = 'auto'; p.style.top = '100%';
        p.style.minWidth = '300px'; p.style.maxWidth = '92vw'; p.style.paddingTop = '12px';
      }
      p.style.opacity = '1';
      p.style.visibility = 'visible';
      p.style.transform = 'none';
      w.__caret.style.transform = 'rotate(180deg)';
      mega.openWrap = w;
    }
    mega.closeAll = closeAll;
    function cancelClose() { if (mega.timer) { clearTimeout(mega.timer); mega.timer = null; } }
    function scheduleClose() { cancelClose(); mega.timer = setTimeout(closeAll, 220); }
    var canHover = !window.matchMedia || window.matchMedia('(hover:hover)').matches;

    Object.keys(MENU).forEach(function (key) {
      var link = null, as = nav.querySelectorAll('a');
      for (var i = 0; i < as.length; i++) { if (as[i].textContent.trim() === key) { link = as[i]; break; } }
      if (!link || link.__megaDone) return;
      link.__megaDone = true;
      var items = MENU[key];

      var wrap = document.createElement('span');
      wrap.style.cssText = 'position:relative; display:inline-flex; align-items:center; gap:5px;';
      link.parentNode.insertBefore(wrap, link);
      wrap.appendChild(link);

      var caret = document.createElement('span');
      caret.innerHTML = '<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2.5 4.5 L6 8 L9.5 4.5"/></svg>';
      caret.style.cssText = 'display:inline-flex; color:' + MUT + '; transition:transform .2s ease; pointer-events:none;';
      wrap.appendChild(caret);
      wrap.__caret = caret;

      var panel = document.createElement('div');
      panel.style.cssText = 'position:absolute; top:100%; left:0; padding-top:12px; min-width:300px; max-width:92vw; opacity:0; visibility:hidden; transform:translateY(6px); transition:opacity .18s ease, transform .18s ease; z-index:100;';
      var pcard = document.createElement('div');
      pcard.style.cssText = 'background:#fff; border:1px solid ' + LINE + '; border-radius:4px; box-shadow:0 24px 50px -24px rgba(20,25,20,.45); padding:8px;';
      items.forEach(function (it) {
        var row = document.createElement('a');
        row.href = it[2];
        if (it[2].indexOf('http') === 0) { row.target = '_blank'; row.rel = 'noopener'; }
        row.style.cssText = 'display:block; text-decoration:none; cursor:pointer; padding:11px 13px; border-radius:4px; border-left:3px solid transparent; transition:background .14s ease, border-color .14s ease;';
        row.innerHTML = '<span style="display:block; font-family:' + SANS + '; font-weight:700; font-size:13.5px; color:' + INK + '; margin-bottom:2px;">' + it[0] + '</span><span style="display:block; font-size:12px; line-height:1.4; color:' + MUT + ';">' + it[1] + '</span>';
        row.addEventListener('mouseenter', function () { row.style.background = PAPER; row.style.borderLeftColor = '#C98A2B'; });
        row.addEventListener('mouseleave', function () { row.style.background = 'transparent'; row.style.borderLeftColor = 'transparent'; });
        pcard.appendChild(row);
      });
      panel.appendChild(pcard);
      wrap.appendChild(panel);
      wrap.__panel = panel;

      wrap.addEventListener('mouseenter', function () { if (canHover) { cancelClose(); open(wrap); } });
      wrap.addEventListener('mouseleave', function () { if (canHover) scheduleClose(); });
      panel.addEventListener('mouseenter', function () { if (canHover) cancelClose(); });
      panel.addEventListener('mouseleave', function () { if (canHover) scheduleClose(); });
      link.addEventListener('click', function (e) {
        if (!canHover) { if (mega.openWrap !== wrap) { e.preventDefault(); open(wrap); } }
      });
      link.addEventListener('focus', function () { open(wrap); });
      wrap.addEventListener('focusout', function (e) { if (!wrap.contains(e.relatedTarget)) closeAll(); });
    });
    if (!mega.docBound) {
      mega.docBound = true;
      document.addEventListener('click', function (e) { if (mega.openWrap && !mega.openWrap.contains(e.target)) mega.closeAll(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && mega.closeAll) mega.closeAll(); });
    }
  }

  /* ---------------- 4. On-this-page jump bar ---------------- */
  var jump = { done: false };
  function setupJumpNav() {
    if (!window.NC_JUMP || !window.NC_JUMP.length || jump.done) return;
    var header = document.querySelector('header');
    var hh = header ? Math.round(header.getBoundingClientRect().height) : 62;
    var list = window.NC_JUMP;
    var bar = document.createElement('div');
    bar.setAttribute('data-nc-jump', '');
    bar.style.cssText = 'position:fixed; left:0; right:0; top:' + hh + 'px; z-index:45; background:rgba(245,244,240,.94); -webkit-backdrop-filter:blur(10px); backdrop-filter:blur(10px); border-bottom:1px solid #DDDBD2; transform:translateY(-140%); transition:transform .3s ease;';
    var inner = document.createElement('div');
    inner.style.cssText = 'max-width:1200px; margin:0 auto; padding:10px 32px; display:flex; align-items:center; gap:6px 20px; overflow-x:auto;';
    var lbl = document.createElement('span');
    lbl.textContent = 'On this page';
    lbl.style.cssText = "font-family:'Archivo',sans-serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#8A857B; white-space:nowrap; margin-right:2px;";
    inner.appendChild(lbl);
    var links = [];
    list.forEach(function (it) {
      var a = document.createElement('a');
      a.href = it[1]; a.textContent = it[0];
      a.style.cssText = "font-family:'Archivo',sans-serif; font-size:13px; font-weight:600; color:#57534A; text-decoration:none; white-space:nowrap; padding:5px 1px; border-bottom:2px solid transparent; transition:color .15s ease, border-color .15s ease;";
      a.addEventListener('click', function (e) {
        var t = document.querySelector(it[1]);
        if (t) { e.preventDefault(); var y = t.getBoundingClientRect().top + window.scrollY - (hh + bar.offsetHeight + 14); window.scrollTo({ top: y, behavior: 'smooth' }); }
      });
      inner.appendChild(a); links.push([a, it[1]]);
    });
    bar.appendChild(inner);
    document.body.appendChild(bar);
    jump.done = true;
    function onScroll() {
      bar.style.transform = (window.scrollY > 460) ? 'none' : 'translateY(-140%)';
      var act = null;
      for (var i = 0; i < links.length; i++) { var t = document.querySelector(links[i][1]); if (t && t.getBoundingClientRect().top <= hh + 90) act = links[i]; }
      links.forEach(function (l) { var on = (l === act); l[0].style.color = on ? '#14432F' : '#57534A'; l[0].style.borderColor = on ? '#C98A2B' : 'transparent'; });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () { var h2 = header ? Math.round(header.getBoundingClientRect().height) : 62; bar.style.top = h2 + 'px'; });
    onScroll();
  }

  whenContent(function () {
    setupReveal();
    setupMegaMenu();
    setupJumpNav();
    setupPopup();
    // support.js may remount the <x-dc> template after we first run, which
    // discards the injected menu. Rebuild whenever a fresh nav appears.
    var mo = new MutationObserver(function () { setupMegaMenu(); });
    if (document.body) mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { mo.disconnect(); }, 12000);
  });
})();
