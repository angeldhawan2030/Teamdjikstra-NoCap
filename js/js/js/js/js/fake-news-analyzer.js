/* ==========================================================================
   No Cap — Fake News Analyzer
   Provenance comes from the server (byline, outlet, funding, sponsorship).
   The writing checks below run in the browser, on the text itself.
   ========================================================================== */

(function () {
  "use strict";

  var NC = window.NC || {};

  var tabLink = document.getElementById("tabLink");
  if (!tabLink) return;

  var tabText = document.getElementById("tabText");
  var paneLink = document.getElementById("paneLink");
  var paneText = document.getElementById("paneText");
  var urlInput = document.getElementById("urlInput");
  var urlBtn = document.getElementById("urlBtn");
  var urlError = document.getElementById("urlError");
  var textInput = document.getElementById("textInput");
  var textBtn = document.getElementById("textBtn");
  var textError = document.getElementById("textError");
  var skeleton = document.getElementById("skeleton");
  var result = document.getElementById("result");
  var provenance = document.getElementById("provenance");
  var textSignals = document.getElementById("textSignals");
  var modelSignalsWrap = document.getElementById("modelSignalsWrap");
  var modelSignals = document.getElementById("modelSignals");
  var unsignedFlag = document.getElementById("unsignedFlag");
  var adviceEl = document.getElementById("advice");

  function selectTab(which) {
    var link = which === "link";
    tabLink.setAttribute("aria-selected", link ? "true" : "false");
    tabText.setAttribute("aria-selected", link ? "false" : "true");
    paneLink.hidden = !link;
    paneText.hidden = link;
  }
  tabLink.addEventListener("click", function () { selectTab("link"); });
  tabText.addEventListener("click", function () { selectTab("text"); });

  /* ------------------------------------------------- browser-side checks */

  var SENSATIONAL = [
    "you won't believe", "you wont believe", "shocking", "shock", "bombshell",
    "destroyed", "slams", "blasts", "erupts", "meltdown", "goes viral",
    "what happened next", "the truth about", "they don't want you to know",
    "they dont want you to know", "exposed", "banned", "censored", "wake up",
    "must see", "must read", "gone wrong", "insane", "unbelievable", "miracle",
    "cure", "secret", "leaked", "breaking:", "urgent:", "alert:"
  ];

  var LOADED = [
    "outrage", "outrageous", "disgusting", "disgrace", "traitor", "evil",
    "corrupt", "scam", "hoax", "lies", "liar", "brainwashed", "sheeple",
    "hero", "savage", "epic", "devastating", "catastrophic", "chaos",
    "plunge", "soar", "slammed", "furious", "panic", "terrifying"
  ];

  var HEDGES = [
    "experts say", "sources say", "people are saying", "reportedly",
    "some claim", "it is believed", "many believe", "studies show",
    "research suggests", "insiders say", "allegedly"
  ];

  var MISSPELLINGS = [
    "recieve", "seperate", "definately", "occured", "untill", "wich",
    "goverment", "beleive", "publically", "accomodate", "arguement",
    "existance", "independant", "occassion", "priviledge", "refered",
    "succesful", "tommorow", "wierd"
  ];

  function countMatches(haystack, needles) {
    var found = [];
    needles.forEach(function (n) {
      if (haystack.indexOf(n) !== -1) found.push(n);
    });
    return found;
  }

  function findDate(text) {
    var patterns = [
      /\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/i,
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})\b/i,
      /\b(\d{4})-(\d{2})-(\d{2})\b/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = text.match(patterns[i]);
      if (m) {
        var parsed = new Date(m[0].replace(/(\d)(st|nd|rd|th)/gi, "$1"));
        if (!isNaN(parsed.getTime())) return { raw: m[0], date: parsed };
      }
    }
    return null;
  }

  function analyseText(raw) {
    var text = String(raw || "");
    var lower = text.toLowerCase();
    var words = text.split(/\s+/).filter(Boolean);
    var headline = (text.split(/\n/)[0] || "").trim();
    var signals = [];

    function push(name, state, note) {
      signals.push({ name: name, state: state, note: note });
    }

    // 1 — sensational headline construction
    var sens = countMatches(lower.slice(0, 400), SENSATIONAL);
    if (sens.length >= 2) {
      push("Sensational headline", "flag", "The opening uses clickbait construction: “" + sens.slice(0, 3).join("”, “") + "”. Headlines built this way are optimised for a click, not for accuracy.");
    } else if (sens.length === 1) {
      push("Sensational headline", "maybe", "One clickbait phrase near the top: “" + sens[0] + "”. Worth noticing, not damning on its own.");
    } else {
      push("Sensational headline", "clear", "The headline is written descriptively rather than as bait.");
    }

    // 2 — ALL CAPS
    var caps = words.filter(function (w) {
      var stripped = w.replace(/[^A-Za-z]/g, "");
      return stripped.length >= 4 && stripped === stripped.toUpperCase();
    });
    var capsRatio = words.length ? caps.length / words.length : 0;
    if (capsRatio > 0.04 && caps.length >= 3) {
      push("Shouting in capitals", "flag", caps.length + " words are in full capitals (" + Math.round(capsRatio * 100) + "% of the text). Edited publications use italics or bold; capitals are an emotional lever.");
    } else if (caps.length) {
      push("Shouting in capitals", "clear", "Capitalised words are limited to what look like acronyms and names.");
    } else {
      push("Shouting in capitals", "clear", "No shouting.");
    }

    // 3 — emotional language
    var loaded = countMatches(lower, LOADED);
    var bangs = (text.match(/!/g) || []).length;
    if (loaded.length >= 4 || bangs >= 3) {
      push("Emotional language", "flag", (loaded.length ? "Loaded vocabulary throughout: “" + loaded.slice(0, 5).join("”, “") + "”. " : "") +
        (bangs >= 3 ? bangs + " exclamation marks. " : "") + "The piece is working on your feelings before it works on the facts.");
    } else if (loaded.length >= 2) {
      push("Emotional language", "maybe", "Some charged wording: “" + loaded.slice(0, 3).join("”, “") + "”. Normal in opinion writing, out of place in reporting.");
    } else {
      push("Emotional language", "clear", "The tone stays measured.");
    }

    // 4 — spelling and grammar
    var typos = countMatches(lower, MISSPELLINGS);
    var doubleSpace = (text.match(/[a-z]{2}  +[a-z]/gi) || []).length;
    var repeatedPunct = (text.match(/[!?]{2,}|\.{4,}/g) || []).length;
    var lowerSentence = (text.match(/[.!?]\s+[a-z]/g) || []).length;
    var errorCount = typos.length + Math.min(3, doubleSpace) + repeatedPunct + Math.min(3, lowerSentence);
    if (errorCount >= 4) {
      push("Spelling and grammar", "flag", "Multiple errors an edited outlet would have caught" +
        (typos.length ? ", including “" + typos.slice(0, 3).join("”, “") + "”" : "") +
        ". Sloppy copy usually means nobody edited it — and often that nobody checked it either.");
    } else if (errorCount >= 2) {
      push("Spelling and grammar", "maybe", "A few slips. One typo means nothing; a pattern of them means no editor.");
    } else {
      push("Spelling and grammar", "clear", "The copy reads as edited.");
    }

    // 5 — publication date
    var found = findDate(text);
    if (!found) {
      push("Publication date", "flag", "No date appears in the text. Undated stories are how four-year-old events get recirculated as today's news.");
    } else {
      var ageDays = Math.round((Date.now() - found.date.getTime()) / 86400000);
      if (ageDays > 365) {
        push("Publication date", "flag", "Dated " + found.raw + " — about " + Math.round(ageDays / 365) + " year(s) ago. Check whether this is being shared as if it were current.");
      } else if (ageDays > 60) {
        push("Publication date", "maybe", "Dated " + found.raw + ", roughly " + ageDays + " days ago. Fine as history, misleading as breaking news.");
      } else {
        push("Publication date", "clear", "Dated " + found.raw + " — recent.");
      }
    }

    // 6 — mixed fonts and text styling
    var styled = /font-size|font-family|<span|<font|style=/.test(lower);
    var fancyUnicode = /[\u{1D400}-\u{1D7FF}]/u.test(text);          // 𝐛𝐨𝐥𝐝 letterforms
    var mixedScript = /[а-яА-Я]/.test(text) && /[a-zA-Z]/.test(text); // Cyrillic mixed into Latin
    if (fancyUnicode || mixedScript) {
      push("Mixed fonts and characters", "flag",
        (fancyUnicode ? "Decorative Unicode letterforms are being used as fake bold — a social-media trick, never a newsroom one. " : "") +
        (mixedScript ? "Cyrillic characters are mixed into Latin words, which is how filters and readers both get fooled." : ""));
    } else if (styled) {
      push("Mixed fonts and characters", "maybe", "Inline styling markup came through with the paste, which can mean the source page mixes fonts and sizes mid-article. Look at the page: real outlets use one type scale throughout.");
    } else {
      push("Mixed fonts and characters", "clear", "Nothing odd in the characters themselves. Still glance at the page — mismatched fonts and jumping text sizes usually mean a template someone assembled in a hurry.");
    }

    // 7 — sourcing
    var hedges = countMatches(lower, HEDGES);
    var named = /\b(said|told|according to)\b/.test(lower);
    if (hedges.length >= 2 && !named) {
      push("Sourcing", "flag", "Attribution is entirely vague: “" + hedges.slice(0, 3).join("”, “") + "”, with nobody named. Claims nobody will put their name to are claims nobody will answer for.");
    } else if (hedges.length >= 1) {
      push("Sourcing", "maybe", "Some unnamed attribution (“" + hedges[0] + "”). Legitimate at times, but it should be the exception.");
    } else if (named) {
      push("Sourcing", "clear", "Statements are attributed to named people or documents.");
    } else {
      push("Sourcing", "maybe", "No clear attribution either way in what was supplied.");
    }

    var flags = signals.filter(function (s) { return s.state === "flag"; }).length;
    var maybes = signals.filter(function (s) { return s.state === "maybe"; }).length;
    return { signals: signals, localScore: Math.min(100, flags * 18 + maybes * 6), headline: headline };
  }

  /* ------------------------------------------------------------ rendering */

  var STATE_CLASS = { clear: "is-clear", flag: "is-flag", maybe: "is-maybe", unclear: "is-maybe" };

  function renderChecks(container, signals) {
    if (!container) return;
    container.innerHTML = signals.map(function (s) {
      return '<div class="check ' + (STATE_CLASS[s.state] || "is-maybe") + '">' +
        '<span class="check__state">' + (s.state === "clear" ? "OK" : s.state === "flag" ? "!" : "?") + "</span>" +
        "<div><b>" + NC.esc(s.name) + "</b><p>" + NC.esc(s.note) + "</p></div></div>";
    }).join("");
  }

  function row(key, value, tone) {
    return '<div class="kv__row"><span class="kv__k">' + NC.esc(key) + "</span>" +
      '<span class="kv__v' + (tone ? " " + tone : "") + '">' + NC.esc(value) + "</span></div>";
  }

  function renderProvenance(data) {
    if (!provenance) return;
    var rows = [];
    rows.push(row("Author", data.author || "None found", data.author ? "" : "tone-danger"));
    if (data.authorBackground) rows.push(row("Background", data.authorBackground));
    rows.push(row("Outlet", data.outlet || "Not identified"));
    if (data.outletProfile) rows.push(row("Ownership and funding", data.outletProfile));
    rows.push(row("Sponsorship", data.sponsorship || "None disclosed in the text"));
    rows.push(row("Published", data.published || "No date found", data.published ? "" : "tone-warn"));
    rows.push(row("Type of writing", {
      reporting: "Reporting", opinion: "Opinion or comment",
      marketing: "Marketing or advertorial", unclear: "Unclear"
    }[data.contentType] || "Unclear", data.contentType === "marketing" ? "tone-warn" : ""));
    provenance.innerHTML = rows.join("");
  }

  /* -------------------------------------------------------------- requests */

  function busy(on) {
    if (skeleton) skeleton.classList.toggle("is-shown", on);
    if (urlBtn) urlBtn.disabled = on;
    if (textBtn) textBtn.disabled = on;
  }

  function present(data, localText) {
    result.classList.add("is-shown");

    var local = localText ? analyseText(localText) : null;
    var score = data && data.available ? data.riskScore : (local ? local.localScore : 50);
    if (data && data.available && local) {
      // Server reads provenance, the browser reads the prose. Blend, weighted
      // towards the server because provenance is the stronger signal.
      score = Math.round(data.riskScore * 0.7 + local.localScore * 0.3);
    }
    var bandName = NC.band(score);

    NC.paintVerdict(
      score,
      bandName,
      score >= 65 ? "Treat with suspicion" : score >= 33 ? "Check before sharing" : "Trust signals present",
      score >= 65
        ? "Enough is missing or manipulated here that this should not be forwarded. Find the same story at an outlet that signs its work."
        : score >= 33
          ? "Some trust signals are missing. Look for the same claim reported elsewhere before you pass it on."
          : "Named author, identifiable outlet and measured writing. That makes it accountable, not automatically correct — the claims themselves still need checking."
    );

    if (local) {
      renderChecks(textSignals, local.signals);
      if (textSignals) textSignals.parentElement.hidden = false;
    } else if (textSignals) {
      textSignals.parentElement.hidden = true;
    }

    if (data && data.available) {
      renderProvenance(data);

      if (unsignedFlag) {
        if (data.unsigned) {
          unsignedFlag.hidden = false;
          unsignedFlag.className = "notice notice--warn mt-3";
          unsignedFlag.innerHTML = NC.icon("warn", 17) +
            "<div><b>No named author</b><p style=\"margin-top:.25rem\">Nobody has put their name to this. " +
            "Anonymous publication removes the one thing that makes a correction possible — someone accountable for getting it wrong. " +
            "That alone is reason to find the story somewhere else.</p></div>";
        } else {
          unsignedFlag.hidden = true;
        }
      }

      if (data.signals && data.signals.length) {
        modelSignalsWrap.hidden = false;
        NC.renderFindings(modelSignals, data.signals.map(function (s) {
          return { state: s.state, name: s.name, detail: s.note };
        }));
      } else {
        modelSignalsWrap.hidden = true;
      }

      if (adviceEl) {
        adviceEl.hidden = false;
        adviceEl.className = "notice mt-3" + (score >= 65 ? " notice--warn" : "");
        adviceEl.innerHTML = NC.icon(score >= 65 ? "warn" : "info", 17) +
          "<div><b>" + NC.esc(data.summary || "Summary") + "</b>" +
          (data.advice ? "<p style=\"margin-top:.25rem\">" + NC.esc(data.advice) + "</p>" : "") + "</div>";
      }
    } else {
      if (provenance) provenance.innerHTML = '<div class="empty"><p>' +
        NC.esc((data && data.reason) || "Provenance could not be established — the writing checks above still apply.") +
        "</p></div>";
      if (unsignedFlag) unsignedFlag.hidden = true;
      if (modelSignalsWrap) modelSignalsWrap.hidden = true;
      if (adviceEl) adviceEl.hidden = true;
    }

    NC.recordScan("news", bandName, score);
    result.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function send(payload, localText) {
    busy(true);
    result.classList.remove("is-shown");
    fetch("/api/analyze-news", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (data) {
        busy(false);
        present(data, localText);
      })
      .catch(function () {
        busy(false);
        if (localText) {
          present(null, localText);
          NC.toast("Server analysis failed — showing the browser-side checks only.");
        } else {
          NC.toast("That request failed. Check your connection and try again.");
        }
      });
  }

  if (urlBtn) {
    urlBtn.addEventListener("click", function () {
      var raw = (urlInput.value || "").trim();
      var url;
      try {
        url = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
      } catch (e) {
        urlError.classList.add("is-shown");
        return;
      }
      urlError.classList.remove("is-shown");
      send({ url: url.href }, null);
    });
  }

  if (textBtn) {
    textBtn.addEventListener("click", function () {
      var text = (textInput.value || "").trim();
      if (text.length < 60) {
        textError.classList.add("is-shown");
        return;
      }
      textError.classList.remove("is-shown");
      send({ text: text }, text);
    });
  }
})();
