/* ==========================================================================
   No Cap — homepage: field-guide cards, live dashboard, fact rotation
   ========================================================================== */

(function () {
  "use strict";

  var NC = window.NC || {};

  /* ------------------------------------------------------- 1. Field guide */

  var THREATS = [
    {
      name: "Phishing",
      glyph: '<path d="M3 6.5h18v11H3z"/><path d="M3 7l9 6.5L21 7"/>',
      blurb: "A message that impersonates someone you trust so you hand over a password, a code or a payment.",
      how: [
        "Arrives as email, SMS, WhatsApp or a DM, often about a parcel, refund or blocked account.",
        "The link points at a lookalike domain — one letter off, or the real brand buried in a subdomain.",
        "The page copies the real login screen so your credentials are typed straight into the attacker's form.",
        "A one-time code request follows within seconds, while you are still expecting one."
      ],
      stop: "Never open the link in the message. Type the address yourself, or use the app you already have installed."
    },
    {
      name: "Malware",
      glyph: '<circle cx="12" cy="12" r="4.5"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
      blurb: "Software that installs itself on your device to watch, steal or take control of what you do.",
      how: [
        "Bundled with a cracked app, a fake installer or a \"required codec\" download.",
        "Delivered by attachment: invoice.pdf.exe, a macro-enabled document, a zipped \"receipt\".",
        "Sits quietly and logs keystrokes, copies session cookies or hijacks your clipboard for wallet addresses.",
        "Often the second stage of a phishing click rather than the first thing you see."
      ],
      stop: "Install only from official stores and vendor sites. Keep automatic updates on — most infections use a hole that was patched months ago."
    },
    {
      name: "Ransomware",
      glyph: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8.5 10.5V7a3.5 3.5 0 017 0v3.5"/><path d="M12 14.5v2.5"/>',
      blurb: "Malware that encrypts every file it can reach, then sells you the key to your own life back.",
      how: [
        "Enters through a phishing click, an exposed remote-desktop login or a reused password.",
        "Spreads sideways across shared drives and connected backups before revealing itself.",
        "Encrypts documents, photos and databases, leaving a payment note behind.",
        "Increasingly steals a copy first and threatens to publish it whether or not you pay."
      ],
      stop: "Keep one backup offline or in versioned cloud storage the ransomware cannot reach. Paying is never a guarantee."
    },
    {
      name: "Password attacks",
      glyph: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3.5M15.5 12v2.5"/>',
      blurb: "Guessing, stuffing or brute-forcing your way into an account — usually with a password you already gave away elsewhere.",
      how: [
        "Credential stuffing: an email and password leaked from one breached site, replayed on fifty others.",
        "Dictionary attacks that try the patterns people actually use — a name, a year, an exclamation mark.",
        "SIM-swap or code-relay to defeat SMS two-factor once the password is known.",
        "Password-reset abuse using answers to security questions found on your public profiles."
      ],
      stop: "One unique password per account, stored in a password manager, plus an authenticator app rather than SMS codes."
    },
    {
      name: "Identity theft",
      glyph: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0115 0"/>',
      blurb: "Someone assembles enough of you — name, date of birth, ID number, address — to become you on paper.",
      how: [
        "Fragments are collected from breaches, social posts, delivery labels and over-sharing forms.",
        "Loans, SIM cards, accounts and refunds are opened in your name at institutions you have never used.",
        "Deepfaked selfies and generated documents now pass some remote identity checks.",
        "Victims usually find out through a rejected loan or a debt letter, months later."
      ],
      stop: "Freeze your credit file where you can, shred anything with your ID number, and check your credit report on a schedule."
    }
  ];

  function renderThreats() {
    var grid = document.getElementById("threatGrid");
    if (!grid) return;

    THREATS.forEach(function (threat, i) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "threat reveal";
      card.setAttribute("data-delay", (i * 0.06).toFixed(2));
      card.setAttribute("aria-pressed", "false");
      card.setAttribute("aria-label", threat.name + " — show details");

      card.innerHTML =
        '<div class="threat__face threat__face--front">' +
          '<span class="threat__glyph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + threat.glyph + '</svg></span>' +
          '<h3>' + threat.name + '</h3>' +
          '<p>' + threat.blurb + '</p>' +
          '<span class="threat__hint">Tap to see how it works</span>' +
        '</div>' +
        '<div class="threat__face threat__face--back">' +
          '<h3>' + threat.name + '</h3>' +
          '<ul class="threat__list">' +
            threat.how.map(function (h) { return "<li>" + h + "</li>"; }).join("") +
          '</ul>' +
          '<p style="margin-top:auto"><strong style="color:var(--safe)">Stops it:</strong> ' + threat.stop + '</p>' +
        '</div>';

      card.addEventListener("click", function () {
        var flipped = card.classList.toggle("is-flipped");
        card.setAttribute("aria-pressed", flipped ? "true" : "false");
        card.setAttribute("aria-label", threat.name + (flipped ? " — hide details" : " — show details"));
      });

      grid.appendChild(card);
    });

    if (NC.initReveals) NC.initReveals();
  }

  /* --------------------------------------------------------- 2. Dashboard */

  var TOOL_LABELS = {
    link: "Link Scanner",
    image: "Image Lab",
    video: "Video Lab",
    news: "News Desk",
    review: "Review Audit",
    message: "Message Guard"
  };

  function relativeTime(iso) {
    var then = new Date(iso).getTime();
    if (isNaN(then)) return "";
    var secs = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (secs < 60) return secs + "s ago";
    if (secs < 3600) return Math.round(secs / 60) + "m ago";
    if (secs < 86400) return Math.round(secs / 3600) + "h ago";
    return Math.round(secs / 86400) + "d ago";
  }

  function setStat(key, value, opts) {
    var el = document.querySelector('[data-live="' + key + '"]');
    if (!el) return;
    var stat = el.closest(".stat");
    if (stat) stat.classList.add("is-live");
    if (NC.countTo) NC.countTo(el, value, opts || {});
    else el.textContent = value;
  }

  function renderBars(byTool, total) {
    var host = document.getElementById("toolBars");
    if (!host) return;
    var keys = Object.keys(TOOL_LABELS).filter(function (k) { return (byTool[k] || 0) > 0; });
    if (!keys.length) return; // keep the empty state

    keys.sort(function (a, b) { return (byTool[b] || 0) - (byTool[a] || 0); });
    host.innerHTML = keys.map(function (k) {
      var n = byTool[k] || 0;
      var pct = total ? Math.round((n / total) * 100) : 0;
      return '<div class="bar">' +
        '<div class="bar__top"><span>' + TOOL_LABELS[k] + '</span><b>' + n + " · " + pct + '%</b></div>' +
        '<div class="bar__track"><div class="bar__fill" data-w="' + pct + '"></div></div>' +
      '</div>';
    }).join("");

    requestAnimationFrame(function () {
      host.querySelectorAll(".bar__fill").forEach(function (fill) {
        fill.style.width = Math.max(2, parseInt(fill.getAttribute("data-w"), 10)) + "%";
      });
    });
  }

  function renderFeed(recent) {
    var host = document.getElementById("scanFeed");
    if (!host || !recent || !recent.length) return;

    host.innerHTML = recent.slice(0, 12).map(function (row, i) {
      var dot = row.verdict === "danger" ? " feed__dot--danger"
              : row.verdict === "caution" ? " feed__dot--caution" : "";
      var label = TOOL_LABELS[row.tool] || row.tool;
      var verdict = NC.bandLabel ? NC.bandLabel(row.score) : row.verdict;
      return '<div class="feed__row" style="animation-delay:' + (i * 0.045).toFixed(2) + 's">' +
        '<span class="feed__dot' + dot + '"></span>' +
        '<span>' + NC.esc(label) + ' — <span class="muted">' + NC.esc(verdict) +
          ', score ' + (row.score | 0) + '</span></span>' +
        '<span class="feed__time">' + relativeTime(row.createdAt) + '</span>' +
      '</div>';
    }).join("");
  }

  function loadDashboard() {
    fetch("/api/scans", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || typeof data.total !== "number") return;
        var byVerdict = data.byVerdict || {};
        var flagged = (byVerdict.caution || 0) + (byVerdict.danger || 0);
        var rate = data.total ? Math.round((flagged / data.total) * 100) : 0;

        setStat("total", data.total);
        setStat("danger", byVerdict.danger || 0);
        setStat("flagRate", rate, { suffix: "%" });
        renderBars(data.byTool || {}, data.total);
        renderFeed(data.recent || []);
      })
      .catch(function () {
        // Dashboard is a nicety, not a dependency — the empty states stay put.
        ["total", "danger", "flagRate"].forEach(function (k) {
          var el = document.querySelector('[data-live="' + k + '"]');
          if (el) el.textContent = "—";
        });
      });
  }

  /* -------------------------------------------------------------- 3. Facts */

  var FACTS = [
    "Phishing is still the most common way an attacker gets their first foothold — not because it is clever, but because it only has to work once.",
    "A padlock in the address bar means the connection is encrypted. It says nothing about who is on the other end — scam sites get certificates too.",
    "Link shorteners hide the destination by design. That is useful for marketing and equally useful for fraud.",
    "Most \"account suspended\" messages arrive outside business hours, when you cannot ring the company to check.",
    "Reused passwords turn one company's breach into a break-in at every other account you own.",
    "Image generators have improved at faces far faster than at hands, text on signs, and reflections. Look there first.",
    "A five-star average built in two days from accounts with no purchase history is a marketing spend, not a product review.",
    "Real support agents never need your one-time code, your screen shared, or a remote-access app installed."
  ];

  function initFacts() {
    var text = document.getElementById("factText");
    var btn = document.getElementById("nextFact");
    var counter = document.getElementById("factCounter");
    if (!text || !btn) return;

    var i = 0;
    function show(n) {
      i = (n + FACTS.length) % FACTS.length;
      text.style.opacity = "0";
      setTimeout(function () {
        text.textContent = FACTS[i];
        text.style.opacity = "1";
        if (counter) counter.textContent = (i + 1) + " / " + FACTS.length;
      }, 180);
    }
    text.style.transition = "opacity .25s var(--ease)";
    btn.addEventListener("click", function () { show(i + 1); });
    show(0);
  }

  /* ----------------------------------------------------------------- boot */

  function start() {
    renderThreats();
    initFacts();
    loadDashboard();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
