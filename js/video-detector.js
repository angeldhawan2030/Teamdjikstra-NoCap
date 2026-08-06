/* ==========================================================================
   No Cap — AI Video Detector
   The clip never leaves the device. Frames are sampled locally with a canvas
   and only those stills are sent for analysis.
   ========================================================================== */

(function () {
  "use strict";

  var NC = window.NC || {};

  var dropzone = document.getElementById("dropzone");
  if (!dropzone) return;

  var fileInput = document.getElementById("fileInput");
  var browseBtn = document.getElementById("browseBtn");
  var player = document.getElementById("player");
  var frameStrip = document.getElementById("frameStrip");
  var analyzeBtn = document.getElementById("analyzeBtn");
  var resetBtn = document.getElementById("resetBtn");
  var scanner = document.getElementById("scanner");
  var scannerLog = document.getElementById("scannerLog");
  var result = document.getElementById("result");
  var findingsEl = document.getElementById("findings");
  var adviceEl = document.getElementById("advice");
  var errorEl = document.getElementById("vidError");

  var tabUpload = document.getElementById("tabUpload");
  var tabLink = document.getElementById("tabLink");
  var paneUpload = document.getElementById("paneUpload");
  var paneLink = document.getElementById("paneLink");
  var linkInput = document.getElementById("linkInput");
  var linkBtn = document.getElementById("linkBtn");
  var linkError = document.getElementById("linkError");

  var MAX_BYTES = 120 * 1024 * 1024;
  var FRAME_COUNT = 6;
  var FRAME_EDGE = 640;

  var currentFile = null;
  var currentUrl = null;
  var frames = [];

  /* ---------------------------------------------------------------- tabs */

  function selectTab(which) {
    var upload = which === "upload";
    tabUpload.setAttribute("aria-selected", upload ? "true" : "false");
    tabLink.setAttribute("aria-selected", upload ? "false" : "true");
    paneUpload.hidden = !upload;
    paneLink.hidden = upload;
    analyzeBtn.parentElement.style.display = upload ? "" : "none";
  }
  tabUpload.addEventListener("click", function () { selectTab("upload"); });
  tabLink.addEventListener("click", function () { selectTab("link"); });

  /* -------------------------------------------------------------- checklist */

  var TELLS = [
    { name: "Fingers that bend the wrong way", why: "Pause on any frame where a hand is visible. Count the fingers, then follow each joint. Hands in motion are where synthetic video breaks first." },
    { name: "A background that rebuilds itself", why: "Fix your eye on one object behind the speaker and watch it for ten seconds. In generated clips it slides, warps or quietly changes shape." },
    { name: "Shimmering clothes and skin", why: "Fabric patterns crawl, jewellery flickers, and skin texture boils slightly even when the person is still." },
    { name: "A smudged outline", why: "Look at the boundary between hair and background, and at the jawline. Face swaps leave a soft halo that moves with the head." },
    { name: "Blinking that is wrong", why: "People blink roughly every four to six seconds, irregularly, and fully. Synthetic faces blink too rarely, too evenly, or only halfway." },
    { name: "Stiff head and shoulders", why: "A generated face is often pinned to a still body. Watch for a talking head whose shoulders and torso barely move." },
    { name: "Shadows that disagree", why: "The shadow under the nose, the shadow on the wall and the light on the shoulders should all agree about where the lamp is." },
    { name: "Features that drift", why: "Compare the first frame with the last: jaw width, hairline, ear shape, mole placement. Drift over a clip is a strong tell." },
    { name: "Lip-sync that slips", why: "Watch the mouth close on every m, b and p. A voice track laid over generated video misses those closures." },
    { name: "A voice with no room in it", why: "Synthetic speech is often too clean, evenly paced, and lacking breath. Listen for background noise that stops when the speaking does." }
  ];

  var checkGrid = document.getElementById("checkGrid");
  if (checkGrid) {
    checkGrid.innerHTML = TELLS.map(function (t, i) {
      return '<div class="check"><span class="check__state mono">' + String(i + 1).padStart(2, "0") + "</span>" +
        "<div><b>" + t.name + "</b><p>" + t.why + "</p></div></div>";
    }).join("");
  }

  var AREA_NAMES = {
    hands: "Hands and fingers", background: "Background stability", texture: "Skin and clothing texture",
    edges: "Edges and boundaries", blinking: "Blink pattern", movement: "Body movement",
    shadows: "Shadows and light", identity: "Feature consistency", text: "Text in frame",
    other: "Other observations"
  };

  /* ------------------------------------------------------------- intake */

  function showError(message) {
    if (!errorEl) return;
    errorEl.textContent = message || "";
    errorEl.classList.toggle("is-shown", !!message);
  }

  function accept(file) {
    if (!file) return;
    if (!/^video\//.test(file.type)) {
      showError("That is not a video file. MP4, WebM and MOV work best.");
      return;
    }
    if (file.size > MAX_BYTES) {
      showError("That file is over 120 MB. Trim the clip to the part that matters.");
      return;
    }
    showError("");

    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentFile = file;
    currentUrl = URL.createObjectURL(file);
    player.src = currentUrl;
    player.hidden = false;
    frameStrip.hidden = true;
    frameStrip.innerHTML = "";
    frames = [];
    analyzeBtn.disabled = false;
    result.classList.remove("is-shown");
  }

  if (browseBtn) browseBtn.addEventListener("click", function (e) { e.stopPropagation(); fileInput.click(); });
  dropzone.addEventListener("click", function () { fileInput.click(); });
  dropzone.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener("change", function () {
    accept(fileInput.files && fileInput.files[0]);
    fileInput.value = "";
  });
  ["dragenter", "dragover"].forEach(function (type) {
    dropzone.addEventListener(type, function (e) { e.preventDefault(); dropzone.classList.add("is-over"); });
  });
  ["dragleave", "drop"].forEach(function (type) {
    dropzone.addEventListener(type, function (e) { e.preventDefault(); dropzone.classList.remove("is-over"); });
  });
  dropzone.addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) accept(e.dataTransfer.files[0]);
  });

  /* ------------------------------------------------------ frame extraction */

  function extractFrames(file) {
    return new Promise(function (resolve, reject) {
      var video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.src = URL.createObjectURL(file);

      var canvas = document.createElement("canvas");
      var ctx = canvas.getContext("2d");
      var out = [];
      var times = [];
      var index = 0;

      var failed = setTimeout(function () {
        reject(new Error("timeout"));
      }, 45000);

      video.onerror = function () {
        clearTimeout(failed);
        reject(new Error("This format cannot be decoded by your browser."));
      };

      video.onloadedmetadata = function () {
        var duration = video.duration;
        if (!isFinite(duration) || duration <= 0) {
          clearTimeout(failed);
          reject(new Error("The clip length could not be read."));
          return;
        }
        var scale = Math.min(1, FRAME_EDGE / Math.max(video.videoWidth || FRAME_EDGE, video.videoHeight || FRAME_EDGE));
        canvas.width = Math.max(1, Math.round((video.videoWidth || FRAME_EDGE) * scale));
        canvas.height = Math.max(1, Math.round((video.videoHeight || FRAME_EDGE) * scale));

        // Even intervals, skipping the very first and last moments where a
        // fade or a title card would tell us nothing.
        for (var i = 0; i < FRAME_COUNT; i++) {
          times.push(Math.min(duration - 0.05, duration * ((i + 0.5) / FRAME_COUNT)));
        }
        video.currentTime = times[0];
      };

      video.onseeked = function () {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          out.push({ time: times[index], dataUrl: canvas.toDataURL("image/jpeg", 0.72) });
        } catch (e) {
          clearTimeout(failed);
          reject(new Error("Frames could not be read from this file."));
          return;
        }
        index++;
        if (index < times.length) {
          video.currentTime = times[index];
        } else {
          clearTimeout(failed);
          URL.revokeObjectURL(video.src);
          resolve({ frames: out, duration: video.duration });
        }
      };
    });
  }

  function paintStrip(list) {
    frameStrip.hidden = false;
    frameStrip.innerHTML = list.map(function (f, i) {
      return "<figure><img src=\"" + f.dataUrl + "\" alt=\"Frame " + (i + 1) + "\">" +
        "<figcaption>" + f.time.toFixed(1) + "s</figcaption></figure>";
    }).join("");
  }

  /* ------------------------------------------------------------- scanning */

  var LOG_STEPS = [
    "reading clip metadata",
    "seeking to sample points",
    "capturing frames locally",
    "downscaling for transport",
    "comparing frames as a sequence",
    "scoring artefacts"
  ];

  function scanOn() {
    if (!scanner) return;
    scanner.classList.add("is-on");
    scanner.setAttribute("aria-hidden", "false");
    scannerLog.innerHTML = "";
    LOG_STEPS.forEach(function (step, i) {
      var li = document.createElement("li");
      li.style.animationDelay = (i * 0.18) + "s";
      li.innerHTML = "<b>&rsaquo;</b><span>" + step + "</span>";
      scannerLog.appendChild(li);
    });
  }
  function scanOff() {
    if (!scanner) return;
    scanner.classList.remove("is-on");
    scanner.setAttribute("aria-hidden", "true");
  }

  /* ------------------------------------------------------------- analysis */

  if (analyzeBtn) {
    analyzeBtn.addEventListener("click", function () {
      if (!currentFile) {
        showError("Choose a clip first.");
        return;
      }
      analyzeBtn.disabled = true;
      result.classList.remove("is-shown");
      showError("");
      scanOn();

      extractFrames(currentFile)
        .then(function (out) {
          frames = out.frames;
          paintStrip(frames);
          return fetch("/api/analyze-video", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              frames: frames.map(function (f) { return f.dataUrl; }),
              duration: out.duration
            })
          });
        })
        .then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (data) {
          scanOff();
          analyzeBtn.disabled = false;

          if (!data || !data.available) {
            result.classList.add("is-shown");
            if (adviceEl) {
              adviceEl.hidden = false;
              adviceEl.className = "notice notice--warn mt-3";
              adviceEl.innerHTML = NC.icon("warn", 17) +
                "<div><b>Automated analysis unavailable</b><p style=\"margin-top:.25rem\">" +
                NC.esc((data && data.reason) || "The service did not answer.") +
                " The frames above are still yours to study — work down the ten tells below, in order.</p></div>";
            }
            return;
          }

          var score = data.aiLikelihood;
          var bandName = NC.band(score);

          result.classList.add("is-shown");
          NC.paintVerdict(
            score,
            bandName,
            score >= 65 ? "Likely synthetic" : score >= 33 ? "Inconclusive" : "Likely real footage",
            score >= 65
              ? "Artefacts consistent with generated or face-swapped video appear across several frames. Do not act on anything this clip claims."
              : score >= 33
                ? "Something is off but the frames do not settle it. Watch the clip at quarter speed, full screen, with the sound on."
                : "Across " + data.framesAnalysed + " sampled frames nothing points to generation. Frames carry no sound, so judge the voice and lip-sync yourself."
          );

          NC.renderFindings(findingsEl, (data.findings || []).map(function (f) {
            return {
              state: f.state === "suspect" ? "fail" : f.state === "clear" ? "pass" : "unclear",
              name: AREA_NAMES[f.area] || (f.area.charAt(0).toUpperCase() + f.area.slice(1)),
              detail: f.note
            };
          }));

          if (adviceEl) {
            adviceEl.hidden = false;
            adviceEl.className = "notice mt-3" + (score >= 65 ? " notice--warn" : "");
            adviceEl.innerHTML = NC.icon(score >= 65 ? "warn" : "info", 17) +
              "<div><b>" + NC.esc(data.verdict || "Summary") + "</b>" +
              (data.advice ? "<p style=\"margin-top:.25rem\">" + NC.esc(data.advice) + "</p>" : "") +
              "<p style=\"margin-top:.4rem;font-size:.82rem;color:var(--muted)\">Audio was not analysed. " +
              "Listen for an artificial voice and check the mouth closes on every m, b and p.</p></div>";
          }

          NC.recordScan("video", bandName, score);
          result.scrollIntoView({ behavior: "smooth", block: "nearest" });
        })
        .catch(function (err) {
          scanOff();
          analyzeBtn.disabled = false;
          showError(err && err.message ? err.message : "That clip could not be processed.");
        });
    });
  }

  /* ------------------------------------------------------------ link mode */

  if (linkBtn) {
    linkBtn.addEventListener("click", function () {
      var raw = (linkInput.value || "").trim();
      var url;
      try {
        url = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
      } catch (e) {
        linkError.classList.add("is-shown");
        return;
      }
      linkError.classList.remove("is-shown");
      linkBtn.disabled = true;
      result.classList.remove("is-shown");

      fetch("/api/analyze-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.href, score: 0 })
      })
        .then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (data) {
          linkBtn.disabled = false;
          result.classList.add("is-shown");

          var suspicious = data && data.available && data.suspicious;
          NC.paintVerdict(
            suspicious ? 60 : 20,
            suspicious ? "caution" : "safe",
            "Link checked, video not seen",
            "Nothing on this page can watch a clip hosted somewhere else. What follows is a judgement on the address only — download the clip and upload the file for a real frame-by-frame answer."
          );

          NC.renderFindings(findingsEl, [
            {
              state: suspicious ? "fail" : "pass",
              name: "The address itself",
              detail: data && data.available && data.summary
                ? data.summary
                : "The address could not be assessed automatically. Check that the domain is the platform you expected and not a lookalike."
            },
            {
              state: "unclear",
              name: "The pictures in the clip",
              detail: "Not analysed. Platforms do not allow their video to be downloaded by other sites."
            },
            {
              state: "unclear",
              name: "The audio",
              detail: "Not analysed. Play the clip with headphones and listen for an unusually clean, evenly paced voice with no breath and no room tone."
            }
          ]);

          if (adviceEl) {
            adviceEl.hidden = false;
            adviceEl.className = "notice notice--warn mt-3";
            adviceEl.innerHTML = NC.icon("warn", 17) +
              "<div><b>For a real answer, upload the file</b><p style=\"margin-top:.25rem\">" +
              "Save the clip to your device, then use the upload tab. Frames are sampled in your own browser and only those stills are sent for analysis.</p></div>";
          }
        })
        .catch(function () {
          linkBtn.disabled = false;
          NC.toast("That request failed. Check your connection and try again.");
        });
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      currentFile = null;
      currentUrl = null;
      frames = [];
      player.removeAttribute("src");
      player.hidden = true;
      frameStrip.hidden = true;
      frameStrip.innerHTML = "";
      analyzeBtn.disabled = true;
      result.classList.remove("is-shown");
      if (adviceEl) adviceEl.hidden = true;
      showError("");
    });
  }
})();
