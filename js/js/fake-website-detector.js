/* ==========================================================================
   No Cap — Fake Website Detector
   Twelve structural checks run locally, then an optional model second opinion.
   Every point on the score traces back to a named signal.
   ========================================================================== */

(function () {
  "use strict";

  var NC = window.NC || {};

  var form = document.getElementById("scanForm");
  if (!form) return;

  var input = document.getElementById("urlInput");
  var errorEl = document.getElementById("urlError");
  var scanBtn = document.getElementById("scanBtn");
  var scanner = document.getElementById("scanner");
  var scannerLog = document.getElementById("scannerLog");
  var result = document.getElementById("result");
  var dialArc = document.getElementById("dialArc");
  var scoreEl = document.getElementById("riskScore");
  var meterFill = document.getElementById("meterFill");
  var labelEl = document.getElementById("verdictLabel");
  var subEl = document.getElementById("verdictSub");
  var urlEl = document.getElementById("scannedUrl");
  var findingsEl = document.getElementById("findings");
  var aiNote = document.getElementById("aiNote");

  var DIAL_CIRC = 2 * Math.PI * 60;
  if (dialArc) {
    dialArc.style.strokeDasharray = DIAL_CIRC.toFixed(2);
    dialArc.style.strokeDashoffset = DIAL_CIRC.toFixed(2);
  }

  /* ------------------------------------------------------ signal catalogue */

  var SHORTENERS = [
    "bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "is.gd", "buff.ly",
    "rebrand.ly", "cutt.ly", "shorturl.at", "rb.gy", "t.ly", "bl.ink",
    "tiny.cc", "s.id", "lnkd.in", "shorte.st", "adf.ly", "bit.do", "v.gd"
  ];

  var BAIT_WORDS = [
    "verify", "secure", "account", "update", "confirm", "login", "signin",
    "password", "billing", "invoice", "refund", "claim", "reward", "bonus",
    "prize", "winner", "lottery", "gift", "free", "offer", "kyc", "otp",
    "unlock", "suspend", "limited", "urgent", "recovery", "wallet", "airdrop",
    "support", "helpdesk", "delivery", "customs", "parcel", "tracking"
  ];

  var BRANDS = [
    "paypal", "amazon", "apple", "microsoft", "google", "netflix", "facebook",
    "instagram", "whatsapp", "flipkart", "paytm", "phonepe", "sbi", "hdfc",
    "icici", "axis", "dhl", "fedex", "usps", "royalmail", "linkedin", "steam",
    "binance", "coinbase", "metamask", "outlook", "office365", "bankofamerica",
    "chase", "wellsfargo", "hsbc", "barclays", "santander", "irs", "gov"
  ];

  // Top-level domains that are cheap, disposable and heavily abused.
  var RISKY_TLDS = [
    "top", "xyz", "gq", "tk", "ml", "cf", "ga", "buzz", "click", "link",
    "work", "loan", "men", "date", "review", "country", "stream", "download",
    "racing", "win", "bid", "party", "science", "rest", "cyou", "sbs", "quest",
    "monster", "zip", "mov"
  ];

  var RISKY_FILES = [".apk", ".exe", ".scr", ".msi", ".bat", ".dmg", ".jar", ".vbs"];

  var CHECKS = [
    { id: "https", name: "Encrypted connection", why: "Plain HTTP means anything you type can be read in transit — and modern real sites simply do not use it." },
    { id: "shortener", name: "Link shortener", why: "A shortener hides the true destination until after you have clicked." },
    { id: "ip", name: "Raw IP address host", why: "Legitimate consumer brands publish a name, not a numeric address." },
    { id: "bait", name: "Bait keywords", why: "Words like verify, refund, kyc and unlock are the vocabulary of the pressure being applied to you." },
    { id: "brand", name: "Brand impersonation", why: "A famous brand appearing outside its own registered domain — usually in a subdomain or hyphenated prefix." },
    { id: "typo", name: "Lookalike spelling", why: "Digit-for-letter swaps and doubled characters read correctly at a glance but resolve elsewhere." },
    { id: "hyphens", name: "Hyphen stuffing", why: "Three or more hyphens in a hostname is a keyword advert, not a brand." },
    { id: "length", name: "Unusual length", why: "Very long addresses bury the real domain past the edge of a phone's address bar." },
    { id: "chars", name: "Special characters", why: "An @ in the authority, percent-encoding or punycode can make an address display as one site and load another." },
    { id: "tld", name: "Top-level domain", why: "Some endings cost cents and are registered in bulk for campaigns that last a weekend." },
    { id: "depth", name: "Subdomain depth", why: "Four or more labels usually means the real owner is hidden behind a wall of reassuring words." },
    { id: "payload", name: "Payload and redirect bait", why: "Direct installer downloads and open redirect parameters are how a click becomes an infection." }
  ];

  /* ------------------------------------------------------------- utilities */

  function normalise(raw) {
    var value = String(raw || "").trim();
    if (!value) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = "http://" + value;
    var url;
    try { url = new URL(value); } catch (e) { return null; }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname || url.hostname.indexOf(".") === -1) {
      if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname)) return null;
    }
    return url;
  }

  function registrableParts(hostname) {
    // Not a full public-suffix list — enough to tell "brand.com" from
    // "brand.com.something.live" for the checks below.
    var labels = hostname.split(".");
    var secondLevel = ["co", "com", "org", "net", "gov", "edu", "ac"];
    if (labels.length >= 3 && secondLevel.indexOf(labels[labels.length - 2]) !== -1 &&
        labels[labels.length - 1].length === 2) {
      return { root: labels.slice(-3).join("."), sub: labels.slice(0, -3), tld: labels[labels.length - 1] };
    }
    return { root: labels.slice(-2).join("."), sub: labels.slice(0, -2), tld: labels[labels.length - 1] };
  }

  /* ------------------------------------------------------- the analysis */

  function analyse(url) {
    var host = url.hostname.toLowerCase();
    var full = url.href.toLowerCase();
    var path = (url.pathname + url.search).toLowerCase();
    var parts = registrableParts(host);
    var findings = [];
    var score = 0;

    function add(id, state, weight, detail) {
      var check = CHECKS.filter(function (c) { return c.id === id; })[0] || { name: id, why: "" };
      findings.push({ id: id, name: check.name, state: state, weight: weight, detail: detail });
      score += weight;
    }

    // 1 — transport
    if (url.protocol === "https:") {
      add("https", "pass", 0, "The connection is encrypted (HTTPS). Note this proves the pipe is private, not that the owner is honest.");
    } else {
      add("https", "fail", 18, "This link uses unencrypted HTTP. Anything typed into the page travels in the clear, and mainstream sites abandoned HTTP years ago.");
    }

    // 2 — shortener
    var isShort = SHORTENERS.indexOf(parts.root) !== -1 || SHORTENERS.indexOf(host) !== -1;
    if (isShort) {
      add("shortener", "warn", 20, "“" + host + "” is a link shortener. The real destination is hidden until the moment you land on it.");
    } else {
      add("shortener", "pass", 0, "Not a known shortening service, so the destination is visible up front.");
    }

    // 3 — raw IP
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^\[[0-9a-f:]+\]$/i.test(url.hostname)) {
      add("ip", "fail", 26, "The host is a raw IP address rather than a domain name. Genuine consumer services never ask you to sign in at a number.");
    } else {
      add("ip", "pass", 0, "The host is a normal domain name.");
    }

    // 4 — bait vocabulary
    var hits = BAIT_WORDS.filter(function (w) { return full.indexOf(w) !== -1; });
    if (hits.length >= 3) {
      add("bait", "fail", 16, "Three or more pressure words appear in the address: " + hits.slice(0, 6).join(", ") + ".");
    } else if (hits.length > 0) {
      add("bait", "warn", 7, "Pressure wording found in the address: " + hits.join(", ") + ". Common on real login pages too, so weigh it with the rest.");
    } else {
      add("bait", "pass", 0, "No urgency or account-recovery vocabulary in the address.");
    }

    // 5 — brand impersonation
    var brandHit = BRANDS.filter(function (b) { return host.indexOf(b) !== -1; })[0];
    if (brandHit) {
      var rootHasBrand = parts.root.indexOf(brandHit) === 0 ||
                         parts.root === brandHit + "." + parts.tld;
      if (!rootHasBrand) {
        add("brand", "fail", 30, "“" + brandHit + "” appears in the address, but the domain actually being loaded is " +
          parts.root + ". Only the last labels before the first slash decide who owns a site.");
      } else {
        add("brand", "pass", 0, "A known brand name appears and it does own the registered domain (" + parts.root + "). Still confirm the spelling character by character.");
      }
    } else {
      add("brand", "pass", 0, "No major brand name is being borrowed in the hostname.");
    }

    // 6 — lookalike spelling
    var bareRoot = parts.root.replace(/\./g, "");
    var typo = /[a-z]\d[a-z]/.test(bareRoot) ||        // digit wedged between letters
               /([a-z])\1{2,}/.test(bareRoot) ||        // the same letter three times over
               /xn--/.test(host) ||
               /(paypa1|amaz0n|g00gle|micros0ft|faceb00k|app1e|netfl1x|1inkedin|0ffice)/.test(host);
    if (typo) {
      add("typo", "warn", 14, "The domain contains character patterns typical of lookalikes — digits standing in for letters, repeated characters, or punycode.");
    } else {
      add("typo", "pass", 0, "No obvious digit-for-letter substitution in the domain.");
    }

    // 7 — hyphens
    var hyphens = (host.match(/-/g) || []).length;
    if (hyphens >= 3) {
      add("hyphens", "fail", 15, hyphens + " hyphens in the hostname. This is keyword stuffing written for an advert, not a name a company would print.");
    } else if (hyphens === 2) {
      add("hyphens", "warn", 6, "Two hyphens in the hostname. Not damning on its own, but common in campaign domains.");
    } else {
      add("hyphens", "pass", 0, "Hyphen use is normal.");
    }

    // 8 — length
    var len = url.href.length;
    if (len > 120) {
      add("length", "warn", 10, "The address is " + len + " characters long. On a phone the real domain scrolls out of sight, which is precisely the point.");
    } else if (len > 75) {
      add("length", "maybe", 4, "The address is " + len + " characters — longer than average but within normal range for a deep page.");
    } else {
      add("length", "pass", 0, "Address length is unremarkable (" + len + " characters).");
    }

    // 9 — special characters
    var specials = [];
    if (url.username || url.password) {
      specials.push("an @ inside the authority, which hides the real host behind whatever is written before it");
    }
    if (/xn--/.test(host)) specials.push("punycode (a non-Latin script rendered as ASCII)");
    if (/%[0-9a-f]{2}/i.test(path)) specials.push("percent-encoded characters in the path");
    if (url.port && url.port !== "80" && url.port !== "443") specials.push("a non-standard port (" + url.port + ")");
    if (specials.length) {
      add("chars", "fail", 18, "Encoding tricks present: " + specials.join("; ") + ".");
    } else {
      add("chars", "pass", 0, "No encoding tricks or hidden authority characters.");
    }

    // 10 — top-level domain
    if (RISKY_TLDS.indexOf(parts.tld) !== -1) {
      add("tld", "warn", 13, "“." + parts.tld + "” is one of the cheapest endings to register and is heavily used for short-lived campaigns.");
    } else {
      add("tld", "pass", 0, "“." + parts.tld + "” is not on the high-abuse list.");
    }

    // 11 — subdomain depth
    if (parts.sub.length >= 3) {
      add("depth", "fail", 14, parts.sub.length + " subdomain labels in front of " + parts.root + ". Depth like this is used to push reassuring words to the front of a phone's address bar.");
    } else if (parts.sub.length === 2) {
      add("depth", "maybe", 5, "Two subdomain labels. Normal for large sites, worth a second look on a small one.");
    } else {
      add("depth", "pass", 0, "Subdomain structure is simple.");
    }

    // 12 — payload and redirect bait
    var payload = RISKY_FILES.filter(function (ext) { return path.indexOf(ext) !== -1; });
    var redirect = /[?&](url|redirect|next|goto|target|continue|return|r)=/.test(path) && /https?%3a|https?:/.test(path);
    if (payload.length) {
      add("payload", "fail", 24, "The link points directly at an installer file (" + payload.join(", ") + "). Downloading software from a link in a message is how most consumer malware arrives.");
    } else if (redirect) {
      add("payload", "warn", 12, "The address carries another full URL in its parameters — an open redirect that can launder a trusted domain into an untrusted one.");
    } else {
      add("payload", "pass", 0, "No installer download or embedded redirect target.");
    }

    return {
      score: Math.max(0, Math.min(100, Math.round(score))),
      findings: findings,
      host: host,
      root: parts.root
    };
  }

  /* ------------------------------------------------------------ rendering */

  var LOG_STEPS = [
    "resolving address structure",
    "checking transport security",
    "matching shortener registry",
    "scoring hostname composition",
    "comparing against brand list",
    "inspecting path and parameters",
    "requesting model second opinion"
  ];

  function runScannerAnimation() {
    if (!scanner || !scannerLog) return;
    scanner.classList.add("is-on");
    scanner.setAttribute("aria-hidden", "false");
    scannerLog.innerHTML = "";
    LOG_STEPS.forEach(function (step, i) {
      var li = document.createElement("li");
      li.style.animationDelay = (i * 0.16) + "s";
      li.innerHTML = '<b>&rsaquo;</b><span>' + step + '</span>';
      scannerLog.appendChild(li);
    });
  }

  function stopScannerAnimation() {
    if (!scanner) return;
    scanner.classList.remove("is-on");
    scanner.setAttribute("aria-hidden", "true");
  }

  var STATE_CLASS = { pass: "finding--pass", warn: "finding--warn", maybe: "finding--warn", fail: "finding--fail" };
  var STATE_ICON = { pass: "check", warn: "warn", maybe: "warn", fail: "cross" };

  function renderFindings(findings) {
    // Problems first, then the clean checks, so the answer is at the top.
    var order = { fail: 0, warn: 1, maybe: 2, pass: 3 };
    var sorted = findings.slice().sort(function (a, b) {
      if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state];
      return b.weight - a.weight;
    });

    findingsEl.innerHTML = sorted.map(function (f) {
      return '<div class="finding ' + STATE_CLASS[f.state] + '">' +
        '<span class="finding__icon">' + NC.icon(STATE_ICON[f.state], 18) + '</span>' +
        '<div><b>' + NC.esc(f.name) + '</b><p>' + NC.esc(f.detail) + '</p></div>' +
        '<span class="finding__weight">' + (f.weight > 0 ? "+" + f.weight : "0") + '</span>' +
      '</div>';
    }).join("");
  }

  function paintVerdict(score, host) {
    var bandName = NC.band(score);
    var colour = NC.bandColor(score);

    scoreEl.textContent = "0";
    NC.countTo(scoreEl, score, { duration: 1200 });
    scoreEl.style.color = colour;

    dialArc.style.stroke = colour;
    dialArc.style.strokeDashoffset = (DIAL_CIRC * (1 - score / 100)).toFixed(2);
    meterFill.style.width = Math.max(3, score) + "%";

    labelEl.textContent = NC.bandLabel(score);
    labelEl.style.color = colour;

    subEl.textContent =
      bandName === "danger"
        ? "Do not enter anything on this page. If you already did, change that password now and watch the account."
        : bandName === "caution"
          ? "Enough is off here to stop and verify. Reach the site by typing its address or using its app instead of this link."
          : "Nothing structural looks wrong. That is not a guarantee — a brand-new scam site can pass every structural check, so still confirm you meant to go here.";

    urlEl.textContent = host;
  }

  /* ------------------------------------------------------ model enrichment */

  function askModel(href, local) {
    if (!aiNote) return;
    aiNote.hidden = true;

    fetch("/api/analyze-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: href, score: local.score })
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.summary) return;
        aiNote.hidden = false;
        aiNote.className = "notice mt-3" + (data.suspicious ? " notice--warn" : "");
        aiNote.innerHTML = NC.icon(data.suspicious ? "warn" : "info", 17) +
          "<div><b>Model second opinion</b><p style=\"margin-top:.25rem\">" + NC.esc(data.summary) + "</p>" +
          (data.impersonating ? '<p class="mono" style="margin-top:.4rem;font-size:.78rem">Appears to imitate: ' + NC.esc(data.impersonating) + "</p>" : "") +
          "</div>";
      })
      .catch(function () { /* structural verdict stands on its own */ });
  }

  /* ---------------------------------------------------------------- events */

  var lastReport = null;

  function showError(show) {
    if (!errorEl) return;
    errorEl.classList.toggle("is-shown", !!show);
    if (input) input.setAttribute("aria-invalid", show ? "true" : "false");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var url = normalise(input.value);
    if (!url) {
      showError(true);
      input.focus();
      return;
    }
    showError(false);

    scanBtn.disabled = true;
    result.classList.remove("is-shown");
    runScannerAnimation();

    var report = analyse(url);

    setTimeout(function () {
      stopScannerAnimation();
      result.classList.add("is-shown");
      paintVerdict(report.score, url.href);
      renderFindings(report.findings);
      askModel(url.href, report);
      scanBtn.disabled = false;
      result.scrollIntoView({ behavior: "smooth", block: "nearest" });
      NC.recordScan("link", NC.band(report.score), report.score);
      lastReport = { url: url.href, report: report };
    }, 1500);
  });

  form.querySelectorAll("[data-sample]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      input.value = btn.getAttribute("data-sample");
      showError(false);
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { cancelable: true }));
    });
  });

  var resetBtn = document.getElementById("resetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      input.value = "";
      showError(false);
      result.classList.remove("is-shown");
      if (aiNote) aiNote.hidden = true;
      input.focus();
    });
  }

  var copyBtn = document.getElementById("copyBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      if (!lastReport) return;
      var lines = ["No Cap — link report", lastReport.url,
        "Risk score: " + lastReport.report.score + "/100 (" + NC.bandLabel(lastReport.report.score) + ")", ""];
      lastReport.report.findings.forEach(function (f) {
        lines.push("[" + f.state.toUpperCase() + " +" + f.weight + "] " + f.name + " — " + f.detail);
      });
      navigator.clipboard.writeText(lines.join("\n")).then(
        function () { NC.toast("Report copied to your clipboard."); },
        function () { NC.toast("Your browser blocked clipboard access."); }
      );
    });
  }

  /* ---------------------------------------------------- the check catalogue */

  var checkGrid = document.getElementById("checkGrid");
  if (checkGrid) {
    checkGrid.innerHTML = CHECKS.map(function (c, i) {
      return '<div class="check">' +
        '<span class="check__state mono">' + String(i + 1).padStart(2, "0") + '</span>' +
        '<div><b>' + c.name + '</b><p>' + c.why + '</p></div>' +
      '</div>';
    }).join("");
  }
})();
