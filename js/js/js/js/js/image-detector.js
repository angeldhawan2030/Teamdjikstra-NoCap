/* ==========================================================================
   No Cap — AI Image Detector
   Accepts a file, a drop, a clipboard paste or a camera shot, downscales it in
   the browser, and sends a single still for artefact analysis.
   ========================================================================== */

(function () {
  "use strict";

  var NC = window.NC || {};

  var dropzone = document.getElementById("dropzone");
  if (!dropzone) return;

  var fileInput = document.getElementById("fileInput");
  var cameraInput = document.getElementById("cameraInput");
  var browseBtn = document.getElementById("browseBtn");
  var cameraBtn = document.getElementById("cameraBtn");
  var preview = document.getElementById("preview");
  var previewImg = document.getElementById("previewImg");
  var analyzeBtn = document.getElementById("analyzeBtn");
  var resetBtn = document.getElementById("resetBtn");
  var skeleton = document.getElementById("skeleton");
  var result = document.getElementById("result");
  var findingsEl = document.getElementById("findings");
  var adviceEl = document.getElementById("advice");
  var errorEl = document.getElementById("imgError");

  var MAX_BYTES = 12 * 1024 * 1024;
  var MAX_EDGE = 1280;
  var current = null; // { dataUrl, name }

  /* ------------------------------------------------------------ checklist */

  var AREAS = [
    { key: "hands", name: "Hands and fingers", why: "Count them. Six fingers, four fingers, a thumb on the wrong side, or two fingers fused into one — hands remain the most reliable tell there is." },
    { key: "face", name: "Facial symmetry", why: "Compare left to right: eye size and gaze direction, ear height, the two sides of a pair of glasses, matching earrings. Generated faces drift." },
    { key: "skin", name: "Skin and hair", why: "Look for waxy, airbrushed skin with no pores, and hair strands that dissolve into the background instead of ending." },
    { key: "text", name: "Text in the image", why: "Signs, packaging, name badges, book spines, phone screens. Generated lettering looks like writing until you try to read it." },
    { key: "crowd", name: "Background people", why: "Faces in a crowd smear, duplicate, or grow an extra limb. The subject gets the model's attention; the extras do not." },
    { key: "architecture", name: "Straight lines and tiles", why: "Follow a floor tile grid, a window frame or a brick course across the frame. Generated geometry bends where it should stay straight." },
    { key: "light", name: "Shadows", why: "Every shadow in one scene should agree on where the light is. Also check the subject actually casts one where they touch the ground." },
    { key: "reflections", name: "Reflections", why: "Mirrors, windows, sunglasses, water, a polished table. A reflection that does not match what is in front of it is very hard to fake and very easy to spot." },
    { key: "physics", name: "Objects and physics", why: "Cups floating a millimetre above the saucer, straps that pass through an arm, a chair leg that ends before the floor." }
  ];

  var checkGrid = document.getElementById("checkGrid");
  if (checkGrid) {
    checkGrid.innerHTML = AREAS.map(function (a, i) {
      return '<div class="check"><span class="check__state mono">' + String(i + 1).padStart(2, "0") + "</span>" +
        "<div><b>" + a.name + "</b><p>" + a.why + "</p></div></div>";
    }).join("");
  }

  var AREA_NAMES = {};
  AREAS.forEach(function (a) { AREA_NAMES[a.key] = a.name; });
  AREA_NAMES.other = "Other observations";

  /* ------------------------------------------------------------- intake */

  function showError(message) {
    if (!errorEl) return;
    errorEl.textContent = message || "";
    errorEl.classList.toggle("is-shown", !!message);
  }

  function downscale(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("read failed")); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error("decode failed")); };
        img.onload = function () {
          var scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
          var w = Math.max(1, Math.round(img.naturalWidth * scale));
          var h = Math.max(1, Math.round(img.naturalHeight * scale));
          var canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve({
            dataUrl: canvas.toDataURL("image/jpeg", 0.9),
            display: String(reader.result),
            width: img.naturalWidth,
            height: img.naturalHeight
          });
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  function accept(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      showError("That is not an image file. PNG, JPEG, WebP and GIF are supported.");
      return;
    }
    if (file.size > MAX_BYTES) {
      showError("That file is larger than 12 MB. Try a smaller copy.");
      return;
    }
    showError("");

    downscale(file).then(function (out) {
      current = { dataUrl: out.dataUrl, name: file.name || "pasted image" };
      previewImg.src = out.display;
      previewImg.alt = "Preview of " + current.name;
      preview.hidden = false;
      analyzeBtn.disabled = false;
      result.classList.remove("is-shown");
      if (adviceEl) adviceEl.hidden = true;
      NC.toast(out.width + " × " + out.height + " loaded. Ready to analyse.");
    }).catch(function () {
      showError("That image could not be read. Try saving it again, or use a different format.");
    });
  }

  if (browseBtn) browseBtn.addEventListener("click", function (e) { e.stopPropagation(); fileInput.click(); });
  if (cameraBtn) cameraBtn.addEventListener("click", function (e) { e.stopPropagation(); cameraInput.click(); });
  dropzone.addEventListener("click", function () { fileInput.click(); });
  dropzone.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
  });

  [fileInput, cameraInput].forEach(function (el) {
    if (!el) return;
    el.addEventListener("change", function () {
      accept(el.files && el.files[0]);
      el.value = "";
    });
  });

  ["dragenter", "dragover"].forEach(function (type) {
    dropzone.addEventListener(type, function (e) {
      e.preventDefault();
      dropzone.classList.add("is-over");
    });
  });
  ["dragleave", "drop"].forEach(function (type) {
    dropzone.addEventListener(type, function (e) {
      e.preventDefault();
      dropzone.classList.remove("is-over");
    });
  });
  dropzone.addEventListener("drop", function (e) {
    var dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length) accept(dt.files[0]);
  });

  document.addEventListener("paste", function (e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf("image/") === 0) {
        accept(items[i].getAsFile());
        e.preventDefault();
        return;
      }
    }
  });

  /* ------------------------------------------------------------- analysis */

  function verdictCopy(score, confidence) {
    if (score >= 65) {
      return "Multiple generation artefacts are present. Treat this image as synthetic until something outside the picture proves otherwise.";
    }
    if (score >= 33) {
      return "Some details do not sit right, but not enough to call it. Look at the flagged areas yourself at full resolution before you decide.";
    }
    return confidence === "low"
      ? "Nothing obviously artificial — though the image is small or soft enough that a confident answer is not possible."
      : "This reads as a real photograph. Generation artefacts were not found in the areas checked.";
  }

  if (analyzeBtn) {
    analyzeBtn.addEventListener("click", function () {
      if (!current) return;
      analyzeBtn.disabled = true;
      result.classList.remove("is-shown");
      if (skeleton) skeleton.classList.add("is-shown");
      if (preview) preview.classList.add("is-scanning");

      fetch("/api/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: current.dataUrl })
      })
        .then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (data) {
          if (skeleton) skeleton.classList.remove("is-shown");
          if (preview) preview.classList.remove("is-scanning");
          analyzeBtn.disabled = false;

          if (!data || !data.available) {
            NC.toast("The analysis model is not reachable right now.");
            if (adviceEl) {
              adviceEl.hidden = false;
              adviceEl.className = "notice notice--warn mt-3";
              adviceEl.innerHTML = NC.icon("warn", 17) +
                "<div><b>Automated analysis unavailable</b><p style=\"margin-top:.25rem\">" +
                NC.esc((data && data.reason) || "The service did not answer.") +
                " Use the nine-point checklist below and inspect the image yourself at full size — it is the same list the model works through.</p></div>";
            }
            result.classList.add("is-shown");
            return;
          }

          var score = data.aiLikelihood;
          var bandName = NC.band(score);

          result.classList.add("is-shown");
          NC.paintVerdict(
            score,
            bandName,
            score >= 65 ? "Likely AI-generated" : score >= 33 ? "Inconclusive" : "Likely a real photo",
            verdictCopy(score, data.confidence)
          );

          NC.renderFindings(findingsEl, (data.findings || []).map(function (f) {
            return {
              state: f.state === "suspect" ? "fail" : f.state === "clear" ? "pass" : "unclear",
              name: AREA_NAMES[f.area] || (f.area.charAt(0).toUpperCase() + f.area.slice(1)),
              detail: f.note
            };
          }));

          if (adviceEl && (data.advice || data.verdict)) {
            adviceEl.hidden = false;
            adviceEl.className = "notice mt-3" + (score >= 65 ? " notice--warn" : "");
            adviceEl.innerHTML = NC.icon(score >= 65 ? "warn" : "info", 17) +
              "<div><b>" + NC.esc(data.verdict || "Summary") + "</b>" +
              (data.advice ? "<p style=\"margin-top:.25rem\">" + NC.esc(data.advice) + "</p>" : "") +
              "<p class=\"mono\" style=\"margin-top:.4rem;font-size:.74rem;color:var(--faint)\">Model confidence: " +
              NC.esc(data.confidence) + "</p></div>";
          }

          NC.recordScan("image", bandName, score);
          result.scrollIntoView({ behavior: "smooth", block: "nearest" });
        })
        .catch(function () {
          if (skeleton) skeleton.classList.remove("is-shown");
          if (preview) preview.classList.remove("is-scanning");
          analyzeBtn.disabled = false;
          NC.toast("That request failed. Check your connection and try again.");
        });
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      current = null;
      previewImg.removeAttribute("src");
      preview.hidden = true;
      analyzeBtn.disabled = true;
      result.classList.remove("is-shown");
      if (adviceEl) adviceEl.hidden = true;
      showError("");
    });
  }
})();
