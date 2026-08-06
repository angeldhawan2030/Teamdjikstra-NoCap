/* ==========================================================================
   No Cap — WhatsApp Semantic Intent Engine
   Reads a pasted message for what the sender is actually trying to make you
   do. Word-level checks run here; the model judges intent.
   ========================================================================== */

(function () {
  "use strict";

  var NC = window.NC || {};

  var input = document.getElementById("msgInput");
  if (!input) return;

  var checkBtn = document.getElementById("checkBtn");
  var resetBtn = document.getElementById("resetBtn");
  var errorEl = document.getElementById("msgError");
  var skeleton = document.getElementById("skeleton");
  var result = document.getElementById("result");
  var intentWrap = document.getElementById("intentWrap");
  var intentKv = document.getElementById("intentKv");
  var localSignals = document.getElementById("localSignals");
  var modelWrap = document.getElementById("modelWrap");
  var modelSignals = document.getElementById("modelSignals");
  var adviceEl = document.getElementById("advice");

  Array.prototype.forEach.call(document.querySelectorAll("[data-sample]"), function (btn) {
    btn.addEventListener("click", function () {
      input.value = btn.getAttribute("data-sample");
      input.focus();
      if (errorEl) errorEl.classList.remove("is-shown");
    });
  });

  /* ------------------------------------------------- browser-side checks */

  var URGENT = [
    "urgent", "immediately", "right now", "within 24 hours", "within 12 hours",
    "last chance", "final notice", "act now", "expires today", "expiring",
    "before midnight", "limited time", "hurry", "don't delay", "do not delay",
    "asap", "as soon as possible", "time sensitive", "today only", "deadline"
  ];

  var THREAT = [
    "suspended", "blocked", "deactivated", "terminated", "legal action",
    "police", "arrest", "court", "fine", "penalty", "seized", "held at customs",
    "will be returned", "account closure", "permanently deleted", "unauthorised access",
    "unauthorized access", "security breach", "compromised"
  ];

  var MONEY = [
    "send money", "transfer", "upi", "paytm", "gpay", "phonepe", "western union",
    "bank details", "account number", "ifsc", "iban", "sort code", "routing number",
    "gift card", "itunes card", "google play card", "steam card", "bitcoin", "usdt",
    "crypto wallet", "clearance fee", "processing fee", "delivery fee", "customs fee",
    "small fee", "refundable deposit", "registration fee", "advance payment"
  ];

  var CREDENTIAL = [
    "otp", "one time password", "one-time password", "verification code", "security code",
    "pin number", "your password", "cvv", "login details", "credentials", "share the code",
    "share code", "read out the code", "aadhaar", "social security", "ssn"
  ];

  var LURE = [
    "you have won", "congratulations you", "lottery", "prize", "lucky winner",
    "selected winner", "cash reward", "free gift", "claim your", "guaranteed income",
    "guaranteed returns", "double your money", "work from home", "part-time online",
    "no experience needed", "daily income", "per day", "investment opportunity",
    "risk free", "risk-free"
  ];

  var OFF_PLATFORM = ["telegram", "whatsapp me", "message me on", "dm me", "signal app", "add me on"];

  var SHORTENERS = /\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|buff\.ly|ow\.ly|cutt\.ly|rb\.gy|shorturl\.at|rebrand\.ly|t\.ly|s\.id|linktr\.ee)\b/i;

  function hits(text, list) {
    var found = [];
    list.forEach(function (term) {
      if (text.indexOf(term) !== -1) found.push(term);
    });
    return found;
  }

  function quoteList(items, max) {
    return "“" + items.slice(0, max || 3).join("”, “") + "”";
  }

  function analyse(raw) {
    var text = String(raw || "");
    var lower = text.toLowerCase();
    var signals = [];
    var score = 0;

    function push(name, state, note, weight) {
      signals.push({ name: name, state: state, note: note });
      score += weight || 0;
    }

    // 1 — manufactured urgency
    var urgent = hits(lower, URGENT);
    if (urgent.length >= 2) {
      push("Manufactured urgency", "flag", "Several deadline phrases stacked together: " + quoteList(urgent) + ". The clock exists to stop you checking. Nothing legitimate collapses because you waited an hour.", 22);
    } else if (urgent.length === 1) {
      push("Manufactured urgency", "maybe", "One time-pressure phrase: " + quoteList(urgent, 1) + ". On its own that can be innocent, but note who benefits from you rushing.", 9);
    } else {
      push("Manufactured urgency", "clear", "No artificial deadline. The message is not trying to hurry you.", 0);
    }

    // 2 — threats and consequences
    var threat = hits(lower, THREAT);
    if (threat.length) {
      push("Threatened consequence", "flag", "The message threatens: " + quoteList(threat) + ". Real institutions write to you about serious matters; they do not open with a punishment in a chat app.", 20);
    } else {
      push("Threatened consequence", "clear", "No threat of suspension, penalty or legal trouble.", 0);
    }

    // 3 — money movement
    var money = hits(lower, MONEY);
    var amounts = text.match(/(?:[$£€₹¥]\s?\d[\d,.]*|\b\d[\d,]{2,}\s?(?:rs|inr|usd|eur|gbp|dollars|rupees|pounds|euros)\b)/gi) || [];
    if (money.length) {
      push("Money is being requested", "flag", "Payment language present: " + quoteList(money) + (amounts.length ? ", with the amount " + amounts[0] + " named" : "") + ". A fee to release something you did not order is the oldest shape this scam takes.", 26);
    } else if (amounts.length) {
      push("Money is being requested", "maybe", "A specific sum is mentioned (" + NC.esc(amounts[0]) + ") without an obvious payment request. Worth reading again for what it is attached to.", 8);
    } else {
      push("Money is being requested", "clear", "No payment, transfer or fee is being asked for.", 0);
    }

    // 4 — credentials and codes
    var cred = hits(lower, CREDENTIAL);
    if (cred.length) {
      push("Credentials or codes", "flag", "The message reaches for " + quoteList(cred) + ". This is the line that never moves: nobody legitimate — no bank, no courier, no colleague — ever needs a one-time code from you.", 30);
    } else {
      push("Credentials or codes", "clear", "No password, PIN or verification code is being requested.", 0);
    }

    // 5 — reward lures
    var lure = hits(lower, LURE);
    if (lure.length >= 2) {
      push("Unearned reward", "flag", "Offer language: " + quoteList(lure) + ". Winnings you did not enter for and income figures with no work attached are the bait, not the deal.", 20);
    } else if (lure.length === 1) {
      push("Unearned reward", "maybe", "One offer phrase: " + quoteList(lure, 1) + ".", 8);
    } else {
      push("Unearned reward", "clear", "No prize, windfall or too-good income claim.", 0);
    }

    // 6 — links
    var links = text.match(/https?:\/\/[^\s]+|\b[\w-]+\.(?:com|net|org|io|co|in|xyz|top|shop|live|link|info|biz|club|online|site)\b[^\s]*/gi) || [];
    if (links.length && SHORTENERS.test(text)) {
      push("Links", "flag", "A shortened link (" + NC.esc(links[0]) + ") hides where it actually goes. Never open one from a message you did not expect — paste it into the Fake Website Detector first.", 22);
    } else if (links.length) {
      push("Links", "maybe", "The message contains a link (" + NC.esc(links[0].slice(0, 60)) + "). Run it through the Fake Website Detector before you tap it.", 10);
    } else {
      push("Links", "clear", "No links to follow.", 0);
    }

    // 7 — who it is addressed to
    if (/\b(dear (customer|user|sir\/madam|member|client)|valued customer|account holder)\b/i.test(text)) {
      push("How you are addressed", "flag", "A generic salutation. An organisation you actually hold an account with knows your name and normally uses it.", 14);
    } else {
      push("How you are addressed", "clear", "No generic mass-mailing salutation.", 0);
    }

    // 8 — the "new number" pretext
    if (/\b(new number|lost my phone|phone broke|this is my new|old phone (is )?(broken|dead|lost))\b/i.test(text)) {
      push("Identity pretext", "flag", "The message explains away an unfamiliar number before you can ask. Paired with a money request, this is the family-impersonation scam almost word for word. Ring the person on the number you already have.", 26);
    } else {
      push("Identity pretext", "clear", "No unexplained change of number or identity.", 0);
    }

    // 9 — pushing you elsewhere / avoiding a call
    var off = hits(lower, OFF_PLATFORM);
    var avoid = /\b(don'?t call|do not call|can'?t talk|cannot talk|in a meeting|no calls|text only)\b/i.test(text);
    if (off.length || avoid) {
      push("Steering the conversation", "flag",
        (off.length ? "You are being moved to another app (" + quoteList(off, 2) + "). " : "") +
        (avoid ? "The sender pre-empts a phone call, which is exactly the check that would expose them. " : "") +
        "Insist on the channel you choose.", 18);
    } else {
      push("Steering the conversation", "clear", "No push to move apps and no attempt to head off a phone call.", 0);
    }

    // 10 — writing quality
    var weird = (text.match(/\s[,.!?]|[a-z][A-Z]|\b(kindly do the needful|revert back|your good self)\b/g) || []).length;
    var shouty = (text.match(/\b[A-Z]{4,}\b/g) || []).length;
    if (weird >= 2 || shouty >= 3) {
      push("Writing quality", "maybe", "Odd spacing, capitalisation or phrasing for an official notice. Weak on its own — plenty of real messages are typed in a hurry — but it stacks with everything above.", 8);
    } else {
      push("Writing quality", "clear", "Nothing unusual in the spelling, spacing or capitalisation.", 0);
    }

    return { signals: signals, localScore: Math.max(0, Math.min(100, score)) };
  }

  /* ------------------------------------------------------------ rendering */

  var STATE_CLASS = { clear: "is-clear", flag: "is-flag", maybe: "is-maybe" };
  var STATE_MARK = { clear: "OK", flag: "!", maybe: "?" };

  function renderChecks(container, signals) {
    if (!container) return;
    var order = { flag: 0, maybe: 1, clear: 2 };
    container.innerHTML = signals
      .slice()
      .sort(function (a, b) { return (order[a.state] || 1) - (order[b.state] || 1); })
      .map(function (s) {
        return '<div class="check ' + (STATE_CLASS[s.state] || "is-maybe") + '">' +
          '<span class="check__state">' + (STATE_MARK[s.state] || "?") + "</span>" +
          "<div><b>" + NC.esc(s.name) + "</b><p>" + s.note + "</p></div></div>";
      }).join("");
  }

  function kvRow(key, value) {
    return '<div class="kv__row"><span class="kv__k">' + NC.esc(key) + '</span><span class="kv__v">' + NC.esc(value) + "</span></div>";
  }

  function busy(on) {
    if (skeleton) skeleton.classList.toggle("is-shown", on);
    if (checkBtn) checkBtn.disabled = on;
  }

  function present(data, text) {
    var local = analyse(text);
    var score = local.localScore;
    if (data && data.available) {
      // The model reads intent, the browser reads vocabulary. Weight towards
      // the model, but never let it talk down a hard credential request.
      score = Math.round(data.riskScore * 0.65 + local.localScore * 0.35);
      score = Math.max(score, local.localScore >= 70 ? 70 : 0);
    }
    var bandName = NC.band(score);

    result.classList.add("is-shown");
    NC.paintVerdict(
      score,
      bandName,
      score >= 65 ? "Treat as a scam" : score >= 33 ? "Be careful" : "No scam markers found",
      score >= 65
        ? "Do not reply, do not tap the link, do not send anything. If it claims to be someone you know, contact them on a number you already had."
        : score >= 33
          ? "Some of the shapes of a scam are here without the full pattern. Verify through a channel the sender did not give you before you act on it."
          : "Nothing in this message matches the known pressure tactics. That is not a guarantee — if it asks you to move money or share a code later, come back."
    );

    renderChecks(localSignals, local.signals);

    if (data && data.available) {
      if (intentWrap && (data.intent || data.category)) {
        intentWrap.hidden = false;
        intentKv.innerHTML =
          (data.intent ? kvRow("Goal", data.intent) : "") +
          (data.category ? kvRow("Scam type", data.category) : "") +
          (data.summary ? kvRow("In short", data.summary) : "");
      } else if (intentWrap) {
        intentWrap.hidden = true;
      }

      if (data.signals && data.signals.length) {
        modelWrap.hidden = false;
        NC.renderFindings(modelSignals, data.signals.map(function (s) {
          return {
            state: s.state || "flag",
            name: s.name,
            detail: s.quote ? s.note + " — “" + s.quote + "”" : s.note
          };
        }));
      } else {
        modelWrap.hidden = true;
      }

      if (adviceEl) {
        adviceEl.hidden = false;
        adviceEl.className = "notice mt-3" + (score >= 65 ? " notice--warn" : "");
        adviceEl.innerHTML = NC.icon(score >= 65 ? "warn" : "info", 17) +
          "<div><b>What to do</b>" +
          (data.advice ? "<p style=\"margin-top:.25rem\">" + NC.esc(data.advice) + "</p>" : "") +
          "<p style=\"margin-top:.35rem\">Report it inside WhatsApp — open the chat, tap the sender's name, then <b>Report</b> and <b>Block</b>. That removes them from your phone and tells the platform.</p></div>";
      }
    } else {
      if (intentWrap) intentWrap.hidden = true;
      if (modelWrap) modelWrap.hidden = true;
      if (adviceEl) {
        adviceEl.hidden = false;
        adviceEl.className = "notice notice--warn mt-3";
        adviceEl.innerHTML = NC.icon("warn", 17) +
          "<div><b>Intent analysis unavailable</b><p style=\"margin-top:.25rem\">" +
          NC.esc((data && data.reason) || "The service did not answer.") +
          " The language checks above ran entirely in your browser and still hold.</p></div>";
      }
    }

    NC.recordScan("message", bandName, score);
    result.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  if (checkBtn) {
    checkBtn.addEventListener("click", function () {
      var text = (input.value || "").trim();
      if (text.length < 12) {
        if (errorEl) errorEl.classList.add("is-shown");
        return;
      }
      if (errorEl) errorEl.classList.remove("is-shown");

      busy(true);
      result.classList.remove("is-shown");

      fetch("/api/analyze-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 6000) })
      })
        .then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (data) { busy(false); present(data, text); })
        .catch(function () {
          busy(false);
          present(null, text);
          NC.toast("Server analysis failed — the browser-side checks still ran.");
        });
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      input.value = "";
      result.classList.remove("is-shown");
      if (errorEl) errorEl.classList.remove("is-shown");
      input.focus();
    });
  }
})();
