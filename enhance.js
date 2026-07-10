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

  whenContent(function () {
    setupReveal();
    setupPopup();
  });
})();
