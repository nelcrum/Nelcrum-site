/* NELCRUM Solutions — Shop page behavior
 * 1. Buy buttons: resolve each [data-nc-buy] to its Stripe Payment Link
 *    (configured in enhance.js → window.NC_STRIPE). Empty link falls back
 *    to contact.html?buy=<sku>.
 * 2. Waitlist forms: [data-nc-wait] forms post to the shared Sheet endpoint
 *    with the product name, then show a confirmation.
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
        f.addEventListener('submit', function (e) {
          e.preventDefault();
          var input = f.querySelector('input[type="email"]');
          var em = input ? input.value.trim() : '';
          if (em.indexOf('@') < 1) { if (input) input.style.borderColor = '#B04A3C'; return; }
          try {
            var body = new URLSearchParams({ name: '', email: em, organization: '', message: 'Shop waitlist: ' + f.getAttribute('data-nc-wait'), submittedAt: new Date().toISOString(), source: 'Shop waitlist' });
            fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
          } catch (err) {}
          f.innerHTML = '<div style="font-size:13.5px; font-weight:700; color:#14432F;">You\u2019re on the list \u2014 we\u2019ll email you at launch.</div>';
        });
      })(forms[j]);
    }
  });
})();
