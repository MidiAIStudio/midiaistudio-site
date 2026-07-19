/**
 * Google Analytics 4 + Search Console / Bing verification meta injection.
 * Uses MIDIAI_CONFIG from config.js when available.
 */
(function initMidiAiAnalytics() {
  var MEASUREMENT_FALLBACK = "G-L1YHRBLDN9";

  function cfg() {
    return window.MIDIAI_CONFIG || {};
  }

  function getId() {
    try {
      return (cfg().firebase && cfg().firebase.measurementId) || MEASUREMENT_FALLBACK;
    } catch (e) {
      return MEASUREMENT_FALLBACK;
    }
  }

  function injectVerification() {
    var seo = cfg().seo || {};
    if (seo.googleSiteVerification && !document.querySelector('meta[name="google-site-verification"]')) {
      var g = document.createElement("meta");
      g.name = "google-site-verification";
      g.content = seo.googleSiteVerification;
      document.head.appendChild(g);
    }
    if (seo.bingSiteVerification && !document.querySelector('meta[name="msvalidate.01"]')) {
      var b = document.createElement("meta");
      b.name = "msvalidate.01";
      b.content = seo.bingSiteVerification;
      document.head.appendChild(b);
    }
  }

  function loadGa() {
    var id = getId();
    if (!id || window.__MIDIAI_GA_LOADED) return;
    window.__MIDIAI_GA_LOADED = true;

    window.dataLayer = window.dataLayer || [];
    function gtag() {
      window.dataLayer.push(arguments);
    }
    window.gtag = gtag;
    gtag("js", new Date());
    gtag("config", id, { anonymize_ip: true });

    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    document.head.appendChild(s);
  }

  function boot() {
    injectVerification();
    loadGa();
  }

  function start() {
    // config.js is type=module (deferred) — retry briefly until available
    var tries = 0;
    (function tick() {
      tries += 1;
      if (window.MIDIAI_CONFIG || tries > 20) boot();
      else setTimeout(tick, 50);
    })();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
