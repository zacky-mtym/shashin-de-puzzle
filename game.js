(() => {
  const ROWS = 8;
  const COLS = 8;
  const PHOTOS = window.PHOTOS || [];

  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const clearEl = document.getElementById("clear");
  const messageEl = document.getElementById("message");
  const restartBtn = document.getElementById("restart");
  const photoSelect = document.getElementById("photo");
  const photoField = document.getElementById("photo-field");
  const sideMove = document.getElementById("side-move");
  const sideShift = document.getElementById("side-shift");
  const boardCol = document.getElementById("board-col");
  const mobileControls = document.getElementById("mobile-controls");
  const timerEl = document.getElementById("timer");

  let img = null;
  let imageReady = false;
  let order = [];
  let shift = [];
  let selected = 0;
  let solved = false;
  let animating = false;
  let frameId = 0;
  let cssW = 640;
  let cssH = 480;
  let lastSize = "";
  let timerStart = 0;
  let timerId = 0;
  let timerRunning = false;

  function mod(n, m) {
    return ((n % m) + m) % m;
  }

  function reducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function showMessage(text) {
    messageEl.hidden = false;
    messageEl.textContent = text;
  }

  function hideMessage() {
    messageEl.hidden = true;
    messageEl.textContent = "";
  }

  function hideBanner() {
    clearEl.hidden = true;
  }

  function showBanner() {
    clearEl.hidden = false;
  }

  function formatTime(ms) {
    const totalTenths = Math.floor(Math.max(0, ms) / 100);
    const tenths = totalTenths % 10;
    const totalSeconds = Math.floor(totalTenths / 10);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60);
    return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
  }

  function renderTimer(ms) {
    timerEl.textContent = formatTime(ms);
  }

  function resetTimer() {
    clearInterval(timerId);
    timerId = 0;
    timerRunning = false;
    timerEl.classList.remove("is-stopped");
    renderTimer(0);
  }

  function startTimer() {
    resetTimer();
    timerStart = performance.now();
    timerRunning = true;
    timerId = setInterval(() => {
      renderTimer(performance.now() - timerStart);
    }, 100);
  }

  function stopTimer() {
    if (!timerRunning) return;
    timerRunning = false;
    clearInterval(timerId);
    timerId = 0;
    renderTimer(performance.now() - timerStart);
    timerEl.classList.add("is-stopped");
  }

  function cancelAnim() {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    animating = false;
  }

  function inputLocked() {
    return animating || solved || !imageReady;
  }

  function isSolved() {
    for (let i = 0; i < ROWS; i += 1) {
      if (order[i] !== i || shift[i] !== 0) return false;
    }
    return true;
  }

  function shuffleOrder() {
    const next = Array.from({ length: ROWS }, (_, i) => i);
    for (let i = ROWS - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
  }

  function displaced(list) {
    return list.reduce((count, source, index) => count + (source === index ? 0 : 1), 0);
  }

  function scramble() {
    let guard = 0;
    do {
      order = shuffleOrder();
      guard += 1;
    } while (displaced(order) < ROWS / 2 && guard < 40);

    shift = Array.from({ length: ROWS }, () => 1 + Math.floor(Math.random() * (COLS - 1)));
    selected = 0;
    solved = false;
  }

  function setupPicker() {
    photoSelect.replaceChildren();
    PHOTOS.forEach((photo, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = photo.title;
      photoSelect.append(option);
    });
    photoField.hidden = PHOTOS.length < 2;
  }

  function makePair(slot, buttons) {
    const pair = document.createElement("div");
    pair.className = "pair";
    pair.dataset.slot = String(slot);
    buttons.forEach(([act, label, aria]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.slot = String(slot);
      button.dataset.act = act;
      button.textContent = label;
      button.setAttribute("aria-label", aria);
      pair.append(button);
    });
    return pair;
  }

  function buildControls() {
    sideMove.replaceChildren();
    sideShift.replaceChildren();
    for (let i = 0; i < ROWS; i += 1) {
      const n = i + 1;
      sideMove.append(makePair(i, [
        ["up", "↑", `${n}番目の帯を上と入れ替える`],
        ["down", "↓", `${n}番目の帯を下と入れ替える`],
      ]));
      sideShift.append(makePair(i, [
        ["left", "←", `${n}番目の帯を左へずらす`],
        ["right", "→", `${n}番目の帯を右へずらす`],
      ]));
    }
    syncButtons();
    updateSelection();
  }

  function syncButtons() {
    document.querySelectorAll(".pair button, .mobile-controls button").forEach((button) => {
      const slot = button.dataset.slot === undefined ? selected : Number(button.dataset.slot);
      const act = button.dataset.act;
      let disabled = inputLocked();
      if (act === "up" && slot === 0) disabled = true;
      if (act === "down" && slot === ROWS - 1) disabled = true;
      button.disabled = disabled;
    });
  }

  function updateSelection() {
    document.querySelectorAll(".pair").forEach((pair) => {
      pair.classList.toggle("is-selected", !solved && Number(pair.dataset.slot) === selected);
    });
  }

  function layout() {
    if (!img) return;
    const avail = boardCol.clientWidth;
    if (avail < COLS) return;

    const header = document.querySelector("header");
    const maxH = Math.max(ROWS * 16, window.innerHeight - header.offsetHeight - 150);
    let w = avail - (avail % COLS);
    let h = Math.round(w * img.naturalHeight / img.naturalWidth);
    h -= h % ROWS;
    if (h > maxH) {
      h = maxH - (maxH % ROWS);
      w = Math.round(h * img.naturalWidth / img.naturalHeight);
      w -= w % COLS;
      w = Math.max(COLS, w);
      h = Math.round(w * img.naturalHeight / img.naturalWidth);
      h -= h % ROWS;
      h = Math.max(ROWS, h);
    }

    const dpr = window.devicePixelRatio || 1;
    const key = `${w}x${h}@${dpr}`;
    cssW = w;
    cssH = h;
    sideMove.style.height = `${h}px`;
    sideShift.style.height = `${h}px`;
    if (key === lastSize) return;
    lastSize = key;

    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    redraw();
  }

  function bandOf(sourceRow) {
    const y0 = Math.round(sourceRow * img.naturalHeight / ROWS);
    const y1 = Math.round((sourceRow + 1) * img.naturalHeight / ROWS);
    return { sy: y0, sh: Math.max(1, y1 - y0) };
  }

  function drawBand(sourceRow, shiftCols, y, h) {
    const { sy, sh } = bandOf(sourceRow);
    const width = img.naturalWidth;
    let shiftPx = shiftCols * (cssW / COLS);
    shiftPx = mod(shiftPx, cssW);
    if (shiftPx < 0.5 || cssW - shiftPx < 0.5) {
      ctx.drawImage(img, 0, sy, width, sh, 0, y, cssW, h);
      return;
    }
    const srcOffset = (shiftPx / cssW) * width;
    ctx.drawImage(img, 0, sy, width - srcOffset, sh, shiftPx, y, cssW - shiftPx, h);
    ctx.drawImage(img, width - srcOffset, sy, srcOffset, sh, 0, y, shiftPx, h);
  }

  function rowTop(slot, anim) {
    const rowH = cssH / ROWS;
    if (anim && anim.type === "swap") {
      if (slot === anim.slot) return slot * rowH + anim.dir * rowH * anim.t;
      if (slot === anim.other) return slot * rowH - anim.dir * rowH * anim.t;
    }
    return slot * rowH;
  }

  function shiftOf(slot, anim) {
    if (anim && anim.type === "shift" && anim.slot === slot) {
      return anim.base + anim.dir * anim.t;
    }
    return shift[slot];
  }

  function paintRow(slot, anim) {
    const rowH = cssH / ROWS;
    const y = rowTop(slot, anim);
    drawBand(order[slot], shiftOf(slot, anim), y, rowH);
    if (solved || slot !== selected) return;
    ctx.strokeStyle = "rgba(28, 18, 12, 0.85)";
    ctx.lineWidth = 6;
    ctx.strokeRect(3, y + 3, cssW - 6, rowH - 6);
    ctx.strokeStyle = "#ffd36a";
    ctx.lineWidth = 3;
    ctx.strokeRect(3, y + 3, cssW - 6, rowH - 6);
  }

  function draw(seamAlpha = 1, anim = null) {
    if (!img) return;
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cssW, cssH);
    ctx.clip();

    const moving = new Set();
    if (anim && anim.type === "swap") {
      moving.add(anim.slot);
      moving.add(anim.other);
    }
    for (let i = 0; i < ROWS; i += 1) {
      if (!moving.has(i)) paintRow(i, anim);
    }
    moving.forEach((slot) => paintRow(slot, anim));

    if (seamAlpha > 0 && !(anim && anim.type === "swap")) {
      ctx.globalAlpha = seamAlpha;
      ctx.fillStyle = "rgba(28, 18, 12, 0.78)";
      const rowH = cssH / ROWS;
      for (let i = 1; i < ROWS; i += 1) {
        ctx.fillRect(0, i * rowH - 1, cssW, 2);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawFull() {
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, cssW, cssH);
  }

  function redraw() {
    if (solved && !animating) drawFull();
    else draw();
  }

  function beginClear() {
    stopTimer();
    solved = true;
    animating = true;
    syncButtons();
    updateSelection();
    if (reducedMotion()) {
      animating = false;
      drawFull();
      showBanner();
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 420);
      draw(1 - t);
      if (t < 1) {
        frameId = requestAnimationFrame(step);
        return;
      }
      animating = false;
      drawFull();
      showBanner();
    };
    frameId = requestAnimationFrame(step);
  }

  function afterMove() {
    updateSelection();
    syncButtons();
    draw();
    if (isSolved()) beginClear();
  }

  function exchange(a, b) {
    [order[a], order[b]] = [order[b], order[a]];
    [shift[a], shift[b]] = [shift[b], shift[a]];
  }

  function slide(slot, dir) {
    if (reducedMotion()) {
      shift[slot] = mod(shift[slot] + dir, COLS);
      afterMove();
      return;
    }
    animating = true;
    syncButtons();
    const base = shift[slot];
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 150);
      const eased = 1 - (1 - t) * (1 - t);
      draw(1, { type: "shift", slot, base, dir, t: eased });
      if (t < 1) {
        frameId = requestAnimationFrame(step);
        return;
      }
      shift[slot] = mod(base + dir, COLS);
      animating = false;
      afterMove();
    };
    frameId = requestAnimationFrame(step);
  }

  function swapRows(slot, dir) {
    const other = slot + dir;
    if (other < 0 || other >= ROWS) return;
    if (reducedMotion()) {
      exchange(slot, other);
      selected = other;
      afterMove();
      return;
    }
    animating = true;
    syncButtons();
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 180);
      const eased = 1 - (1 - t) * (1 - t);
      draw(1, { type: "swap", slot, other, dir, t: eased });
      if (t < 1) {
        frameId = requestAnimationFrame(step);
        return;
      }
      exchange(slot, other);
      selected = other;
      animating = false;
      afterMove();
    };
    frameId = requestAnimationFrame(step);
  }

  function actOn(slot, act) {
    if (inputLocked()) return;
    if (act === "left") slide(slot, -1);
    else if (act === "right") slide(slot, 1);
    else if (act === "up") swapRows(slot, -1);
    else if (act === "down") swapRows(slot, 1);
  }

  function onControlClick(event) {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    selected = Number(button.dataset.slot);
    actOn(selected, button.dataset.act);
  }

  function onCanvasClick(event) {
    if (!imageReady || solved) return;
    const rect = canvas.getBoundingClientRect();
    const y = event.clientY - rect.top;
    selected = Math.min(ROWS - 1, Math.max(0, Math.floor(y / (rect.height / ROWS))));
    updateSelection();
    syncButtons();
    draw();
  }

  function onMobileClick(event) {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    actOn(selected, button.dataset.act);
  }

  function onKey(event) {
    const acts = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
    };
    const act = acts[event.key];
    if (!act || event.repeat) return;
    if (event.target === photoSelect) return;
    event.preventDefault();
    actOn(selected, act);
  }

  function onRestart() {
    if (!imageReady) return;
    cancelAnim();
    hideBanner();
    scramble();
    startTimer();
    syncButtons();
    updateSelection();
    draw();
  }

  function loadPhoto(index) {
    const photo = PHOTOS[index];
    if (!photo) return;
    cancelAnim();
    solved = false;
    imageReady = false;
    hideBanner();
    resetTimer();
    syncButtons();
    restartBtn.disabled = true;
    showMessage("読み込み中");
    photoSelect.value = String(index);

    const next = new Image();
    next.onload = () => {
      img = next;
      imageReady = true;
      hideMessage();
      restartBtn.disabled = false;
      scramble();
      startTimer();
      syncButtons();
      updateSelection();
      lastSize = "";
      layout();
      requestAnimationFrame(layout);
    };
    next.onerror = () => {
      imageReady = false;
      showMessage("写真を読み込めませんでした。ファイル名を確認してください。");
    };
    next.src = photo.src;
  }

  function init() {
    if (!PHOTOS.length) {
      showMessage("写真が登録されていません。photos.js を確認してください。");
      return;
    }
    setupPicker();
    buildControls();
    restartBtn.addEventListener("click", onRestart);
    photoSelect.addEventListener("change", () => loadPhoto(Number(photoSelect.value)));
    sideMove.addEventListener("click", onControlClick);
    sideShift.addEventListener("click", onControlClick);
    mobileControls.addEventListener("click", onMobileClick);
    canvas.addEventListener("click", onCanvasClick);
    document.addEventListener("keydown", onKey);
    new ResizeObserver(() => layout()).observe(document.getElementById("stage"));
    window.addEventListener("resize", () => {
      lastSize = "";
      layout();
    });
    loadPhoto(0);
  }

  init();
})();
