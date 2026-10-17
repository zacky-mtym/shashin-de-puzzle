(() => {
  const COLS = 6;
  const ROWS = 4;

  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const play = document.getElementById("play");
  const clearEl = document.getElementById("clear");
  const messageEl = document.getElementById("message");
  const restartBtn = document.getElementById("restart");
  const timerEl = document.getElementById("timer");

  let img = null;
  let pieces = [];
  let tabsH = [];
  let tabsV = [];
  let boardX = 0;
  let boardY = 8;
  let boardW = 640;
  let boardH = 480;
  let cellW = 1;
  let cellH = 1;
  let pad = 1;
  let cssW = 640;
  let cssH = 800;
  let solved = false;
  let spinId = 0;
  let spinning = false;
  let drag = null;
  let timerStart = 0;
  let timerId = 0;
  let timerRunning = false;
  let lastSize = "";

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
    const elapsed = performance.now() - timerStart;
    timerRunning = false;
    clearInterval(timerId);
    timerId = 0;
    renderTimer(elapsed);
    timerEl.classList.add("is-stopped");
  }

  function showMessage(text) {
    messageEl.hidden = false;
    messageEl.textContent = text;
  }

  function hideMessage() {
    messageEl.hidden = true;
    messageEl.textContent = "";
  }

  function randTab() {
    return Math.random() < 0.5 ? 1 : -1;
  }

  function makeTabs() {
    tabsH = Array.from({ length: ROWS }, () => (
      Array.from({ length: COLS - 1 }, () => randTab())
    ));
    tabsV = Array.from({ length: ROWS - 1 }, () => (
      Array.from({ length: COLS }, () => randTab())
    ));
  }

  function edgeOf(col, row) {
    return {
      top: row === 0 ? 0 : -tabsV[row - 1][col],
      right: col === COLS - 1 ? 0 : tabsH[row][col],
      bottom: row === ROWS - 1 ? 0 : tabsV[row][col],
      left: col === 0 ? 0 : -tabsH[row][col - 1],
    };
  }

  function traceEdge(context, x1, y1, x2, y2, tab) {
    if (tab === 0) {
      context.lineTo(x2, y2);
      return;
    }
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const nx = dy / len;
    const ny = -dx / len;
    const bulge = len * 0.2 * tab;
    const along = (t) => [x1 + ux * len * t, y1 + uy * len * t];
    const [ax, ay] = along(0.36);
    const [mx, my] = along(0.5);
    const [bx, by] = along(0.64);
    context.lineTo(ax, ay);
    context.bezierCurveTo(
      ax + nx * bulge * 0.15,
      ay + ny * bulge * 0.15,
      mx - ux * len * 0.08 + nx * bulge,
      my - uy * len * 0.08 + ny * bulge,
      mx + nx * bulge,
      my + ny * bulge
    );
    context.bezierCurveTo(
      mx + ux * len * 0.08 + nx * bulge,
      my + uy * len * 0.08 + ny * bulge,
      bx + nx * bulge * 0.15,
      by + ny * bulge * 0.15,
      bx,
      by
    );
    context.lineTo(x2, y2);
  }

  function piecePath(context, edges) {
    const x = pad;
    const y = pad;
    context.beginPath();
    context.moveTo(x, y);
    traceEdge(context, x, y, x + cellW, y, edges.top);
    traceEdge(context, x + cellW, y, x + cellW, y + cellH, edges.right);
    traceEdge(context, x + cellW, y + cellH, x, y + cellH, edges.bottom);
    traceEdge(context, x, y + cellH, x, y, edges.left);
    context.closePath();
  }

  function homeOf(piece) {
    return {
      x: boardX + (piece.col + 0.5) * cellW,
      y: boardY + (piece.row + 0.5) * cellH,
    };
  }

  function layout() {
    const maxW = Math.min(860, Math.max(280, window.innerWidth - 32));
    const maxBoardH = Math.max(220, window.innerHeight - 340);
    boardW = maxW;
    boardH = boardW * img.naturalHeight / img.naturalWidth;
    if (boardH > maxBoardH) {
      boardH = maxBoardH;
      boardW = boardH * img.naturalWidth / img.naturalHeight;
    }
    boardW = Math.round(boardW);
    boardH = Math.round(boardH);
    cellW = boardW / COLS;
    cellH = boardH / ROWS;
    pad = Math.max(cellW, cellH) * 0.28;
    cssW = Math.ceil(boardW + pad * 2 + 16);
    boardX = (cssW - boardW) / 2;
    boardY = 8;
    cssH = Math.ceil(solved ? boardY + boardH + 12 : trayLayout().bottom);

    const dpr = window.devicePixelRatio || 1;
    const key = `${cssW}x${cssH}@${dpr}`;
    play.style.width = `${cssW}px`;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    if (key !== lastSize) {
      lastSize = key;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
    }
    placeClear();
  }

  function trayLayout() {
    const perRow = 8;
    const rows = Math.ceil((COLS * ROWS) / perRow);
    const rowGap = (cellH + pad) * 0.72;
    const firstCenter = boardY + boardH + 16 + cellH / 2 + pad;
    const lastCenter = firstCenter + (rows - 1) * rowGap;
    return {
      perRow,
      rowGap,
      firstCenter,
      bottom: lastCenter + cellH / 2 + pad + 12,
    };
  }

  function placeClear() {
    clearEl.style.left = `${boardX}px`;
    clearEl.style.width = `${boardW}px`;
    clearEl.style.top = `${boardY + boardH * 0.62}px`;
    clearEl.style.height = `${boardH * 0.38}px`;
  }

  function buildPieceCanvas(piece) {
    const dpr = window.devicePixelRatio || 1;
    const bitmapW = Math.ceil((cellW + pad * 2) * dpr);
    const bitmapH = Math.ceil((cellH + pad * 2) * dpr);
    const bitmap = document.createElement("canvas");
    bitmap.width = bitmapW;
    bitmap.height = bitmapH;
    const btx = bitmap.getContext("2d");
    btx.setTransform(dpr, 0, 0, dpr, 0, 0);
    btx.imageSmoothingEnabled = true;
    btx.imageSmoothingQuality = "high";
    const edges = edgeOf(piece.col, piece.row);
    piecePath(btx, edges);
    btx.save();
    btx.clip();
    btx.drawImage(
      img,
      pad - piece.col * cellW,
      pad - piece.row * cellH,
      boardW,
      boardH
    );
    btx.restore();
    piecePath(btx, edges);
    btx.strokeStyle = "rgba(42,33,28,0.72)";
    btx.lineWidth = 1.4;
    btx.stroke();
    piece.bitmap = bitmap;
    piece.cssW = cellW + pad * 2;
    piece.cssH = cellH + pad * 2;
  }

  function ensurePieces() {
    if (pieces.length === COLS * ROWS) return;
    pieces = [];
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        pieces.push({ col, row, x: 0, y: 0, turns: 0, spin: 0, locked: false });
      }
    }
  }

  function buildBitmaps() {
    ensurePieces();
    pieces.forEach(buildPieceCanvas);
  }

  function scatter() {
    const order = pieces.map((_, index) => index);
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const tray = trayLayout();
    order.forEach((pieceIndex, slot) => {
      const piece = pieces[pieceIndex];
      const col = slot % tray.perRow;
      const row = Math.floor(slot / tray.perRow);
      const slotW = boardW / tray.perRow;
      piece.locked = false;
      piece.turns = Math.floor(Math.random() * 4);
      piece.spin = 0;
      piece.x = boardX + slotW * (col + 0.5) + (Math.random() - 0.5) * 8;
      piece.y = tray.firstCenter + row * tray.rowGap + (Math.random() - 0.5) * 6;
    });
  }

  function drawPiece(piece, emphasized) {
    const angle = (piece.turns + piece.spin) * Math.PI / 2;
    ctx.save();
    ctx.translate(piece.x, piece.y);
    ctx.rotate(angle);
    ctx.shadowColor = emphasized ? "rgba(201,132,42,0.55)" : "rgba(40,24,12,0.25)";
    ctx.shadowBlur = emphasized ? 16 : 8;
    ctx.shadowOffsetY = piece.locked ? 0 : 3;
    ctx.drawImage(
      piece.bitmap,
      -piece.cssW / 2,
      -piece.cssH / 2,
      piece.cssW,
      piece.cssH
    );
    ctx.restore();
  }

  function drawBoard() {
    ctx.fillStyle = "#e4d8c8";
    ctx.beginPath();
    ctx.roundRect(boardX, boardY, boardW, boardH, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(42,33,28,0.28)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function draw() {
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = "#f7f1e8";
    ctx.fillRect(0, 0, cssW, cssH);
    drawBoard();
    if (solved) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(boardX, boardY, boardW, boardH, 8);
      ctx.clip();
      ctx.drawImage(img, boardX, boardY, boardW, boardH);
      ctx.restore();
      return;
    }
    pieces.filter((piece) => piece.locked).forEach((piece) => drawPiece(piece, false));
    pieces.filter((piece) => !piece.locked).forEach((piece) => {
      drawPiece(piece, drag && drag.piece === piece);
    });
  }

  function pointOf(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (cssW / rect.width),
      y: (event.clientY - rect.top) * (cssH / rect.height),
    };
  }

  function hits(piece, x, y) {
    if (!piece.bitmap) return false;
    const dx = x - piece.x;
    const dy = y - piece.y;
    const angle = -(piece.turns + piece.spin) * Math.PI / 2;
    const lx = dx * Math.cos(angle) - dy * Math.sin(angle);
    const ly = dx * Math.sin(angle) + dy * Math.cos(angle);
    const px = Math.floor((lx + piece.cssW / 2) * (piece.bitmap.width / piece.cssW));
    const py = Math.floor((ly + piece.cssH / 2) * (piece.bitmap.height / piece.cssH));
    if (px < 0 || py < 0 || px >= piece.bitmap.width || py >= piece.bitmap.height) return false;
    const sample = piece.bitmap.getContext("2d").getImageData(px, py, 1, 1).data;
    return sample[3] > 24;
  }

  function topPieceAt(x, y) {
    for (let i = pieces.length - 1; i >= 0; i -= 1) {
      const piece = pieces[i];
      if (piece.locked) continue;
      if (hits(piece, x, y)) return piece;
    }
    return null;
  }

  function bringToFront(piece) {
    const index = pieces.indexOf(piece);
    if (index >= 0) {
      pieces.splice(index, 1);
      pieces.push(piece);
    }
  }

  function trySnap(piece) {
    if (piece.locked || piece.turns % 4 !== 0) return false;
    const home = homeOf(piece);
    const near = Math.hypot(piece.x - home.x, piece.y - home.y) < Math.min(cellW, cellH) * 0.42;
    if (!near) return false;
    piece.x = home.x;
    piece.y = home.y;
    piece.turns = 0;
    piece.spin = 0;
    piece.locked = true;
    return true;
  }

  function allLocked() {
    return pieces.every((piece) => piece.locked);
  }

  function finishIfSolved() {
    if (solved || spinning) return;
    if (allLocked()) beginClear();
  }

  function beginClear() {
    stopTimer();
    solved = true;
    clearEl.hidden = false;
    lastSize = "";
    layout();
    draw();
  }

  function animateRotate(piece) {
    spinning = true;
    const from = piece.turns;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 140);
      piece.spin = 1 - (1 - t) * (1 - t);
      piece.turns = from;
      draw();
      if (t < 1) {
        spinId = requestAnimationFrame(step);
        return;
      }
      piece.turns = (from + 1) % 4;
      piece.spin = 0;
      spinning = false;
      trySnap(piece);
      draw();
      finishIfSolved();
    };
    spinId = requestAnimationFrame(step);
  }

  function onDown(event) {
    if (solved || spinning) return;
    const point = pointOf(event);
    const piece = topPieceAt(point.x, point.y);
    if (!piece) return;
    event.preventDefault();
    bringToFront(piece);
    drag = {
      piece,
      dx: point.x - piece.x,
      dy: point.y - piece.y,
      moved: false,
      sx: point.x,
      sy: point.y,
    };
    canvas.classList.add("is-dragging");
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (error) {
      // Synthetic or already-released pointers can refuse capture.
    }
    draw();
  }

  function onMove(event) {
    if (!drag) return;
    const point = pointOf(event);
    if (Math.hypot(point.x - drag.sx, point.y - drag.sy) > 6) drag.moved = true;
    drag.piece.x = Math.min(cssW - 16, Math.max(16, point.x - drag.dx));
    drag.piece.y = Math.min(cssH - 16, Math.max(16, point.y - drag.dy));
    draw();
  }

  function onUp() {
    if (!drag) return;
    const { piece, moved } = drag;
    drag = null;
    canvas.classList.remove("is-dragging");
    if (!moved) {
      animateRotate(piece);
      return;
    }
    trySnap(piece);
    draw();
    finishIfSolved();
  }

  function startRound() {
    if (spinId) cancelAnimationFrame(spinId);
    spinning = false;
    drag = null;
    solved = false;
    clearEl.hidden = true;
    canvas.classList.remove("is-dragging");
    resetTimer();
    lastSize = "";
    layout();
    makeTabs();
    buildBitmaps();
    scatter();
    startTimer();
    draw();
  }

  function onResize() {
    if (!img || !pieces.length) return;
    const old = { boardX, boardY, boardW, boardH };
    lastSize = "";
    layout();
    buildBitmaps();
    pieces.forEach((piece) => {
      if (piece.locked) {
        const home = homeOf(piece);
        piece.x = home.x;
        piece.y = home.y;
        return;
      }
      piece.x = boardX + (piece.x - old.boardX) * (boardW / old.boardW);
      piece.y = boardY + (piece.y - old.boardY) * (boardH / old.boardH);
    });
    draw();
  }

  function init() {
    restartBtn.addEventListener("click", () => {
      if (!img) return;
      startRound();
    });
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    window.addEventListener("resize", onResize);

    showMessage("読み込み中");
    const next = new Image();
    next.onload = () => {
      img = next;
      hideMessage();
      restartBtn.disabled = false;
      layout();
      startRound();
    };
    next.onerror = () => {
      showMessage("写真を読み込めませんでした。");
    };
    next.src = "photo03yakitori.jpg";
  }

  init();
})();
