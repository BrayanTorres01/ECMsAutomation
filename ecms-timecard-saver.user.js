// ==UserScript==
// @name         ECMS Paystub Auto Downloader (CVC)
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Queue paystubs on Employee History Inquiry, download in a separate worker tab, prefix + optional weekend date naming, with left-aligned status + progress bar spacer
// @match        http://10.100.82.83:10000/*
// @match        https://cvcholdings.ecmserp.com/ecms/*
// @run-at       document-end
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_download
// ==/UserScript==

(function () {
  "use strict";

  const href = window.location.href;

  const KEY_QUEUE = "ecms_paystub_queue";
  const KEY_INDEX = "ecms_paystub_index";
  const KEY_RUNNING = "ecms_paystub_running";
  const KEY_WORKER = "ecms_paystub_worker";

  const KEY_RUN_ID = "ecms_paystub_run_id";
  const KEY_DONE_FLAG = "ecms_paystub_done_flag";
  const KEY_DONE_TOTAL = "ecms_paystub_done_total";
  const KEY_DONE_OK = "ecms_paystub_done_ok";
  const KEY_DONE_FAIL = "ecms_paystub_done_fail";
  const KEY_DONE_ACK = "ecms_paystub_done_ack";

  // Naming options (set in main tab, read by worker)
  const KEY_NAME_PREFIX = "ecms_paystub_name_prefix";
  const KEY_NAME_USE_DATE = "ecms_paystub_name_use_date";

  function getQueue() {
    const stored = GM_getValue(KEY_QUEUE, "[]");
    if (Array.isArray(stored)) return stored;
    if (typeof stored === "string") {
      try {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  function setQueue(q) {
    GM_setValue(KEY_QUEUE, Array.isArray(q) ? q : []);
  }

  function getIndex() {
    return Number(GM_getValue(KEY_INDEX, 0)) || 0;
  }

  function setIndex(i) {
    GM_setValue(KEY_INDEX, i);
  }

  function isRunning() {
    return !!GM_getValue(KEY_RUNNING, false);
  }

  function setRunning(v) {
    GM_setValue(KEY_RUNNING, !!v);
  }

  function isWorker() {
    return !!GM_getValue(KEY_WORKER, false);
  }

  function setWorker(v) {
    GM_setValue(KEY_WORKER, !!v);
  }

  function newRunId() {
    const id = `run_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    GM_setValue(KEY_RUN_ID, id);
    return id;
  }

  function getRunId() {
    return String(GM_getValue(KEY_RUN_ID, "")) || "";
  }

  function clearDone() {
    GM_setValue(KEY_DONE_FLAG, false);
    GM_setValue(KEY_DONE_TOTAL, 0);
    GM_setValue(KEY_DONE_OK, 0);
    GM_setValue(KEY_DONE_FAIL, 0);
  }

  function setDone(total, ok, fail) {
    GM_setValue(KEY_DONE_TOTAL, Number(total) || 0);
    GM_setValue(KEY_DONE_OK, Number(ok) || 0);
    GM_setValue(KEY_DONE_FAIL, Number(fail) || 0);
    GM_setValue(KEY_DONE_FLAG, true);
  }

  function getDoneFlag() {
    return !!GM_getValue(KEY_DONE_FLAG, false);
  }

  function sanitizeForFilename(s) {
    return String(s || "")
      .trim()
      .replace(/[\\\/:*?"<>|]+/g, "") // Windows illegal
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatDateToDash(mmddyyyy) {
    return String(mmddyyyy).replace(/\//g, "-");
  }

  // Naming rule:
  // - If "Include weekend date" checked: NAME = [prefix + space] + date + ".pdf"
  // - If unchecked: NAME = [prefix] + ".pdf"
  // - If prefix empty:
  //     - checked -> date.pdf
  //     - unchecked -> date.pdf (fallback)
  function computeFilename(dateText) {
    const useDate = !!GM_getValue(KEY_NAME_USE_DATE, true);
    const rawPrefix = GM_getValue(KEY_NAME_PREFIX, "");
    const prefix = sanitizeForFilename(rawPrefix);
    const dateDash = formatDateToDash(dateText);

    if (useDate) {
      if (prefix) return `${prefix} ${dateDash}.pdf`;
      return `${dateDash}.pdf`;
    }

    if (prefix) return `${prefix}.pdf`;
    return `${dateDash}.pdf`;
  }

  function findPaystubTableBody(doc) {
    return (
      doc.querySelector("tbody[id$='subfile:tb']") ||
      doc.querySelector("tbody.rich-table-tbody")
    );
  }

  function findPaystubRows(doc) {
    const tbody = findPaystubTableBody(doc);
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll("tr.rich-table-row"));
  }

  function buildQueueFromRows(rows) {
    const queue = [];

    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll("td"));

      let dateText = null;
      for (const td of cells) {
        const t = (td.textContent || "").trim();
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) {
          dateText = t;
          break;
        }
      }
      if (!dateText) continue;

      const img =
        row.querySelector("img[onclick*='openImaging']") ||
        row.querySelector("img");
      if (!img) continue;

      const onclick = img.getAttribute("onclick") || "";
      const m = onclick.match(/openImaging\('([^']+)','([^']+)'/);
      if (!m) continue;

      const ctx = m[1];
      const path = m[2];
      const assocUrl = `${location.origin}/${ctx}${path}`;

      queue.push({ dateText, assocUrl });
    }

    return queue;
  }

  function ensureStyles(doc) {
  if (doc.getElementById("ecms-paystub-style")) return;

  const style = doc.createElement("style");
  style.id = "ecms-paystub-style";
  style.textContent = `
    #ecmsPaystubToolbar{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      margin:6px 0 8px 0;
      padding:2px 0;
      white-space:nowrap;
    }

    /* Left group: status + tiny bar TOUCH */
    #ecmsPaystubLeft{
      display:flex;
      align-items:center;
      gap:0;
      flex: 1 1 auto;
      min-width: 0;
      justify-content:flex-start;
    }

    /* Right group: make inputs TOUCH, then gap before buttons */
    #ecmsPaystubRight{
      display:flex;
      align-items:center;
      justify-content:flex-end;
      gap:0;                 /* TOUCH for the control strip */
      flex: 0 0 auto;
    }

    /* === Unified height for the "strip" === */
    :root{
      --ecmsCtrlH: 32px;
      --ecmsBorder: 1px solid #bdbdbd;
      --ecmsRadius: 6px;
    }

    #ecmsPaystubStatus,
    #ecmsPaystubMiniProgWrap,
    #ecmsPaystubPrefix,
    #ecmsPaystubUseDateWrap{
      height: var(--ecmsCtrlH);
      box-sizing:border-box;
      display:flex;
      align-items:center;
      font-family: Arial, Helvetica, sans-serif;
      font-size:12px;
    }

    /* Status (left-most) */
    #ecmsPaystubStatus{
      min-width: 260px;
      max-width: 560px;
      width: 420px;
      padding: 0 10px;
      border: var(--ecmsBorder);
      border-right:none;                  /* touch next */
      border-radius: var(--ecmsRadius) 0 0 var(--ecmsRadius);
      background:#f7f7f7;
      color:#222;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
    }

    /* Mini progress (touch status) */
    #ecmsPaystubMiniProgWrap{
      width: 130px;
      padding: 0 8px;
      border: var(--ecmsBorder);
      border-left:none;                   /* touch prev */
      border-radius: 0 var(--ecmsRadius) var(--ecmsRadius) 0;
      background:#fff;
      overflow:hidden;
    }

    #ecmsPaystubMiniProgTrack{
      width:100%;
      height:10px;
      border:1px solid #cfcfcf;
      border-radius:999px;
      background:#ffffff;
      overflow:hidden;
      box-sizing:border-box;
    }
    #ecmsPaystubMiniProgBar{
      height:100%;
      width:0%;
      background: linear-gradient(#3aa85a, #2e7d32);
    }

    /* Input strip (touch checkbox) */
    #ecmsPaystubPrefix{
      width: 240px;
      max-width: 36vw;
      padding: 0 10px;
      border: var(--ecmsBorder);
      border-radius: var(--ecmsRadius) 0 0 var(--ecmsRadius);
      background:#fff;
      color:#222;
      outline:none;
      margin-left:12px;                   /* space between left strip and right strip */
    }

    /* Checkbox strip (touch input) */
    #ecmsPaystubUseDateWrap{
      gap:6px;
      padding: 0 10px;
      border: var(--ecmsBorder);
      border-left:none;                   /* touch input */
      border-radius: 0 var(--ecmsRadius) var(--ecmsRadius) 0;
      background:#fff;
      color:#222;
      user-select:none;
    }

    /* Add gap BEFORE buttons so buttons aren't fused to strip */
    #ecmsPaystubRight .ecmsPaystubBtn{
      margin-left:10px;
    }

    .ecmsPaystubBtn{
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      height: var(--ecmsCtrlH);           /* match strip height */
      padding: 0 12px;
      border: 1px solid #7f7f7f;
      border-radius: 6px;
      background: linear-gradient(#f7f7f7, #e6e6e6);
      color: #000;
      cursor: pointer;
      box-sizing:border-box;
      display:inline-flex;
      align-items:center;
      justify-content:center;
    }
    .ecmsPaystubBtn:hover{ filter: brightness(0.98); }

    .ecmsPaystubBtnPrimary{
      border-color:#2e6e3a;
      background: linear-gradient(#3aa85a, #2e7d32);
      color:#fff;
    }
    .ecmsPaystubBtnDanger{
      border-color:#8a2a2a;
      background: linear-gradient(#d94a4a, #b22f2f);
      color:#fff;
    }

    @media (max-width: 1200px){
      #ecmsPaystubStatus{ width: 320px; }
      #ecmsPaystubMiniProgWrap{ width: 100px; }
      #ecmsPaystubPrefix{ width: 200px; }
    }
  `;
  doc.head.appendChild(style);
}

  function insertToolbar(doc) {
    ensureStyles(doc);

    let bar = doc.getElementById("ecmsPaystubToolbar");
    if (bar) return bar;

    bar = doc.createElement("div");
    bar.id = "ecmsPaystubToolbar";

    const left = doc.createElement("div");
    left.id = "ecmsPaystubLeft";

    const right = doc.createElement("div");
    right.id = "ecmsPaystubRight";

    const status = doc.createElement("div");
    status.id = "ecmsPaystubStatus";
    status.textContent = "Ready.";

    const miniWrap = doc.createElement("div");
    miniWrap.id = "ecmsPaystubMiniProgWrap";

    const track = doc.createElement("div");
    track.id = "ecmsPaystubMiniProgTrack";

    const barInner = doc.createElement("div");
    barInner.id = "ecmsPaystubMiniProgBar";

    track.appendChild(barInner);
    miniWrap.appendChild(track);

    left.appendChild(status);
    left.appendChild(miniWrap);

    bar.appendChild(left);
    bar.appendChild(right);

    const anchor = doc.querySelector("div#content") || doc.querySelector("form") || doc.body;
    anchor.insertBefore(bar, anchor.firstChild);

    return bar;
  }

  function setStatus(doc, text) {
    const el = doc.getElementById("ecmsPaystubStatus");
    if (el) el.textContent = text;
  }

  function setMiniProgress(doc, processed, total) {
    const el = doc.getElementById("ecmsPaystubMiniProgBar");
    if (!el) return;
    const pct = total > 0 ? Math.min(100, Math.max(0, (processed / total) * 100)) : 0;
    el.style.width = pct.toFixed(1) + "%";
  }

  function addControls(doc) {
    insertToolbar(doc);

    const right = doc.getElementById("ecmsPaystubRight");

    // Prefix input
    if (!doc.getElementById("ecmsPaystubPrefix")) {
      const input = doc.createElement("input");
      input.type = "text";
      input.id = "ecmsPaystubPrefix";
      input.placeholder = "File name text (optional)";
      input.value = String(GM_getValue(KEY_NAME_PREFIX, "") || "");
      right.appendChild(input);

      input.addEventListener("input", () => {
        GM_setValue(KEY_NAME_PREFIX, input.value);
      });
    }

    // Use date checkbox
    if (!doc.getElementById("ecmsPaystubUseDate")) {
      const wrap = doc.createElement("label");
      wrap.id = "ecmsPaystubUseDateWrap";

      const cb = doc.createElement("input");
      cb.type = "checkbox";
      cb.id = "ecmsPaystubUseDate";
      cb.checked = !!GM_getValue(KEY_NAME_USE_DATE, true);

      const txt = doc.createElement("span");
      txt.textContent = "Include weekend date";

      wrap.appendChild(cb);
      wrap.appendChild(txt);
      right.appendChild(wrap);

      cb.addEventListener("change", () => {
        GM_setValue(KEY_NAME_USE_DATE, cb.checked);
      });
    }
  }

  function addButtons(doc) {
    const rows = findPaystubRows(doc);
    if (!rows.length) return false;

    addControls(doc);

    const right = doc.getElementById("ecmsPaystubRight");

    if (!doc.getElementById("ecmsPaystubStartBtn")) {
      const startBtn = doc.createElement("button");
      startBtn.type = "button";
      startBtn.id = "ecmsPaystubStartBtn";
      startBtn.className = "ecmsPaystubBtn ecmsPaystubBtnPrimary";
      startBtn.textContent = "Auto Download Paystubs";
      right.appendChild(startBtn);

      startBtn.addEventListener("click", () => {
        const latestRows = findPaystubRows(doc);
        const queue = buildQueueFromRows(latestRows);

        if (!queue.length) {
          alert("No paystubs found on this page.");
          return;
        }

        clearDone();
        newRunId();
        GM_setValue(KEY_DONE_ACK, "");

        setQueue(queue);
        setIndex(0);
        setRunning(true);
        setWorker(false);

        setStatus(doc, `Running. 0 of ${queue.length} processed.`);
        setMiniProgress(doc, 0, queue.length);

        window.open(queue[0].assocUrl, "_blank");
      });
    }

    if (!doc.getElementById("ecmsPaystubStopBtn")) {
      const stopBtn = doc.createElement("button");
      stopBtn.type = "button";
      stopBtn.id = "ecmsPaystubStopBtn";
      stopBtn.className = "ecmsPaystubBtn ecmsPaystubBtnDanger";
      stopBtn.textContent = "Stop";
      right.appendChild(stopBtn);

      stopBtn.addEventListener("click", () => {
        setRunning(false);
        setWorker(false);
        setQueue([]);
        setIndex(0);
        clearDone();
        GM_setValue(KEY_DONE_ACK, "");

        setStatus(doc, "Stopped. Ready.");
        setMiniProgress(doc, 0, 0);

        alert("Stopped. Queue cleared.");
      });
    }

    // render current status (helpful on page changes)
    const q = getQueue();
    const idx = getIndex();
    if (isRunning() && q.length) {
      const processed = Math.min(idx, q.length);
      setStatus(doc, `Running. ${processed} of ${q.length} processed.`);
      setMiniProgress(doc, processed, q.length);
    } else if (getDoneFlag()) {
      const total = Number(GM_getValue(KEY_DONE_TOTAL, 0)) || 0;
      const ok = Number(GM_getValue(KEY_DONE_OK, 0)) || 0;
      const fail = Number(GM_getValue(KEY_DONE_FAIL, 0)) || 0;
      setStatus(doc, `Finished. ${ok} of ${total} paystubs downloaded. ${fail} skipped.`);
      setMiniProgress(doc, total, total);
    } else {
      setStatus(doc, "Ready.");
      setMiniProgress(doc, 0, 0);
    }

    return true;
  }

  function tryInjectButtonInThisDoc() {
    try {
      return addButtons(document);
    } catch {
      return false;
    }
  }

  function tryInjectButtonInContentFrame() {
    const frame = document.querySelector("iframe#contentFrame");
    if (!frame) return false;

    try {
      const doc = frame.contentDocument;
      if (!doc) return false;
      return addButtons(doc);
    } catch {
      return false;
    }
  }

  function startMainTabMonitor(doc) {
    if (doc.__ecmsPaystubMonitorStarted) return;
    doc.__ecmsPaystubMonitorStarted = true;

    const timer = setInterval(() => {
      try {
        const running = isRunning();
        const q = getQueue();
        const idx = getIndex();

        if (running && q.length) {
          const processed = Math.min(idx, q.length);
          setStatus(doc, `Running. ${processed} of ${q.length} processed.`);
          setMiniProgress(doc, processed, q.length);
        }

        if (getDoneFlag()) {
          const runId = getRunId();
          const ack = String(GM_getValue(KEY_DONE_ACK, "")) || "";

          const total = Number(GM_getValue(KEY_DONE_TOTAL, 0)) || 0;
          const ok = Number(GM_getValue(KEY_DONE_OK, 0)) || 0;
          const fail = Number(GM_getValue(KEY_DONE_FAIL, 0)) || 0;

          const msg = `Finished. ${ok} of ${total} paystubs downloaded. ${fail} skipped.`;

          // show the finished alert ONCE per run
          if (ack !== runId) {
            GM_setValue(KEY_DONE_ACK, runId);
            setStatus(doc, msg);
            setMiniProgress(doc, total, total);
            alert(msg);
          } else {
            setStatus(doc, msg);
            setMiniProgress(doc, total, total);
          }
        }

        if (!running && !getDoneFlag()) {
          const statusEl = doc.getElementById("ecmsPaystubStatus");
          if (statusEl && (statusEl.textContent || "").startsWith("Running.")) {
            setStatus(doc, "Ready.");
            setMiniProgress(doc, 0, 0);
          }
        }
      } catch {
        // ignore
      }
    }, 500);

    doc.__ecmsPaystubMonitorTimer = timer;
  }

  // Main tab init (inject controls + buttons)
  (function initMainTab() {
    if (href.includes("/ecms/imaging/document/")) return;

    if (tryInjectButtonInThisDoc()) {
      startMainTabMonitor(document);
      return;
    }

    let attempts = 0;
    const maxAttempts = 80;

    const timer = setInterval(() => {
      attempts++;
      const ok = tryInjectButtonInContentFrame();
      if (ok) {
        const frame = document.querySelector("iframe#contentFrame");
        const doc = frame && frame.contentDocument;
        if (doc) startMainTabMonitor(doc);
      }
      if (ok || attempts >= maxAttempts) clearInterval(timer);
    }, 250);
  })();

  // Worker tab logic
  (function handleViewerPages() {
    if (!href.includes("/ecms/imaging/document/")) return;
    if (!isRunning()) return;

    if (!isWorker()) setWorker(true);

    const queue = getQueue();
    const index = getIndex();

    if (!queue.length || index >= queue.length) {
      setRunning(false);
      setWorker(false);
      setQueue([]);
      setIndex(0);
      try { window.close(); } catch {}
      return;
    }

    const current = queue[index];

    if (href.includes("associationRedirect.faces") || href.includes("viewImageContent")) {
      const maxAttempts = 80;
      let attempts = 0;

      const timer = setInterval(() => {
        attempts++;

        const iframe = document.querySelector("iframe#imageIframe");
        if (iframe) {
          try {
            const idoc = iframe.contentDocument || iframe.contentWindow.document;
            const a = idoc && idoc.querySelector("a[href*='viewImage.jsp']");
            if (a && a.href) {
              clearInterval(timer);
              window.location.replace(a.href);
              return;
            }
          } catch {}
        }

        if (attempts >= maxAttempts) {
          clearInterval(timer);

          const fail = Number(GM_getValue(KEY_DONE_FAIL, 0)) || 0;
          GM_setValue(KEY_DONE_FAIL, fail + 1);

          const nextIndex = index + 1;
          setIndex(nextIndex);

          if (nextIndex < queue.length) {
            window.location.replace(queue[nextIndex].assocUrl);
          } else {
            const total = queue.length;
            const finalFail = Number(GM_getValue(KEY_DONE_FAIL, 0)) || 0;
            const ok = total - finalFail;

            setDone(total, ok, finalFail);
            setRunning(false);
            setWorker(false);
            setQueue([]);
            setIndex(0);

            try { window.close(); } catch {}
          }
        }
      }, 250);

      return;
    }

    if (href.includes("viewImage.jsp")) {
      if (window.__ecmsDownloading) return;
      window.__ecmsDownloading = true;

      const filename = computeFilename(current.dateText);

      GM_download({
        url: href,
        name: filename,
        saveAs: false,
        onload: function () {
          const nextIndex = index + 1;
          setIndex(nextIndex);

          if (nextIndex < queue.length) {
            window.location.replace(queue[nextIndex].assocUrl);
          } else {
            const total = queue.length;
            const finalFail = Number(GM_getValue(KEY_DONE_FAIL, 0)) || 0;
            const ok = total - finalFail;

            setDone(total, ok, finalFail);
            setRunning(false);
            setWorker(false);
            setQueue([]);
            setIndex(0);

            try { window.close(); } catch {}
          }
        },
        onerror: function () {
          window.__ecmsDownloading = false;

          const fail = Number(GM_getValue(KEY_DONE_FAIL, 0)) || 0;
          GM_setValue(KEY_DONE_FAIL, fail + 1);

          const nextIndex = index + 1;
          setIndex(nextIndex);

          if (nextIndex < queue.length) {
            window.location.replace(queue[nextIndex].assocUrl);
          } else {
            const total = queue.length;
            const finalFail = Number(GM_getValue(KEY_DONE_FAIL, 0)) || 0;
            const ok = total - finalFail;

            setDone(total, ok, finalFail);
            setRunning(false);
            setWorker(false);
            setQueue([]);
            setIndex(0);

            try { window.close(); } catch {}
          }
        }
      });
    }
  })();
})();
