/* NELCRUM Solutions — Shop page behavior
 * 1. Buy buttons: resolve each [data-nc-buy] to its Stripe Payment Link
 *    (configured in enhance.js → window.NC_STRIPE). Empty link falls back
 *    to contact.html?buy=<sku>.
 * 2. Waitlist forms: [data-nc-wait] forms post to the shared Sheet endpoint
 *    with the product name, then show a confirmation.
 * 3. Bot guard: each form gets a hidden honeypot field bots auto-fill, and
 *    every post carries hp + elapsed (ms since page load) so the Apps Script
 *    receiver (nelcrum-contact-form.gs) can quarantine bot submissions.
 */
(function () {
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycby6VPp5kEWJupRvJH2xRvs5D14CEGQvxaMR3kDFH43WTTv69_DL3ZesS8NFKdTxvMgFGg/exec';

  function ready(cb) {
    var start = Date.now();
    (function poll() {
      if (document.querySelector('[data-nc-buy], [data-nc-wait]')) return cb();
      if (Date.now() - start > 8000) return;
      requestAnimationFrame(poll);
    })();
  }

  ready(function () {
    // Buy links
    var buys = document.querySelectorAll('[data-nc-buy]');
    for (var i = 0; i < buys.length; i++) {
      var el = buys[i];
      var sku = el.getAttribute('data-nc-buy');
      el.setAttribute('href', window.ncBuyLink ? window.ncBuyLink(sku) : 'contact.html?buy=' + sku);
    }
    // Waitlist forms
    var forms = document.querySelectorAll('form[data-nc-wait]');
    for (var j = 0; j < forms.length; j++) {
      (function (f) {
        // Honeypot: a hidden "website" field humans never see. Bots auto-fill it.
        var hp = document.createElement('input');
        hp.type = 'text'; hp.name = 'website'; hp.tabIndex = -1;
        hp.setAttribute('autocomplete', 'off');
        hp.setAttribute('aria-hidden', 'true');
        hp.style.cssText = 'position:absolute;left:-9999px;top:-9999px;height:1px;width:1px;overflow:hidden;';
        f.appendChild(hp);
        f.addEventListener('submit', function (e) {
          e.preventDefault();
          var input = f.querySelector('input[type="email"]');
          var em = input ? input.value.trim() : '';
          if (em.indexOf('@') < 1) { if (input) input.style.borderColor = '#B04A3C'; return; }
          if (!hp.value) { // honeypot tripped -> send nothing, but still "succeed" so the bot learns nothing
            try {
              var body = new URLSearchParams({ name: '', email: em, organization: '', message: 'Shop waitlist: ' + f.getAttribute('data-nc-wait'), submittedAt: new Date().toISOString(), source: 'Shop waitlist', hp: '', elapsed: String(Math.round(performance.now())) });
              fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
            } catch (err) {}
          }
          f.innerHTML = '<div style="font-size:13.5px; font-weight:700; color:#14432F;">You\u2019re on the list \u2014 we\u2019ll email you at launch.</div>';
        });
      })(forms[j]);
    }
  });
})();
