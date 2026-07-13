import * as pdfjsLib from "./vendor/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "./vendor/pdf.worker.min.mjs";

const { PDFDocument, StandardFonts, rgb } = PDFLib;

/* ============================== State ============================== */

const state = {
  fileName: null,
  origBytes: null,     // pristine copy for pdf-lib
  pdfDoc: null,        // pdf.js document
  pages: [],           // [{ srcIndex, pdfPage, wrapper, canvas, overlay, thumbUrl, deleted }]
  zoom: 1,
  tool: "view",
  textDefaults: { size: 14, color: "#111111", whiteout: false },
  sigs: [],            // [{ id, url, w, h, isJpeg }]
  activeSigId: null,
  selected: null,      // selected .anno element
};

let renderGen = 0;

/* ============================== DOM refs ============================== */

const $ = (id) => document.getElementById(id);
const viewer = $("viewer");
const viewerWrap = $("viewerWrap");
const dropzone = $("dropzone");
const fileInput = $("fileInput");
const thumbList = $("thumbList");
const sigList = $("sigList");

/* ============================== File loading ============================== */

async function openFile(file) {
  if (!file || file.type !== "application/pdf") {
    alert("Please choose a PDF file.");
    return;
  }
  const buf = await file.arrayBuffer();
  state.origBytes = new Uint8Array(buf).slice();
  state.fileName = file.name;

  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  state.pdfDoc = doc;
  state.pages = [];
  state.selected = null;
  viewer.innerHTML = "";
  thumbList.innerHTML = "";

  for (let i = 1; i <= doc.numPages; i++) {
    const pdfPage = await doc.getPage(i);
    const p = { srcIndex: i - 1, pdfPage, deleted: false, thumbUrl: null };
    buildPageDom(p);
    state.pages.push(p);
    viewer.appendChild(p.wrapper);
  }

  dropzone.classList.add("hidden");
  $("downloadBtn").disabled = false;
  $("fileName").textContent = file.name;
  $("infoName").textContent = file.name;
  $("infoPages").textContent = doc.numPages;
  $("docInfo").classList.remove("hidden");

  await rerenderAll();
  await buildThumbnails();
  updatePageIndicator();
}

function buildPageDom(p) {
  const wrapper = document.createElement("div");
  wrapper.className = "page-wrap";
  const canvas = document.createElement("canvas");
  const overlay = document.createElement("div");
  overlay.className = "page-overlay";
  wrapper.appendChild(canvas);
  wrapper.appendChild(overlay);
  overlay.addEventListener("click", (e) => onOverlayClick(e, p));
  p.wrapper = wrapper;
  p.canvas = canvas;
  p.overlay = overlay;
  applyToolClass(p);
}

/* ============================== Rendering ============================== */

async function renderPage(p) {
  if (p.renderTask) p.renderTask.cancel();
  const dpr = window.devicePixelRatio || 1;
  const vp = p.pdfPage.getViewport({ scale: state.zoom });
  const vpHi = p.pdfPage.getViewport({ scale: state.zoom * dpr });

  p.canvas.width = Math.floor(vpHi.width);
  p.canvas.height = Math.floor(vpHi.height);
  p.canvas.style.width = `${Math.floor(vp.width)}px`;
  p.canvas.style.height = `${Math.floor(vp.height)}px`;
  p.wrapper.style.width = `${Math.floor(vp.width)}px`;

  const ctx = p.canvas.getContext("2d");
  p.renderTask = p.pdfPage.render({ canvasContext: ctx, viewport: vpHi });
  try {
    await p.renderTask.promise;
  } catch (err) {
    if (err?.name !== "RenderingCancelledException") throw err;
  }
  p.renderTask = null;

  // keep text annotation font sizes in sync with zoom
  p.overlay.querySelectorAll(".txt-anno").forEach((a) => {
    const c = a.querySelector(".txt-content");
    c.style.fontSize = `${parseFloat(a.dataset.size) * state.zoom}px`;
  });
}

async function rerenderAll() {
  const gen = ++renderGen;
  for (const p of state.pages) {
    if (p.deleted) continue;
    if (gen !== renderGen) return;
    await renderPage(p);
  }
}

async function buildThumbnails() {
  for (const p of state.pages) {
    const vp1 = p.pdfPage.getViewport({ scale: 1 });
    const vp = p.pdfPage.getViewport({ scale: 180 / vp1.width });
    const c = document.createElement("canvas");
    c.width = Math.floor(vp.width);
    c.height = Math.floor(vp.height);
    await p.pdfPage.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    p.thumbUrl = c.toDataURL("image/jpeg", 0.7);
  }
  rebuildThumbList();
}

/* ============================== Tools / panels ============================== */

function setTool(tool) {
  state.tool = tool;
  document.querySelectorAll(".tool-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.tool === tool)
  );
  document.querySelectorAll(".panel").forEach((pnl) => pnl.classList.remove("active"));
  $(`panel-${tool === "view" ? "view" : tool}`).classList.add("active");
  state.pages.forEach(applyToolClass);
  selectAnno(null);
  if (tool === "sign" && state.sigs.length === 0) openSigModal();
}

function applyToolClass(p) {
  p.overlay.classList.toggle("tool-edit", state.tool === "edit");
  p.overlay.classList.toggle("tool-sign", state.tool === "sign");
}

document.querySelectorAll(".tool-btn").forEach((b) =>
  b.addEventListener("click", () => setTool(b.dataset.tool))
);

/* ============================== Selection ============================== */

function selectAnno(el) {
  if (state.selected) state.selected.classList.remove("selected");
  state.selected = el;
  if (el) {
    el.classList.add("selected");
    if (el.classList.contains("txt-anno")) {
      $("fontSize").value = el.dataset.size;
      $("fontColor").value = el.dataset.color;
      $("whiteoutToggle").checked = el.classList.contains("whiteout");
    }
  }
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") selectAnno(null);
  if (e.key === "Delete" && state.selected && !document.activeElement?.isContentEditable) {
    state.selected.remove();
    state.selected = null;
  }
});

/* ============================== Overlay clicks ============================== */

function onOverlayClick(e, p) {
  if (e.target.closest(".anno")) return; // handled by the annotation itself
  const r = p.overlay.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  if (state.tool === "edit") addTextAnno(p, x, y);
  else if (state.tool === "sign") placeSignature(p, x, y);
}

function pct(v, total) {
  return `${((v / total) * 100).toFixed(3)}%`;
}

/* ============================== Text annotations ============================== */

function addTextAnno(p, x, y) {
  const d = state.textDefaults;
  const el = document.createElement("div");
  el.className = "anno txt-anno" + (d.whiteout ? " whiteout" : "");
  el.dataset.size = d.size;
  el.dataset.color = d.color;
  el.style.left = pct(x, p.overlay.clientWidth);
  el.style.top = pct(y, p.overlay.clientHeight);

  el.innerHTML = `
    <div class="anno-controls">
      <button class="a-drag" title="Move">⠿</button>
      <button class="a-del" title="Delete">✕</button>
    </div>
    <div class="txt-content" contenteditable="true" spellcheck="false"></div>`;

  const content = el.querySelector(".txt-content");
  content.style.fontSize = `${d.size * state.zoom}px`;
  content.style.color = d.color;

  wireAnno(el, p);
  p.overlay.appendChild(el);
  selectAnno(el);
  content.focus();
}

function wireAnno(el, p) {
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    selectAnno(el);
  });
  el.querySelector(".a-del").addEventListener("click", (e) => {
    e.stopPropagation();
    if (state.selected === el) state.selected = null;
    el.remove();
  });
  const dragHandle = el.querySelector(".a-drag") || el;
  makeDraggable(el, p, dragHandle);
}

function makeDraggable(el, p, handle) {
  handle.addEventListener("pointerdown", (e) => {
    if (e.target.classList.contains("resize-handle")) return;
    if (state.tool !== "edit" && state.tool !== "sign") return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startL = el.offsetLeft;
    const startT = el.offsetTop;
    const move = (ev) => {
      el.style.left = `${startL + ev.clientX - startX}px`;
      el.style.top = `${startT + ev.clientY - startY}px`;
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      el.style.left = pct(el.offsetLeft, p.overlay.clientWidth);
      el.style.top = pct(el.offsetTop, p.overlay.clientHeight);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  });
}

/* --- sidebar controls apply to selection + set defaults --- */

$("fontSize").addEventListener("input", (e) => {
  const v = Math.max(6, Math.min(96, +e.target.value || 14));
  state.textDefaults.size = v;
  const el = state.selected;
  if (el?.classList.contains("txt-anno")) {
    el.dataset.size = v;
    el.querySelector(".txt-content").style.fontSize = `${v * state.zoom}px`;
  }
});

$("fontColor").addEventListener("input", (e) => {
  state.textDefaults.color = e.target.value;
  const el = state.selected;
  if (el?.classList.contains("txt-anno")) {
    el.dataset.color = e.target.value;
    el.querySelector(".txt-content").style.color = e.target.value;
  }
});

$("whiteoutToggle").addEventListener("change", (e) => {
  state.textDefaults.whiteout = e.target.checked;
  const el = state.selected;
  if (el?.classList.contains("txt-anno")) el.classList.toggle("whiteout", e.target.checked);
});

/* ============================== Signatures ============================== */

const sigModal = $("sigModal");
const sigCanvas = $("sigCanvas");
const sigCtx = sigCanvas.getContext("2d");
let sigDrawn = false;
let activeTab = "draw";
let uploadedSig = null; // { url, isJpeg }

function openSigModal() {
  sigModal.classList.remove("hidden");
  clearSigCanvas();
  $("sigText").value = "";
  $("sigTypePreview").textContent = "";
  $("sigUploadPreview").innerHTML = "";
  uploadedSig = null;
}

function clearSigCanvas() {
  sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  sigDrawn = false;
}

$("createSigBtn").addEventListener("click", openSigModal);
$("sigModalClose").addEventListener("click", () => sigModal.classList.add("hidden"));
$("sigClear").addEventListener("click", clearSigCanvas);

document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    activeTab = t.dataset.tab;
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
    document.querySelectorAll(".tab-page").forEach((pg) =>
      pg.classList.toggle("active", pg.id === `tab-${activeTab}`)
    );
  })
);

/* --- draw tab --- */
let drawing = false;
sigCanvas.addEventListener("pointerdown", (e) => {
  drawing = true;
  sigDrawn = true;
  const r = sigCanvas.getBoundingClientRect();
  const sx = sigCanvas.width / r.width;
  const sy = sigCanvas.height / r.height;
  sigCtx.strokeStyle = $("penColor").value;
  sigCtx.lineWidth = 2.4;
  sigCtx.lineCap = "round";
  sigCtx.lineJoin = "round";
  sigCtx.beginPath();
  sigCtx.moveTo((e.clientX - r.left) * sx, (e.clientY - r.top) * sy);
  sigCanvas.setPointerCapture(e.pointerId);
});
sigCanvas.addEventListener("pointermove", (e) => {
  if (!drawing) return;
  const r = sigCanvas.getBoundingClientRect();
  const sx = sigCanvas.width / r.width;
  const sy = sigCanvas.height / r.height;
  sigCtx.lineTo((e.clientX - r.left) * sx, (e.clientY - r.top) * sy);
  sigCtx.stroke();
});
sigCanvas.addEventListener("pointerup", () => (drawing = false));

/* --- type tab --- */
$("sigText").addEventListener("input", (e) => {
  $("sigTypePreview").textContent = e.target.value;
});

/* --- upload tab --- */
$("sigFile").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    uploadedSig = { url: reader.result, isJpeg: f.type === "image/jpeg" };
    $("sigUploadPreview").innerHTML = `<img src="${reader.result}" alt="signature" />`;
  };
  reader.readAsDataURL(f);
});

/* --- build final signature image --- */

function trimCanvas(src) {
  const ctx = src.getContext("2d");
  const { width: w, height: h } = src;
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const pad = 6;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  const out = document.createElement("canvas");
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext("2d").drawImage(src, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

$("sigSave").addEventListener("click", async () => {
  let url = null;
  let isJpeg = false;

  if (activeTab === "draw") {
    if (!sigDrawn) return alert("Draw a signature first.");
    const trimmed = trimCanvas(sigCanvas);
    if (!trimmed) return alert("Draw a signature first.");
    url = trimmed.toDataURL("image/png");
  } else if (activeTab === "type") {
    const text = $("sigText").value.trim();
    if (!text) return alert("Type your name first.");
    const c = document.createElement("canvas");
    c.width = 900;
    c.height = 240;
    const ctx = c.getContext("2d");
    ctx.font = 'italic 96px "Segoe Script", "Brush Script MT", "Comic Sans MS", cursive';
    ctx.fillStyle = "#1a237e";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 20, 130);
    const trimmed = trimCanvas(c);
    if (!trimmed) return alert("Type your name first.");
    url = trimmed.toDataURL("image/png");
  } else {
    if (!uploadedSig) return alert("Choose an image first.");
    url = uploadedSig.url;
    isJpeg = uploadedSig.isJpeg;
  }

  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = url;
  });

  const sig = { id: Date.now(), url, w: img.naturalWidth, h: img.naturalHeight, isJpeg };
  state.sigs.push(sig);
  state.activeSigId = sig.id;
  rebuildSigList();
  sigModal.classList.add("hidden");
  setTool("sign");
});

function rebuildSigList() {
  sigList.innerHTML = "";
  for (const sig of state.sigs) {
    const item = document.createElement("div");
    item.className = "sig-item" + (sig.id === state.activeSigId ? " active" : "");
    item.innerHTML = `<img src="${sig.url}" alt="signature" /><button class="sig-del" title="Remove">✕</button>`;
    item.addEventListener("click", () => {
      state.activeSigId = sig.id;
      rebuildSigList();
    });
    item.querySelector(".sig-del").addEventListener("click", (e) => {
      e.stopPropagation();
      state.sigs = state.sigs.filter((s) => s.id !== sig.id);
      if (state.activeSigId === sig.id) state.activeSigId = state.sigs[0]?.id ?? null;
      rebuildSigList();
    });
    sigList.appendChild(item);
  }
  $("sigHint").textContent = state.sigs.length
    ? "Click on the page to place the highlighted signature. Drag to move, corner handle to resize."
    : "Create a signature, then click on the page where you want to place it.";
}

/* --- place a signature on a page --- */

function placeSignature(p, x, y) {
  const sig = state.sigs.find((s) => s.id === state.activeSigId);
  if (!sig) {
    openSigModal();
    return;
  }
  const ow = p.overlay.clientWidth;
  const oh = p.overlay.clientHeight;
  const wPx = ow * 0.25;
  const hPx = wPx * (sig.h / sig.w);

  const el = document.createElement("div");
  el.className = "anno sig-anno";
  el.dataset.sigId = sig.id;
  el.style.left = pct(Math.max(0, x - wPx / 2), ow);
  el.style.top = pct(Math.max(0, y - hPx / 2), oh);
  el.style.width = pct(wPx, ow);
  el.style.height = pct(hPx, oh);
  el.innerHTML = `
    <div class="anno-controls">
      <button class="a-del" title="Delete">✕</button>
    </div>
    <img src="${sig.url}" alt="signature" />
    <div class="resize-handle"></div>`;

  el.addEventListener("click", (e) => {
    e.stopPropagation();
    selectAnno(el);
  });
  el.querySelector(".a-del").addEventListener("click", (e) => {
    e.stopPropagation();
    if (state.selected === el) state.selected = null;
    el.remove();
  });
  makeDraggable(el, p, el);

  const handle = el.querySelector(".resize-handle");
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = el.offsetWidth;
    const ratio = sig.h / sig.w;
    const move = (ev) => {
      const w = Math.max(30, startW + ev.clientX - startX);
      el.style.width = `${w}px`;
      el.style.height = `${w * ratio}px`;
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      el.style.width = pct(el.offsetWidth, p.overlay.clientWidth);
      el.style.height = pct(el.offsetHeight, p.overlay.clientHeight);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  });

  p.overlay.appendChild(el);
  selectAnno(el);
}

/* ============================== Rearrange pages ============================== */

let dragFromIdx = null;

function rebuildThumbList() {
  thumbList.innerHTML = "";
  state.pages.forEach((p, idx) => {
    const t = document.createElement("div");
    t.className = "thumb" + (p.deleted ? " deleted" : "");
    t.draggable = !p.deleted;
    t.dataset.idx = idx;
    t.innerHTML = `
      <img src="${p.thumbUrl || ""}" alt="page ${idx + 1}" />
      <div class="thumb-bar">
        <span>Page ${idx + 1}</span>
        <span class="thumb-actions">
          <button class="thumb-up" title="Move page up" ${idx === 0 ? "disabled" : ""}>▲</button>
          <button class="thumb-down" title="Move page down" ${idx === state.pages.length - 1 ? "disabled" : ""}>▼</button>
          ${
            p.deleted
              ? `<button class="thumb-restore" title="Restore page">↩ restore</button>`
              : `<button class="thumb-del" title="Remove page">🗑</button>`
          }
        </span>
      </div>`;

    t.addEventListener("dragstart", (e) => {
      dragFromIdx = idx;
      // Firefox refuses to start a drag unless some data is set
      e.dataTransfer.setData("text/plain", String(idx));
      t.classList.add("dragging");
    });
    t.addEventListener("dragend", () => {
      dragFromIdx = null;
      t.classList.remove("dragging");
    });
    t.addEventListener("dragover", (e) => {
      e.preventDefault();
      t.classList.add("drag-over");
    });
    t.addEventListener("dragleave", () => t.classList.remove("drag-over"));
    t.addEventListener("drop", (e) => {
      e.preventDefault();
      t.classList.remove("drag-over");
      const from = dragFromIdx ?? parseInt(e.dataTransfer.getData("text/plain"), 10);
      dragFromIdx = null;
      const to = idx;
      if (Number.isNaN(from) || from === to) return;
      const [moved] = state.pages.splice(from, 1);
      state.pages.splice(to, 0, moved);
      reorderViewer();
      rebuildThumbList();
    });

    const movePage = (to) => {
      if (to < 0 || to >= state.pages.length) return;
      const [moved] = state.pages.splice(idx, 1);
      state.pages.splice(to, 0, moved);
      reorderViewer();
      rebuildThumbList();
    };
    t.querySelector(".thumb-up").addEventListener("click", () => movePage(idx - 1));
    t.querySelector(".thumb-down").addEventListener("click", () => movePage(idx + 1));

    const delBtn = t.querySelector(".thumb-del");
    if (delBtn)
      delBtn.addEventListener("click", () => {
        const visible = state.pages.filter((pg) => !pg.deleted).length;
        if (visible <= 1) return alert("A PDF needs at least one page.");
        p.deleted = true;
        p.wrapper.style.display = "none";
        rebuildThumbList();
        updatePageIndicator();
      });

    const restoreBtn = t.querySelector(".thumb-restore");
    if (restoreBtn)
      restoreBtn.addEventListener("click", () => {
        p.deleted = false;
        p.wrapper.style.display = "";
        rebuildThumbList();
        renderPage(p);
        updatePageIndicator();
      });

    thumbList.appendChild(t);
  });
}

function reorderViewer() {
  for (const p of state.pages) viewer.appendChild(p.wrapper);
  updatePageIndicator();
}

/* ============================== Toolbar ============================== */

function visiblePages() {
  return state.pages.filter((p) => !p.deleted);
}

function currentPageIndex() {
  const pages = visiblePages();
  const top = viewerWrap.scrollTop + 80;
  for (let i = 0; i < pages.length; i++) {
    const w = pages[i].wrapper;
    if (w.offsetTop + w.offsetHeight > top) return i;
  }
  return Math.max(0, pages.length - 1);
}

function updatePageIndicator() {
  const pages = visiblePages();
  if (!pages.length) {
    $("pageIndicator").textContent = "– / –";
    return;
  }
  $("pageIndicator").textContent = `${currentPageIndex() + 1} / ${pages.length}`;
}

viewerWrap.addEventListener("scroll", updatePageIndicator);

$("prevPage").addEventListener("click", () => scrollToPage(currentPageIndex() - 1));
$("nextPage").addEventListener("click", () => scrollToPage(currentPageIndex() + 1));

function scrollToPage(i) {
  const pages = visiblePages();
  if (i < 0 || i >= pages.length) return;
  viewerWrap.scrollTo({ top: pages[i].wrapper.offsetTop - 20, behavior: "smooth" });
}

function setZoom(z) {
  state.zoom = Math.min(3, Math.max(0.4, z));
  $("zoomLevel").textContent = `${Math.round(state.zoom * 100)}%`;
  rerenderAll();
}

$("zoomIn").addEventListener("click", () => setZoom(state.zoom + 0.15));
$("zoomOut").addEventListener("click", () => setZoom(state.zoom - 0.15));
$("fitWidth").addEventListener("click", () => {
  const first = visiblePages()[0];
  if (!first) return;
  const vp1 = first.pdfPage.getViewport({ scale: 1 });
  setZoom((viewerWrap.clientWidth - 80) / vp1.width);
});

/* ============================== Open / drop ============================== */

$("openBtn").addEventListener("click", () => fileInput.click());
$("dropOpenBtn").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
  if (e.target.files[0]) openFile(e.target.files[0]);
  e.target.value = "";
});

["dragenter", "dragover"].forEach((ev) =>
  viewerWrap.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add("drag");
  })
);
["dragleave", "drop"].forEach((ev) =>
  viewerWrap.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag");
  })
);
viewerWrap.addEventListener("drop", (e) => {
  const f = e.dataTransfer.files[0];
  if (f) openFile(f);
});

/* ============================== Save / download ============================== */

function hexToRgb01(hex) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function sanitizeForFont(font, size, text) {
  try {
    font.widthOfTextAtSize(text.replace(/\n/g, " "), size);
    return text;
  } catch {
    return text.replace(/[^\x20-\x7E\n\xA0-\xFF]/g, "?");
  }
}

$("downloadBtn").addEventListener("click", async () => {
  const btn = $("downloadBtn");
  btn.disabled = true;
  btn.textContent = "⏳ Saving…";
  try {
    await savePdf();
  } catch (err) {
    console.error(err);
    alert(`Could not save the PDF: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "💾 Download PDF";
  }
});

async function savePdf() {
  const src = await PDFDocument.load(state.origBytes);
  const out = await PDFDocument.create();
  const kept = visiblePages();
  const copied = await out.copyPages(src, kept.map((p) => p.srcIndex));
  const font = await out.embedFont(StandardFonts.Helvetica);
  const sigImages = new Map();

  for (let i = 0; i < copied.length; i++) {
    const page = copied[i];
    out.addPage(page);
    const meta = kept[i];
    const { width: pw, height: ph } = page.getSize();
    const ow = meta.overlay.clientWidth;
    const oh = meta.overlay.clientHeight;
    if (!ow || !oh) continue;

    // whiteout rectangles go underneath everything else
    for (const el of meta.overlay.querySelectorAll(".txt-anno.whiteout")) {
      const fx = el.offsetLeft / ow;
      const fy = el.offsetTop / oh;
      const fw = el.offsetWidth / ow;
      const fh = el.offsetHeight / oh;
      page.drawRectangle({
        x: fx * pw - 1,
        y: ph - (fy + fh) * ph - 1,
        width: fw * pw + 2,
        height: fh * ph + 2,
        color: rgb(1, 1, 1),
      });
    }

    for (const el of meta.overlay.querySelectorAll(".txt-anno")) {
      const raw = el.querySelector(".txt-content").innerText.replace(/ /g, " ");
      const text = raw.replace(/\n+$/, "");
      if (!text.trim()) continue;
      const size = parseFloat(el.dataset.size);
      const fx = el.offsetLeft / ow;
      const fy = el.offsetTop / oh;
      const safe = sanitizeForFont(font, size, text);
      page.drawText(safe, {
        x: fx * pw + 2,
        y: ph - fy * ph - size * 1.02,
        size,
        font,
        color: hexToRgb01(el.dataset.color),
        lineHeight: size * 1.25,
      });
    }

    for (const el of meta.overlay.querySelectorAll(".sig-anno")) {
      const sig = state.sigs.find((s) => s.id === +el.dataset.sigId);
      const url = sig ? sig.url : el.querySelector("img").src;
      const isJpeg = sig ? sig.isJpeg : url.startsWith("data:image/jpeg");
      let img = sigImages.get(url);
      if (!img) {
        img = isJpeg ? await out.embedJpg(url) : await out.embedPng(url);
        sigImages.set(url, img);
      }
      const fx = el.offsetLeft / ow;
      const fy = el.offsetTop / oh;
      const fw = el.offsetWidth / ow;
      const fh = el.offsetHeight / oh;
      page.drawImage(img, {
        x: fx * pw,
        y: ph - (fy + fh) * ph,
        width: fw * pw,
        height: fh * ph,
      });
    }
  }

  const bytes = await out.save();
  const name = `${(state.fileName || "document").replace(/\.pdf$/i, "")}-edited.pdf`;

  // Inside the Android app the WebView cannot download blob: URLs, so the
  // bytes are handed to the native side, which saves them via the system
  // file picker (Storage Access Framework).
  if (window.AndroidBridge?.savePdf) {
    window.AndroidBridge.savePdf(name, uint8ToBase64(bytes));
    return;
  }

  const blob = new Blob([bytes], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function uint8ToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/* ============================== Mobile sidebar drawer ============================== */

const scrim = document.createElement("div");
scrim.id = "sidebarScrim";
document.body.appendChild(scrim);

function setSidebar(open) {
  $("sidebar").classList.toggle("open", open);
  document.body.classList.toggle("sidebar-open", open);
}

$("menuToggle").addEventListener("click", () =>
  setSidebar(!$("sidebar").classList.contains("open"))
);
scrim.addEventListener("click", () => setSidebar(false));

// picking a page-interaction tool on a phone closes the drawer so the page is
// visible; Rearrange keeps it open because its thumbnails live in the sidebar
document.querySelectorAll(".tool-btn").forEach((b) =>
  b.addEventListener("click", () => {
    if (b.dataset.tool !== "arrange" && window.matchMedia("(max-width: 820px)").matches) {
      setSidebar(false);
    }
  })
);

/* ============================== Init ============================== */

setTool("view");
