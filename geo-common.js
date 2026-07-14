/* NELCRUM Solutions — shared geography + data layer for the funder/agency tools.
 * Exposes window.NCGeo:
 *   loadTracts()   → { byGeoid: Map(geoid → {t20,t24,msa20,msa24,cls}), counties: Map(fips → agg), states: Map(st → agg) }
 *   loadACS()      → Map(fips → {name, st, pop, mhi, povU, povN, lf, unemp, eduU, ba, rent, homeVal})
 *   geocode(q)     → Promise({geoid, county, matched, lon, lat})
 *   cbsaName(fips) → metro name for a county fips (or null)
 *   band(pct), bandColor, money, fmt, pct, esc, STATE_NAMES, FIPS_STATE
 */
(function () {
  var NCGeo = {};
  var tokenSuffix = (function () {
    var m = (location.search || '').match(/[?&]t=([^&]+)/);
    return m ? '?t=' + m[1] : '';
  })();

  // ---------- formatting ----------
  NCGeo.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  NCGeo.money = function (n) {
    if (n == null || isNaN(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3).toLocaleString() + 'K';
    return '$' + Math.round(n).toLocaleString();
  };
  NCGeo.fmt = function (n) { return n == null || isNaN(n) ? 'n/a' : Math.round(n).toLocaleString(); };
  NCGeo.pct = function (n, d) { return n == null || isNaN(n) ? 'n/a' : n.toFixed(d == null ? 1 : d) + '%'; };

  // ---------- CRA income bands (FFIEC definitions) ----------
  // pct = tract median family income as a % of area (MSA or statewide non-metro) median
  NCGeo.band = function (pct) {
    if (pct == null || isNaN(pct)) return { key: 'unknown', label: 'Unknown', lmi: false, color: '#8A857B', bg: '#EFEEE9' };
    if (pct < 50) return { key: 'low', label: 'Low income', lmi: true, color: '#8A2E1F', bg: '#F6E3DC' };
    if (pct < 80) return { key: 'moderate', label: 'Moderate income', lmi: true, color: '#A2643F', bg: '#F3E7D8' };
    if (pct < 120) return { key: 'middle', label: 'Middle income', lmi: false, color: '#3F6A55', bg: '#E6F1E9' };
    return { key: 'upper', label: 'Upper income', lmi: false, color: '#14432F', bg: '#DFEBE2' };
  };

  // ---------- states ----------
  NCGeo.STATE_NAMES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' };
  NCGeo.FIPS_STATE = { '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY' };
  NCGeo.STATE_FIPS = {};
  Object.keys(NCGeo.FIPS_STATE).forEach(function (f) { NCGeo.STATE_FIPS[NCGeo.FIPS_STATE[f]] = f; });

  // ---------- tract mobility file ----------
  var tractsPromise = null;
  NCGeo.loadTracts = function () {
    if (tractsPromise) return tractsPromise;
    tractsPromise = fetch('./tract-mobility.csv' + tokenSuffix, { cache: 'force-cache' })
      .then(function (r) { if (!r.ok) throw new Error('tract file'); return r.text(); })
      .then(function (txt) {
        var byGeoid = new Map(), counties = new Map(), states = new Map();
        var lines = txt.split('\n');
        for (var i = 1; i < lines.length; i++) {
          var L = lines[i]; if (!L || L.length < 12) continue;
          var p = L.split(',');
          var geoid = p[0], t20 = parseFloat(p[1]), t24 = parseFloat(p[2]);
          var rec = { t20: t20, t24: t24, msa20: p[3], msa24: p[4], cls: (p[5] || '').trim() };
          byGeoid.set(geoid, rec);
          var cf = geoid.slice(0, 5), sf = geoid.slice(0, 2);
          var c = counties.get(cf);
          if (!c) { c = { fips: cf, st: NCGeo.FIPS_STATE[sf] || sf, n: 0, lmi: 0, low: 0, mod: 0, mid: 0, up: 0, sum24: 0, sum20: 0, n20: 0, upCls: 0, dnCls: 0, msa: null }; counties.set(cf, c); }
          c.n++;
          if (!isNaN(t24)) {
            c.sum24 += t24;
            if (t24 < 50) { c.low++; c.lmi++; } else if (t24 < 80) { c.mod++; c.lmi++; } else if (t24 < 120) { c.mid++; } else { c.up++; }
          }
          if (!isNaN(t20)) { c.sum20 += t20; c.n20++; }
          if (!isNaN(t20) && !isNaN(t24)) { if (t24 - t20 >= 2) c.upCls++; else if (t20 - t24 >= 2) c.dnCls++; }
          if (!c.msa && p[4] && p[4] !== 'NA') c.msa = p[4];
          var s = states.get(c.st);
          if (!s) { s = { st: c.st, n: 0, lmi: 0, sum24: 0, upCls: 0, dnCls: 0, bands: [0, 0, 0, 0] }; states.set(c.st, s); }
          s.n++;
          if (!isNaN(t24)) {
            s.sum24 += t24;
            if (t24 < 50) { s.bands[0]++; s.lmi++; } else if (t24 < 80) { s.bands[1]++; s.lmi++; } else if (t24 < 120) { s.bands[2]++; } else { s.bands[3]++; }
          }
          if (!isNaN(t20) && !isNaN(t24)) { if (t24 - t20 >= 2) s.upCls++; else if (t20 - t24 >= 2) s.dnCls++; }
        }
        return { byGeoid: byGeoid, counties: counties, states: states };
      });
    return tractsPromise;
  };

  // ---------- ACS 2023 5-year county profile (runtime, cached) ----------
  var ACS_URL = 'https://api.census.gov/data/2023/acs/acs5?get=NAME,B01003_001E,B19013_001E,B17001_001E,B17001_002E,B23025_003E,B23025_005E,B15003_001E,B15003_022E,B15003_023E,B15003_024E,B15003_025E,B25064_001E,B25077_001E&for=county:*';
  var acsPromise = null;
  NCGeo.loadACS = function () {
    if (acsPromise) return acsPromise;
    acsPromise = new Promise(function (resolve) {
      var cached = null;
      try { cached = JSON.parse(localStorage.getItem('nc_acs23_v1') || 'null'); } catch (e) {}
      if (cached && cached.rows && cached.rows.length > 3000) { resolve(toMap(cached.rows)); return; }
      fetch(ACS_URL)
        .then(function (r) { if (!r.ok) throw new Error('acs'); return r.json(); })
        .then(function (json) {
          var rows = [];
          for (var i = 1; i < json.length; i++) {
            var r = json[i];
            rows.push([r[14] + r[15], r[0], num(r[1]), num(r[2]), num(r[3]), num(r[4]), num(r[5]), num(r[6]), num(r[7]), num(r[8]) + num(r[9]) + num(r[10]) + num(r[11]), num(r[12]), num(r[13])]);
          }
          try { localStorage.setItem('nc_acs23_v1', JSON.stringify({ rows: rows })); } catch (e) {}
          resolve(toMap(rows));
        })
        .catch(function () { resolve(null); });
    });
    function num(v) { var n = Number(v); return isNaN(n) || n < -100000 ? 0 : n; }
    function toMap(rows) {
      var m = new Map();
      rows.forEach(function (r) {
        var name = r[1], comma = name.lastIndexOf(',');
        m.set(r[0], {
          fips: r[0],
          name: comma > 0 ? name.slice(0, comma) : name,
          stName: comma > 0 ? name.slice(comma + 1).trim() : '',
          st: NCGeo.FIPS_STATE[r[0].slice(0, 2)] || '',
          pop: r[2], mhi: r[3], povU: r[4], povN: r[5], lf: r[6], unemp: r[7],
          eduU: r[8], ba: r[9], rent: r[10], homeVal: r[11],
          povRate: r[4] > 0 ? (r[5] / r[4]) * 100 : null,
          unempRate: r[6] > 0 ? (r[7] / r[6]) * 100 : null,
          baRate: r[8] > 0 ? (r[9] / r[8]) * 100 : null
        });
      });
      return m;
    }
    return acsPromise;
  };

  // ---------- county → CBSA name ----------
  var cbsaPromise = null;
  NCGeo.loadCBSA = function () {
    if (cbsaPromise) return cbsaPromise;
    cbsaPromise = fetch('./data/zip-county-cbsa.json' + tokenSuffix, { cache: 'force-cache' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var m = new Map();
        (j.cbsas || []).forEach(function (c) { (c.counties || []).forEach(function (f) { m.set(f, c.name); }); });
        return m;
      })
      .catch(function () { return new Map(); });
    return cbsaPromise;
  };

  // ---------- county centers ----------
  var centersPromise = null;
  NCGeo.loadCenters = function () {
    if (centersPromise) return centersPromise;
    centersPromise = fetch('./data/county_centers.csv' + tokenSuffix, { cache: 'force-cache' })
      .then(function (r) { return r.text(); })
      .then(function (txt) {
        var m = new Map(), lines = txt.split('\n');
        for (var i = 1; i < lines.length; i++) {
          var p = lines[i].split(',');
          if (p.length < 9) continue;
          var lon = parseFloat(p[7]), lat = parseFloat(p[8]);
          if (isNaN(lon)) { lon = parseFloat(p[5]); lat = parseFloat(p[6]); }
          if (isNaN(lon)) { lon = parseFloat(p[3]); lat = parseFloat(p[4]); }
          if (!isNaN(lon) && !isNaN(lat)) m.set(p[0], { lon: lon, lat: lat });
        }
        return m;
      })
      .catch(function () { return new Map(); });
    return centersPromise;
  };

  // ---------- county names (bundled, always available) ----------
  var namesPromise = null;
  NCGeo.loadNames = function () {
    if (namesPromise) return namesPromise;
    namesPromise = fetch('./data/county-names.csv' + tokenSuffix, { cache: 'force-cache' })
      .then(function (r) { return r.text(); })
      .then(function (txt) {
        var m = new Map(), lines = txt.split('\n');
        for (var i = 1; i < lines.length; i++) {
          var p = lines[i].split(',');
          if (p.length < 3) continue;
          m.set(p[0], { name: p.slice(1, p.length - 1).join(','), st: p[p.length - 1].trim() });
        }
        return m;
      })
      .catch(function () { return new Map(); });
    return namesPromise;
  };

  // ---------- merged county profiles ----------
  // Names + our tract aggregates always work (bundled files). ACS socioeconomic
  // fields enrich the profile when api.census.gov is reachable (production);
  // when it is not, those fields are null and hasACS is false.
  var countiesPromise = null;
  NCGeo.loadCounties = function () {
    if (countiesPromise) return countiesPromise;
    countiesPromise = Promise.all([NCGeo.loadNames(), NCGeo.loadACS(), NCGeo.loadTracts()]).then(function (res) {
      var names = res[0], acs = res[1], tracts = res[2];
      var byFips = new Map();
      function ensure(fips) {
        var e = byFips.get(fips);
        if (!e) {
          var nm = names.get(fips);
          e = { fips: fips, name: nm ? nm.name : 'County FIPS ' + fips, st: nm ? nm.st : (NCGeo.FIPS_STATE[fips.slice(0, 2)] || ''), pop: null, mhi: null, povRate: null, unempRate: null, baRate: null, rent: null, homeVal: null, tr: null };
          byFips.set(fips, e);
        }
        return e;
      }
      names.forEach(function (v, fips) { ensure(fips); });
      tracts.counties.forEach(function (c, fips) { ensure(fips).tr = c; });
      if (acs) acs.forEach(function (a, fips) {
        var e = ensure(fips);
        e.pop = a.pop || null; e.mhi = a.mhi || null; e.povRate = a.povRate; e.unempRate = a.unempRate;
        e.baRate = a.baRate; e.rent = a.rent || null; e.homeVal = a.homeVal || null;
        if (a.name) { e.name = a.name; }
      });
      return { byFips: byFips, hasACS: !!acs };
    });
    return countiesPromise;
  };

  // ---------- Census geocoder (address → tract) ----------
  NCGeo.geocode = function (oneline) {
    var url = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=' + encodeURIComponent(oneline) + '&benchmark=Public_AR_Current&vintage=Current_Current&layers=Census%20Tracts&format=json';
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('Geocoder unavailable');
      return r.json();
    }).then(function (j) {
      var m = j && j.result && j.result.addressMatches && j.result.addressMatches[0];
      if (!m) throw new Error('NOMATCH');
      var tr = m.geographies && m.geographies['Census Tracts'] && m.geographies['Census Tracts'][0];
      if (!tr) throw new Error('NOMATCH');
      return {
        geoid: tr.GEOID,
        county: tr.GEOID.slice(0, 5),
        tractName: tr.NAME,
        matched: m.matchedAddress,
        lon: m.coordinates.x,
        lat: m.coordinates.y
      };
    });
  };

  // ---------- great-circle distance (miles) ----------
  NCGeo.distMi = function (lat1, lon1, lat2, lon2) {
    var R = 3958.8, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // ---------- shared email-gate helper (same Apps Script sheet as other tools) ----------
  NCGeo.ENDPOINT = 'https://script.google.com/macros/s/AKfycby6VPp5kEWJupRvJH2xRvs5D14CEGQvxaMR3kDFH43WTTv69_DL3ZesS8NFKdTxvMgFGg/exec';
  NCGeo.logLead = function (email, toolLabel, detail) {
    try {
      var body = new URLSearchParams({ name: '', email: email, organization: '', message: toolLabel + ' unlock: ' + (detail || ''), source: toolLabel, hp: '', elapsed: String(Math.round(performance.now())) });
      fetch(NCGeo.ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    } catch (e) {}
  };

  window.NCGeo = NCGeo;
})();
