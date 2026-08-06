/* ==========================================================================
   No Cap — Fake Review Detector
   Pattern checks run in the browser on whatever you paste; the model reads the
   reviews for tone and substance. Both feed one authenticity score.
   ========================================================================== */

(function () {
  "use strict";

  var NC = window.NC || {};

  var tabText = document.getElementById("tabText");
  if (!tabText) return;

  var tabLink = document.getElementById("tabLink");
  var paneText = document.getElementById("paneText");
  var paneLink = document.getElementById("paneLink");
  var textInput = document.getElementById("textInput");
  var textBtn = document.getElementById("textBtn");
  var textError = document.getElementById("textError");
  var urlInput = document.getElementById("urlInput");
  var urlBtn = document.getElementById("urlBtn");
  var urlError = document.getElementById("urlError");
  var skeleton = document.getElementById("skeleton");
  var result = document.getElementById("result");
  var localSignals = document.getElementById("localSignals");
  var modelWrap = document.getElementById("modelWrap");
  var modelSignals = document.getElementById("modelSignals");
  var examples = document.getElementById("examples");
  var genuineExample = document.getElementById("genuineExample");
  var suspectExample = document.getElementById("suspectExample");
  var adviceEl = document.getElementById("advice");

  function selectTab(which) {
    var text = which === "text";
    tabText.setAttribute("aria-selected", text ? "true" : "false");
    tabLink.setAttribute("aria-selected", text ? "false" : "true");
    paneText.hidden = !text;
    paneLink.hidden = text;
  }
  tabText.addEventListener("click", function () { selectTab("text"); });
  tabLink.addEventListener("click", function () { selectTab("link"); });

  /* ---------------------------------------------------------- field guide */

  var FINGERPRINTS = [
    { name: "The five-star flood", why: "Forty reviews in three days, thirty-eight of them perfect, on a product that has existed for a week. Organic feedback trickles in and disagrees with itself." },
    { name: "Interchangeable praise", why: "“Great product, fast delivery, highly recommend.” Swap the product name and the review still works. Real buyers describe their own situation." },
    { name: "Marketing in a customer's mouth", why: "Model numbers, feature bullets and the slogan from the box. Nobody writes “this 5000mAh fast-charging powerhouse” about something they bought." },
    { name: "Usernames from a generator", why: "A first name plus four digits, or eight random letters. Not proof by itself — plenty of real accounts look like that — but a whole page of them is." },
    { name: "No profile picture", why: "Default avatars across an entire review page. Bought accounts are made in bulk and nobody bothers." },
    { name: "The one-brand reviewer", why: "Click a reviewer's history. If everything they have ever reviewed comes from the same seller, they are not a customer." },
    { name: "A thin verified-purchase rate", why: "The badge means the platform saw the money move. Under half the reviews carrying it, on a page full of praise, is the loudest signal available." },
    { name: "Praise with no use in it", why: "Five stars for a product nobody describes actually using. No context, no downside, no comparison — just enthusiasm." }
  ];

  var checkGrid = document.getElementById("checkGrid");
  if (checkGrid) {
    checkGrid.innerHTML = FINGERPRINTS.map(function (f, i) {
      return '<div class="check"><span class="check__state mono">' + String(i + 1).padStart(2, "0") + "</span>" +
        "<div><b>" + f.name + "</b><p>" + f.why + "</p></div></div>";
    }).join("");
  }

  /* ------------------------------------------------- browser-side checks */

  var MARKETING = [
    "highly recommend", "value for money", "worth every penny", "game changer",
    "must buy", "5 stars", "five stars", "best purchase", "exceeded expectations",
    "amazing product", "great product", "excellent product", "fast delivery",
    "quick delivery", "as described", "top notch", "superb quality", "loved it",
    "will buy again", "10/10", "no complaints"
  ];

  function splitReviews(raw) {
    var text = String(raw || "").trim();
    var chunks = text.split(/\n\s*\n/).map(function (c) { return c.trim(); }).filter(Boolean);
    if (chunks.length < 3) {
      chunks = text.split(/\n/).map(function (c) { return c.trim(); }).filter(function (c) { return c.length > 12; });
    }
    return chunks;
  }

  function analyseReviews(raw) {
    var text = String(raw || "");
    var lower = text.toLowerCase();
    var reviews = splitReviews(text);
    var count = reviews.length;
    var signals = [];
    var penalty = 0;

    function push(name, state, note, weight) {
      signals.push({ name: name, state: state, note: note });
      penalty += weight || 0;
    }

    // 1 — star distribution
    var fives = (lower.match(/(★{5}|5\s*(out of\s*5|\/\s*5|stars?|star rating))/g) || []).length;
    var lows = (lower.match(/(★{1,2}(?!★)|[12]\s*(out of\s*5|\/\s*5|stars?))/g) || []).length;
    if (fives >= 5 && lows === 0) {
      push("Star distribution", "flag", fives + " five-star ratings and not a single low one. Genuine review pages are lumpy: a long tail of threes and ones is what honest feedback looks like.", 22);
    } else if (fives && lows) {
      push("Star distribution", "clear", "A spread of ratings is present (" + fives + " top marks alongside " + lows + " low ones), which is what organic feedback looks like.", 0);
    } else {
      push("Star distribution", "maybe", "Star ratings were not clearly included in the paste. Copy the rating lines too and this check gets much sharper.", 0);
    }

    // 2 — repeated phrasing across reviews
    var phrases = {};
    reviews.forEach(function (r) {
      var words = r.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
      for (var i = 0; i + 2 < words.length; i++) {
        var tri = words[i] + " " + words[i + 1] + " " + words[i + 2];
        phrases[tri] = (phrases[tri] || 0) + 1;
      }
    });
    var repeated = Object.keys(phrases).filter(function (p) { return phrases[p] >= 3; });
    if (repeated.length >= 3 && count >= 4) {
      push("Repeated phrasing", "flag", "The same three-word sequences turn up across separate reviews: “" + repeated.slice(0, 3).join("”, “") + "”. Independent customers do not converge on identical wording.", 20);
    } else if (repeated.length) {
      push("Repeated phrasing", "maybe", "A little overlap in phrasing (“" + repeated[0] + "”). Common phrases are common; a pattern of them is not.", 6);
    } else {
      push("Repeated phrasing", "clear", "Each review is worded independently.", 0);
    }

    // 3 — marketing vocabulary
    var marketing = MARKETING.filter(function (m) { return lower.indexOf(m) !== -1; });
    if (marketing.length >= 5) {
      push("Marketing vocabulary", "flag", "Stock promotional phrases throughout: “" + marketing.slice(0, 4).join("”, “") + "”. This is copy, not experience.", 16);
    } else if (marketing.length >= 2) {
      push("Marketing vocabulary", "maybe", "Some stock phrasing (“" + marketing.slice(0, 2).join("”, “") + "”). Happy customers do say these things — just rarely all of them.", 5);
    } else {
      push("Marketing vocabulary", "clear", "The language reads like customers rather than a brief.", 0);
    }

    // 4 — usernames
    var generic = (text.match(/\b[A-Z][a-z]{2,10}\d{2,6}\b/g) || []);
    var randomish = (text.match(/\b[a-z]{7,12}\b(?=\s*[·|,\n])/g) || []).length;
    if (generic.length >= 3) {
      push("Reviewer names", "flag", generic.length + " usernames follow the auto-generated pattern of a name plus digits (" + generic.slice(0, 3).join(", ") + "). Alongside default avatars, that is a bulk-account signature.", 14);
    } else if (generic.length || randomish >= 4) {
      push("Reviewer names", "maybe", "A few names look machine-made. Open two or three profiles: a real one has a history across different sellers.", 5);
    } else {
      push("Reviewer names", "clear", "No obvious pattern of generated usernames in what you pasted. Still glance at the avatars — a page of default silhouettes tells its own story.", 0);
    }

    // 5 — verified purchases
    var verified = (lower.match(/verified purchase|verified buyer/g) || []).length;
    if (count >= 4) {
      var rate = Math.round((verified / count) * 100);
      if (verified === 0) {
        push("Verified purchases", "maybe", "No verified-purchase badges appear in the paste. Either they were not copied, or none of these reviewers actually bought the item — check the page itself.", 8);
      } else if (rate < 50) {
        push("Verified purchases", "flag", "Only about " + rate + "% carry a verified-purchase badge. The badge is the platform confirming money changed hands; most reviews should have one.", 18);
      } else {
        push("Verified purchases", "clear", "Roughly " + rate + "% are verified purchases, which is a healthy rate.", 0);
      }
    } else {
      push("Verified purchases", "maybe", "Too few reviews to judge the verified rate. Paste ten or more.", 0);
    }

    // 6 — length uniformity
    if (count >= 4) {
      var lengths = reviews.map(function (r) { return r.length; });
      var mean = lengths.reduce(function (a, b) { return a + b; }, 0) / lengths.length;
      var spread = Math.sqrt(lengths.reduce(function (a, b) { return a + Math.pow(b - mean, 2); }, 0) / lengths.length);
      var shorties = lengths.filter(function (l) { return l < 60; }).length;
      if (mean < 90 && shorties / count > 0.6) {
        push("Depth of detail", "flag", "Most reviews are one line long with no specifics. Somebody who spent their own money usually says what they used it for.", 16);
      } else if (spread / Math.max(1, mean) < 0.25) {
        push("Depth of detail", "maybe", "The reviews are suspiciously uniform in length, which happens when they are written to a brief.", 8);
      } else {
        push("Depth of detail", "clear", "Lengths vary and several reviews describe specific use, which is what real feedback looks like.", 0);
      }
    } else {
      push("Depth of detail", "maybe", "Not enough reviews pasted to judge depth.", 0);
    }

    // 7 — date clustering
    var dates = (text.match(/\b(\d{1,2}\s+\w{3,9}\s+\d{4}|\w{3,9}\s+\d{1,2},\s*\d{4}|\d{4}-\d{2}-\d{2})\b/g) || [])
      .map(function (d) { return new Date(d.replace(/(\d)(st|nd|rd|th)/gi, "$1")); })
      .filter(function (d) { return !isNaN(d.getTime()); });
    if (dates.length >= 4) {
      var times = dates.map(function (d) { return d.getTime(); }).sort();
      var spanDays = (times[times.length - 1] - times[0]) / 86400000;
      if (spanDays <= 7) {
        push("Timing", "flag", dates.length + " reviews within " + Math.max(1, Math.round(spanDays)) + " day(s) of each other. A burst like this is what a paid campaign looks like on a calendar.", 20);
      } else {
        push("Timing", "clear", "The reviews are spread across about " + Math.round(spanDays) + " days.", 0);
      }
    } else {
      push("Timing", "maybe", "Dates were not included, so timing could not be checked. Sort the page by most recent and look for a cluster.", 0);
    }

    // 8 — negatives
    var negatives = /\b(but|however|although|disappointed|broke|refund|returned|stopped working|flaw|downside|wish it)\b/i.test(text);
    if (!negatives && count >= 4) {
      push("Any criticism at all", "flag", "Not one review mentions a downside, a caveat or a comparison. Every real product has a “but”.", 14);
    } else if (negatives) {
      push("Any criticism at all", "clear", "At least some reviews qualify their praise, which is a strong sign of real customers.", 0);
    } else {
      push("Any criticism at all", "maybe", "Too little text to tell.", 0);
    }

    return {
      signals: signals,
      count: count,
      authenticity: Math.max(0, Math.min(100, 100 - penalty))
    };
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

  function busy(on) {
    if (skeleton) skeleton.classList.toggle("is-shown", on);
    if (textBtn) textBtn.disabled = on;
    if (urlBtn) urlBtn.disabled = on;
  }

  function present(data, localText) {
    result.classList.add("is-shown");

    var local = localText ? analyseReviews(localText) : null;
    var authenticity = data && data.available ? data.authenticityScore : (local ? local.authenticity : 50);
    if (data && data.available && local) {
      authenticity = Math.round(data.authenticityScore * 0.6 + local.authenticity * 0.4);
    }

    // Authenticity runs the other way to risk: high is good.
    var risk = 100 - authenticity;
    var bandName = NC.band(risk);

    NC.paintVerdict(
      authenticity,
      bandName,
      authenticity >= 67 ? "Reads as organic" : authenticity >= 40 ? "Mixed signals" : "Looks manufactured",
      authenticity >= 67
        ? "The pattern here looks like real customers: varied wording, varied ratings, and people describing their own use."
        : authenticity >= 40
          ? "Some of this reads real and some does not. Sort the page by most recent and by lowest rating before you decide."
          : "The pattern matches paid or incentivised feedback. Judge the product on the critical reviews and on sources outside the seller's own page."
    );

    if (local) {
      renderChecks(localSignals, local.signals);
      if (localSignals) localSignals.parentElement.hidden = false;
    } else if (localSignals) {
      localSignals.parentElement.hidden = true;
    }

    if (data && data.available) {
      if (data.signals && data.signals.length) {
        modelWrap.hidden = false;
        NC.renderFindings(modelSignals, data.signals.map(function (s) {
          return { state: s.state, name: s.name, detail: s.note };
        }));
      } else {
        modelWrap.hidden = true;
      }

      if (examples && (data.genuineExample || data.suspectExample)) {
        examples.hidden = false;
        genuineExample.textContent = data.genuineExample || "No clearly genuine review stood out.";
        suspectExample.textContent = data.suspectExample || "No clearly manufactured review stood out.";
      } else if (examples) {
        examples.hidden = true;
      }

      if (adviceEl) {
        adviceEl.hidden = false;
        adviceEl.className = "notice mt-3" + (authenticity < 40 ? " notice--warn" : "");
        adviceEl.innerHTML = NC.icon(authenticity < 40 ? "warn" : "info", 17) +
          "<div><b>" + NC.esc(data.verdict || "Summary") + "</b>" +
          (data.advice ? "<p style=\"margin-top:.25rem\">" + NC.esc(data.advice) + "</p>" : "") +
          (data.reviewsSeen ? "<p class=\"mono\" style=\"margin-top:.4rem;font-size:.74rem;color:var(--faint)\">Reviews read: " + data.reviewsSeen + "</p>" : "") +
          "</div>";
      }
    } else {
      if (modelWrap) modelWrap.hidden = true;
      if (examples) examples.hidden = true;
      if (adviceEl) {
        adviceEl.hidden = false;
        adviceEl.className = "notice notice--warn mt-3";
        adviceEl.innerHTML = NC.icon("warn", 17) +
          "<div><b>Server analysis unavailable</b><p style=\"margin-top:.25rem\">" +
          NC.esc((data && data.reason) || "The service did not answer.") + "</p></div>";
      }
    }

    NC.recordScan("review", bandName, risk);
    result.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function send(payload, localText) {
    busy(true);
    result.classList.remove("is-shown");
    fetch("/api/analyze-reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (data) { busy(false); present(data, localText); })
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

  if (textBtn) {
    textBtn.addEventListener("click", function () {
      var text = (textInput.value || "").trim();
      if (text.length < 40) {
        textError.classList.add("is-shown");
        return;
      }
      textError.classList.remove("is-shown");
      send({ text: text }, text);
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
})();
