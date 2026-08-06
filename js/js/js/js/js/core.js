/* ==========================================================================
   No Cap — core runtime
   Preferences, i18n, custom cursor, particle field, reveals, toasts, helpers.
   ========================================================================== */

(function () {
  "use strict";

  var STORE_KEY = "nocap.prefs.v1";
  var DEFAULTS = { theme: "dark", lang: "en", motion: true, cursor: true };

  /* ---------------------------------------------------------------- prefs */

  function readPrefs() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return Object.assign({}, DEFAULTS);
      return Object.assign({}, DEFAULTS, JSON.parse(raw));
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function writePrefs(prefs) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(prefs));
    } catch (e) {
      /* storage blocked — settings simply won't persist */
    }
  }

  var prefs = readPrefs();

  /* ----------------------------------------------------------------- i18n */

  var LANGS = window.NC_LANGS || [{ code: "en", name: "English", native: "English", dir: "ltr" }];
  var STRINGS = window.NC_STRINGS || { en: {} };

  function langMeta(code) {
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i].code === code) return LANGS[i];
    return LANGS[0];
  }

  function t(key) {
    var pack = STRINGS[prefs.lang] || {};
    if (pack[key]) return pack[key];
    return (STRINGS.en && STRINGS.en[key]) || key;
  }

  function applyLang() {
    var meta = langMeta(prefs.lang);
    document.documentElement.lang = meta.code;
    document.documentElement.dir = meta.dir;

    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var key = el.getAttribute("data-i18n");
      var val = t(key);
      if (val) el.textContent = val;
    }
    // data-i18n-ph="key" → placeholder, data-i18n-aria="key" → aria-label
    var phs = document.querySelectorAll("[data-i18n-ph]");
    for (var p = 0; p < phs.length; p++) phs[p].setAttribute("placeholder", t(phs[p].getAttribute("data-i18n-ph")));
    var ars = document.querySelectorAll("[data-i18n-aria]");
    for (var a = 0; a < ars.length; a++) ars[a].setAttribute("aria-label", t(ars[a].getAttribute("data-i18n-aria")));

    document.dispatchEvent(new CustomEvent("nc:lang", { detail: { lang: prefs.lang } }));
  }

  /* ---------------------------------------------------------------- theme */

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", prefs.theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", prefs.theme === "light" ? "#f2f6fb" : "#04070f");
    document.dispatchEvent(new CustomEvent("nc:theme", { detail: { theme: prefs.theme } }));
  }

  function applyMotion() {
    document.body.classList.toggle("no-motion", !prefs.motion);
  }

  function setPref(key, value) {
    prefs[key] = value;
    writePrefs(prefs);
    if (key === "theme") applyTheme();
    if (key === "lang") applyLang();
    if (key === "motion") applyMotion();
    if (key === "cursor") initCursor();
  }

  /* --------------------------------------------------------------- cursor */

  var cursorReady = false;
  function initCursor() {
    var fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!prefs.cursor || !fine) {
      document.body.classList.remove("cursor-ready");
      return;
    }
    document.body.classList.add("cursor-ready");
    if (cursorReady) return;
    cursorReady = true;

    var dot = document.querySelector(".cursor");
    var ring = document.querySelector(".cursor-ring");
    if (!dot || !ring) return;

    var mx = window.innerWidth / 2, my = window.innerHeight / 2;
    var rx = mx, ry = my;

    document.addEventListener("mousemove", function (e) {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = "translate3d(" + mx + "px," + my + "px,0)";
    });
    document.addEventListener("mousedown", function () { document.body.classList.add("cursor-down"); });
    document.addEventListener("mouseup", function () { document.body.classList.remove("cursor-down"); });

    var HOT = "a,button,label,input,textarea,select,summary,[role='button'],.tool-card,.threat,.lang,.dropzone";
    document.addEventListener("mouseover", function (e) {
      var hot = e.target.closest && e.target.closest(HOT);
      document.body.classList.toggle("cursor-hot", !!hot);
    });

    (function loop() {
      rx += (mx - rx) * 0.17;
      ry += (my - ry) * 0.17;
      ring.style.transform = "translate3d(" + rx + "px," + ry + "px,0)";
      requestAnimationFrame(loop);
    })();
  }

  /* ------------------------------------------------------------ particles */

  function initParticles() {
    var canvas = document.getElementById("particles");
    if (!canvas || !prefs.motion) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0, dots = [];

    function accent() {
      return document.documentElement.getAttribute("data-theme") === "light"
        ? "0,147,184"
        : "34,233,255";
    }

    function resize() {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var target = Math.min(84, Math.round((w * h) / 17000));
      dots = [];
      for (var i = 0; i < target; i++) {
        dots.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.22,
          r: Math.random() * 1.5 + 0.5
        });
      }
    }

    var pointer = { x: -999, y: -999 };
    window.addEventListener("mousemove", function (e) { pointer.x = e.clientX; pointer.y = e.clientY; });
    window.addEventListener("mouseout", function () { pointer.x = -999; pointer.y = -999; });

    function frame() {
      ctx.clearRect(0, 0, w, h);
      var rgb = accent();
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        d.x += d.vx; d.y += d.vy;
        if (d.x < 0 || d.x > w) d.vx *= -1;
        if (d.y < 0 || d.y > h) d.vy *= -1;

        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(" + rgb + ",0.55)";
        ctx.fill();

        for (var j = i + 1; j < dots.length; j++) {
          var o = dots[j];
          var dx = d.x - o.x, dy = d.y - o.y;
          var dist2 = dx * dx + dy * dy;
          if (dist2 < 18000) {
            ctx.beginPath();
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(o.x, o.y);
            ctx.strokeStyle = "rgba(" + rgb + "," + (0.16 * (1 - dist2 / 18000)).toFixed(3) + ")";
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }

        var pdx = d.x - pointer.x, pdy = d.y - pointer.y;
        var pd2 = pdx * pdx + pdy * pdy;
        if (pd2 < 26000) {
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(pointer.x, pointer.y);
          ctx.strokeStyle = "rgba(" + rgb + "," + (0.3 * (1 - pd2 / 26000)).toFixed(3) + ")";
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
      }
      requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener("resize", debounce(resize, 220));
    frame();
  }

  /* --------------------------------------------------------------- chrome */

  function initChrome() {
    var head = document.querySelector(".masthead");
    if (head) {
      var onScroll = function () { head.classList.toggle("is-stuck", window.scrollY > 12); };
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    var toggle = document.querySelector(".nav-toggle");
    var nav = document.getElementById("primary-nav");
    if (toggle && nav) {
      toggle.addEventListener("click", function () {
        var open = nav.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
      nav.addEventListener("click", function (e) {
        if (e.target.tagName === "A") {
          nav.classList.remove("is-open");
          toggle.setAttribute("aria-expanded", "false");
        }
      });
    }

    // Mark the active nav entry
    var here = location.pathname.replace(/index\.html$/, "").replace(/\.html$/, "");
    if (here === "") here = "/";
    var links = document.querySelectorAll(".nav a[href]");
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute("href").replace(/\.html$/, "").replace(/index$/, "");
      if (href === here || (href === "/" && here === "/")) links[i].setAttribute("aria-current", "page");
    }

    // Quick theme flip in the header
    var flip = document.querySelector("[data-theme-toggle]");
    if (flip) {
      flip.addEventListener("click", function () {
        setPref("theme", prefs.theme === "dark" ? "light" : "dark");
      });
    }
  }

  /* -------------------------------------------------------------- reveals */

  function initReveals() {
    var items = document.querySelectorAll(".reveal");
    if (!items.length) return;
    if (!("IntersectionObserver" in window)) {
      for (var k = 0; k < items.length; k++) items[k].classList.add("is-in");
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var delay = parseFloat(entry.target.getAttribute("data-delay") || "0");
        setTimeout(function () { entry.target.classList.add("is-in"); }, delay * 1000);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px" });
    for (var i = 0; i < items.length; i++) io.observe(items[i]);
  }

  /* ------------------------------------------------------- pointer glow */

  function initPointerGlow() {
    var cards = document.querySelectorAll(".tool-card");
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        card.addEventListener("mousemove", function (e) {
          var r = card.getBoundingClientRect();
          card.style.setProperty("--mx", (e.clientX - r.left) + "px");
          card.style.setProperty("--my", (e.clientY - r.top) + "px");
        });
      })(cards[i]);
    }
  }

  /* --------------------------------------------------------------- counters */

  function countTo(el, target, opts) {
    opts = opts || {};
    var dur = opts.duration || 1700;
    var dec = opts.decimals || 0;
    var suffix = opts.suffix || "";
    var start = performance.now();
    var from = 0;
    function step(now) {
      var p = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      var value = from + (target - from) * eased;
      el.textContent = value.toLocaleString(undefined, {
        minimumFractionDigits: dec, maximumFractionDigits: dec
      }) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function initCounters() {
    var nodes = document.querySelectorAll("[data-count]");
    if (!nodes.length || !("IntersectionObserver" in window)) {
      for (var n = 0; n < nodes.length; n++) {
        nodes[n].textContent = nodes[n].getAttribute("data-count");
      }
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        countTo(el, parseFloat(el.getAttribute("data-count")), {
          decimals: parseInt(el.getAttribute("data-decimals") || "0", 10),
          suffix: el.getAttribute("data-suffix") || ""
        });
        var stat = el.closest(".stat");
        if (stat) stat.classList.add("is-live");
        io.unobserve(el);
      });
    }, { threshold: 0.4 });
    for (var i = 0; i < nodes.length; i++) io.observe(nodes[i]);
  }

  /* ---------------------------------------------------------------- toasts */

  function toast(message) {
    var host = document.querySelector(".toast-host");
    if (!host) {
      host = document.createElement("div");
      host.className = "toast-host";
      document.body.appendChild(host);
    }
    var el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.2v.1"/></svg><span></span>';
    el.querySelector("span").textContent = message;
    host.appendChild(el);
    setTimeout(function () {
      el.classList.add("is-out");
      setTimeout(function () { el.remove(); }, 320);
    }, 4200);
  }

  /* ----------------------------------------------------------- Nova helper */

  var NOVA_TIPS = [
    "Hover a link before clicking it — the real address always shows in the corner of your browser.",
    "A bank will never ask for a one-time code. Nobody legitimate ever will.",
    "If a message pushes you to act in the next 10 minutes, that urgency is the attack.",
    "Zoom into hands and text in an image. Generated pictures still lose the plot there.",
    "Check a shop's returns page and a physical address before you pay.",
    "Reverse-image-search a product photo. Stolen photos mean a stolen storefront."
  ];

  function initNovaHelper() {
    var btn = document.querySelector(".nova-helper");
    var bubble = document.querySelector(".nova-bubble");
    if (!btn || !bubble) return;
    var idx = Math.floor(Math.random() * NOVA_TIPS.length);
    var timer = null;

    function say(text) {
      bubble.textContent = text;
      bubble.classList.add("is-shown");
      clearTimeout(timer);
      timer = setTimeout(function () { bubble.classList.remove("is-shown"); }, 7000);
    }

    btn.addEventListener("click", function () {
      idx = (idx + 1) % NOVA_TIPS.length;
      say(NOVA_TIPS[idx]);
    });
  }

  /* ------------------------------------------------------------- utilities */

  function debounce(fn, wait) {
    var t2 = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t2);
      t2 = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  var ICONS = {
    check: '<path d="M4 12.5l5 5L20 6.5"/>',
    warn: '<path d="M12 3.5L1.8 20.5h20.4L12 3.5z"/><path d="M12 10v4.2M12 17.4v.1"/>',
    cross: '<path d="M6 6l12 12M18 6L6 18"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.7v.1"/>',
    arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    eye: '<path d="M1.6 12S5.8 5 12 5s10.4 7 10.4 7-4.2 7-10.4 7S1.6 12 1.6 12z"/><circle cx="12" cy="12" r="3.1"/>',
    shield: '<path d="M12 2.6l8 3.2v6c0 5-3.4 8.5-8 9.6-4.6-1.1-8-4.6-8-9.6v-6l8-3.2z"/>',
    scan: '<path d="M3 8V5a2 2 0 012-2h3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M21 16v3a2 2 0 01-2 2h-3M3 12h18"/>'
  };

  function icon(name, size) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" width="' + (size || 18) + '" height="' + (size || 18) +
      '" aria-hidden="true">' + (ICONS[name] || ICONS.info) + "</svg>";
  }

  /** Fire-and-forget: log an anonymised scan so the homepage dashboard stays live. */
  function recordScan(tool, verdict, score) {
    try {
      var body = JSON.stringify({ tool: tool, verdict: verdict, score: Math.round(score) });
      fetch("/api/scans", { method: "POST", headers: { "Content-Type": "application/json" }, body: body })
        .catch(function () {});
    } catch (e) { /* telemetry is optional */ }
  }

  /** Map a 0-100 risk score to a verdict band. */
  function band(score) {
    if (score >= 65) return "danger";
    if (score >= 33) return "caution";
    return "safe";
  }

  function bandColor(b) {
    if (typeof b === "number") b = band(b);
    var styles = getComputedStyle(document.documentElement);
    if (b === "danger") return styles.getPropertyValue("--danger").trim();
    if (b === "caution") return styles.getPropertyValue("--warn").trim();
    return styles.getPropertyValue("--safe").trim();
  }

  function bandLabel(b) {
    if (typeof b === "number") b = band(b);
    if (b === "danger") return t("st_danger");
    if (b === "caution") return t("st_caution");
    return t("st_safe");
  }

  /**
   * Paint the shared verdict block every detector page uses: the radial dial,
   * the linear meter, the headline label and its explanation.
   * `bandName` is passed separately because some tools score upwards (an
   * authenticity score) and others downwards (a risk score).
   */
  var DIAL_CIRC = 2 * Math.PI * 60; // the dial markup uses r="60"

  function paintVerdict(score, bandName, label, sub) {
    var arc = document.getElementById("dialArc");
    var num = document.getElementById("riskScore");
    var fill = document.getElementById("meterFill");
    var labelEl = document.getElementById("verdictLabel");
    var subEl = document.getElementById("verdictSub");
    var colour = bandColor(bandName);

    if (num) {
      num.textContent = "0";
      num.style.color = colour;
      countTo(num, score, { duration: 1200 });
    }
    if (arc) {
      arc.style.strokeDasharray = DIAL_CIRC.toFixed(2);
      arc.style.stroke = colour;
      arc.style.strokeDashoffset = (DIAL_CIRC * (1 - score / 100)).toFixed(2);
    }
    if (fill) fill.style.width = Math.max(3, score) + "%";
    if (labelEl) {
      labelEl.textContent = label;
      labelEl.style.color = colour;
    }
    if (subEl) subEl.textContent = sub || "";
  }

  /** Render a list of {state, name, detail} into a `.findings` container. */
  var FINDING_CLASS = {
    pass: "finding--pass", clear: "finding--pass",
    warn: "finding--warn", maybe: "finding--warn", unclear: "finding--warn",
    fail: "finding--fail", flag: "finding--fail", suspect: "finding--fail"
  };
  var FINDING_ICON = {
    pass: "check", clear: "check",
    warn: "warn", maybe: "warn", unclear: "info",
    fail: "cross", flag: "cross", suspect: "cross"
  };

  function renderFindings(container, items) {
    if (!container) return;
    if (!items || !items.length) {
      container.innerHTML = '<div class="empty"><p>Nothing to report here.</p></div>';
      return;
    }
    var order = { fail: 0, flag: 0, suspect: 0, warn: 1, maybe: 1, unclear: 2, pass: 3, clear: 3 };
    var sorted = items.slice().sort(function (a, b) {
      return (order[a.state] || 2) - (order[b.state] || 2);
    });
    container.innerHTML = sorted.map(function (f) {
      return '<div class="finding ' + (FINDING_CLASS[f.state] || "finding--warn") + '">' +
        '<span class="finding__icon">' + icon(FINDING_ICON[f.state] || "info", 18) + "</span>" +
        "<div><b>" + esc(f.name) + "</b><p>" + esc(f.detail) + "</p></div>" +
        (f.weight != null ? '<span class="finding__weight">' + esc(f.weight) + "</span>" : "") +
      "</div>";
    }).join("");
  }

  /* ------------------------------------------------------------------ boot */

  function boot() {
    applyTheme();
    applyMotion();
    applyLang();
    initChrome();
    initCursor();
    initParticles();
    initReveals();
    initPointerGlow();
    initCounters();
    initNovaHelper();
  }

  window.NC = {
    prefs: prefs,
    setPref: setPref,
    getPref: function (k) { return prefs[k]; },
    langs: LANGS,
    t: t,
    applyLang: applyLang,
    toast: toast,
    icon: icon,
    esc: esc,
    debounce: debounce,
    countTo: countTo,
    band: band,
    bandColor: bandColor,
    bandLabel: bandLabel,
    recordScan: recordScan,
    paintVerdict: paintVerdict,
    renderFindings: renderFindings,
    initReveals: initReveals
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
