/* ==========================================================================
   No Cap — Nova boot sequence
   Nova walks in from the bottom-left, turns to face the visitor, delivers her
   line, holds for 30 seconds, then walks off to the bottom-right and hands
   over to the homepage. A skip control is always available.
   ========================================================================== */

(function () {
  "use strict";

  var HOLD_SECONDS = 30;
  var SESSION_KEY = "nocap.booted";

  var boot = document.querySelector(".boot");
  if (!boot) return;

  var nova = boot.querySelector(".nova");
  var say = boot.querySelector(".nova__say");
  var line = boot.querySelector("[data-nova-line]");
  var foot = boot.querySelector(".boot__foot");
  var skip = boot.querySelector("[data-boot-skip]");
  var cdNum = boot.querySelector("[data-cd-num]");
  var cdArc = boot.querySelector("[data-cd-arc]");
  var log = boot.querySelector(".boot__log");

  var timers = [];
  var intervals = [];
  var finished = false;

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  function finish() {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout);
    intervals.forEach(clearInterval);
    timers = [];
    intervals = [];
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch (e) {}
    boot.classList.add("is-done");
    document.body.classList.remove("is-booting");
    setTimeout(function () {
      boot.setAttribute("aria-hidden", "true");
      boot.remove();
    }, 950);
    document.dispatchEvent(new CustomEvent("nc:booted"));
  }

  // Already seen this session? Go straight to the site.
  var seen = false;
  try { seen = sessionStorage.getItem(SESSION_KEY) === "1"; } catch (e) {}
  if (seen) {
    boot.remove();
    document.body.classList.remove("is-booting");
    return;
  }

  document.body.classList.add("is-booting");
  if (skip) skip.addEventListener("click", finish);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") finish();
  });

  /* --- boot log ---------------------------------------------------------- */

  var LOG_LINES = [
    "heuristics engine ....... <b>ready</b>",
    "artefact catalogue ...... <b>1 429 patterns</b>",
    "reputation index ........ <b>synced</b>",
    "semantic intent model ... <b>warm</b>",
    "nova ..................... <b>online</b>"
  ];
  if (log) {
    LOG_LINES.forEach(function (html, i) {
      var li = document.createElement("li");
      li.innerHTML = html;
      li.style.animationDelay = (0.2 + i * 0.28) + "s";
      log.appendChild(li);
    });
  }

  /* --- typewriter -------------------------------------------------------- */

  function typeOut(el, text, speed, done) {
    el.textContent = "";
    var caret = document.createElement("i");
    caret.className = "caret";
    el.appendChild(caret);
    var i = 0;
    (function tick() {
      if (i >= text.length) {
        later(function () { caret.remove(); }, 1400);
        if (done) done();
        return;
      }
      caret.insertAdjacentText("beforebegin", text.charAt(i));
      i++;
      later(tick, speed);
    })();
  }

  /* --- countdown --------------------------------------------------------- */

  var CIRC = 2 * Math.PI * 22; // r=22 in the markup
  if (cdArc) {
    cdArc.style.strokeDasharray = CIRC.toFixed(2);
    cdArc.style.strokeDashoffset = "0";
  }

  function runCountdown(seconds, onDone) {
    var left = seconds;
    if (cdNum) cdNum.textContent = left;
    var iv = setInterval(function () {
      left--;
      if (cdNum) cdNum.textContent = Math.max(0, left);
      if (cdArc) cdArc.style.strokeDashoffset = (CIRC * (1 - left / seconds)).toFixed(2);
      if (left <= 0) {
        clearInterval(iv);
        onDone();
      }
    }, 1000);
    intervals.push(iv);
  }

  /* --- choreography ------------------------------------------------------ */

  function setNova(props, durationMs) {
    if (!nova) return;
    nova.style.setProperty("--nova-dur", (durationMs / 1000) + "s");
    Object.keys(props).forEach(function (k) { nova.style.setProperty(k, props[k]); });
  }

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 1 — Nova walks in from the bottom-left to centre stage.
  var WALK_IN = reduced ? 60 : 3400;
  later(function () {
    setNova({ "--nx": "0px", "--turn": "26deg" }, WALK_IN);
  }, 320);

  // 2 — She stops and turns to face the visitor.
  later(function () {
    if (nova) {
      nova.classList.add("is-idle");
      nova.style.setProperty("--turn", "0deg");
    }
  }, 320 + WALK_IN);

  // 3 — She speaks, then the 30-second hold begins.
  later(function () {
    if (say) say.classList.add("is-shown");
    var text = (window.NC && window.NC.t)
      ? window.NC.t("nova_line")
      : "In a world of fake links, this website is the right guide to a world free of scams!";
    if (line) typeOut(line, text, reduced ? 0 : 26);
    if (foot) foot.classList.add("is-shown");

    runCountdown(HOLD_SECONDS, function () {
      // 4 — Bubble away, Nova walks off toward the bottom-right.
      if (say) say.classList.remove("is-shown");
      if (nova) {
        nova.classList.remove("is-idle");
        nova.style.setProperty("--turn", "26deg");
      }
      var WALK_OUT = reduced ? 60 : 2600;
      later(function () {
        setNova({ "--nx": "68vw", "--ny": "16vh", "--sc": "0.72" }, WALK_OUT);
      }, 320);
      // 5 — Hand over to the homepage.
      later(finish, 420 + WALK_OUT);
    });
  }, 320 + WALK_IN + 700);
})();
