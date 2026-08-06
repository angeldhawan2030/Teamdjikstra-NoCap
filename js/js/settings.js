/* ==========================================================================
   No Cap — Settings
   Theme, motion, cursor and the 21-language picker. Everything written here
   goes through NC.setPref, so it persists and applies site-wide immediately.
   ========================================================================== */

(function () {
  "use strict";

  var NC = window.NC || {};

  var langGrid = document.getElementById("langGrid");
  var themeSwitch = document.getElementById("themeSwitch");
  var motionToggle = document.getElementById("motionToggle");
  var cursorToggle = document.getElementById("cursorToggle");
  var clearBtn = document.getElementById("clearBtn");

  if (!langGrid && !themeSwitch) return;

  /* ----------------------------------------------------------------- theme */

  function paintTheme() {
    if (!themeSwitch) return;
    var dark = NC.getPref("theme") !== "light";
    themeSwitch.setAttribute("aria-checked", dark ? "true" : "false");
    themeSwitch.setAttribute("aria-label", dark ? "Dark mode, on" : "Light mode, on");
  }

  if (themeSwitch) {
    themeSwitch.addEventListener("click", function () {
      var next = NC.getPref("theme") === "light" ? "dark" : "light";
      NC.setPref("theme", next);
      paintTheme();
      NC.toast(next === "light" ? "Light mode on." : "Dark mode on.");
    });
    // The header toggle changes the same value; keep this switch in step.
    document.addEventListener("nc:theme", paintTheme);
    paintTheme();
  }

  /* ------------------------------------------------------- motion + cursor */

  function bindToggle(el, key, onCopy, offCopy) {
    if (!el) return;
    function paint() {
      el.setAttribute("aria-pressed", NC.getPref(key) ? "true" : "false");
    }
    el.addEventListener("click", function () {
      var next = !NC.getPref(key);
      NC.setPref(key, next);
      paint();
      NC.toast(next ? onCopy : offCopy);
    });
    paint();
  }

  bindToggle(motionToggle, "motion",
    "Animations on.",
    "Animations off. Particles, reveals and the scanner sweep are now static.");

  bindToggle(cursorToggle, "cursor",
    "Custom cursor on.",
    "Custom cursor off. Your system pointer is back.");

  // A pointer that cannot hover has nothing to gain from the custom cursor.
  if (cursorToggle && !window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    cursorToggle.disabled = true;
    cursorToggle.setAttribute("aria-disabled", "true");
    cursorToggle.setAttribute("title", "Not available on touch input");
  }

  /* -------------------------------------------------------------- language */

  var LANGS = NC.langs || [];

  function paintLangs() {
    var active = NC.getPref("lang");
    Array.prototype.forEach.call(langGrid.querySelectorAll(".lang"), function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-lang") === active ? "true" : "false");
    });
  }

  if (langGrid) {
    langGrid.innerHTML = LANGS.map(function (l) {
      return '<button class="lang" type="button" aria-pressed="false" data-lang="' + NC.esc(l.code) + '" lang="' + NC.esc(l.code) + '">' +
        '<span class="lang__code">' + NC.esc(l.code) + "</span>" +
        '<span><span class="lang__name">' + NC.esc(l.name) + "</span>" +
        '<span class="lang__native"' + (l.dir === "rtl" ? ' dir="rtl"' : "") + ">" + NC.esc(l.native) + "</span></span>" +
        "</button>";
    }).join("");

    langGrid.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".lang") : null;
      if (!btn) return;
      var code = btn.getAttribute("data-lang");
      if (code === NC.getPref("lang")) return;
      NC.setPref("lang", code);
      paintLangs();
      var meta = LANGS.filter(function (l) { return l.code === code; })[0];
      NC.toast("Interface switched to " + (meta ? meta.name : code) + ".");
    });

    paintLangs();
    document.addEventListener("nc:lang", paintLangs);
  }

  /* ----------------------------------------------------------------- reset */

  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      if (clearBtn.dataset.armed !== "1") {
        clearBtn.dataset.armed = "1";
        clearBtn.textContent = "Tap again to confirm";
        setTimeout(function () {
          clearBtn.dataset.armed = "";
          clearBtn.textContent = "Reset console";
        }, 4000);
        return;
      }
      try {
        localStorage.removeItem("nocap.prefs.v1");
        sessionStorage.removeItem("nocap.booted");
      } catch (err) { /* private browsing */ }
      NC.setPref("theme", "dark");
      NC.setPref("lang", "en");
      NC.setPref("motion", true);
      NC.setPref("cursor", true);
      NC.toast("Everything is back to defaults. Nova will greet you again on your next visit.");
      setTimeout(function () { location.reload(); }, 900);
    });
  }
})();
