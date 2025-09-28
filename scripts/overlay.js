import {
  clamp,
  composeManualTransform,
  computeAlignedViews,
  solveSimilarity
} from './alignment-math.js';

const STATE_KEY = 'faceguide_overlay_state_v1';
const MANUAL_KEY = 'faceguide_overlay_manual_adjust_v1';

const canvas = document.getElementById('overlayCanvas');
const ctx = canvas.getContext('2d');
const wrap = document.getElementById('canvasWrap');
const opacitySlider = document.getElementById('opacity');
const opacityVal = document.getElementById('opacityVal');
const showPointsChk = document.getElementById('showPoints');
const statusEl = document.getElementById('status');
const startBtn = document.getElementById('startCapture');
const stopBtn = document.getElementById('stopCapture');
const freezeBtn = document.getElementById('freezeCapture');
const captureVideo = document.getElementById('captureVideo');
const offsetXSlider = document.getElementById('offsetX');
const offsetYSlider = document.getElementById('offsetY');
const scaleSlider = document.getElementById('scale');
const rotationSlider = document.getElementById('rotation');
const offsetXVal = document.getElementById('offsetXVal');
const offsetYVal = document.getElementById('offsetYVal');
const scaleVal = document.getElementById('scaleVal');
const rotationVal = document.getElementById('rotationVal');
const resetAdjustBtn = document.getElementById('resetAdjust');

const refImg = new Image();
const baseImg = new Image();
let refReady = false;
let baseReady = false;
let overlayOpacity = 0.5;
let showPoints = true;
let viewA = null;
let viewB = null;
let pointsA = {};
let pointsB = {};
let controlIds = ['left_pupil', 'right_pupil', 'nose_tip'];
let stateLoaded = false;

const manualDefaults = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };
const manualAdjust = { ...manualDefaults };

const captureState = {
  stream: null,
  active: false,
  naturalWidth: 0,
  naturalHeight: 0,
  rafId: 0
};

function manualIsNeutral() {
  return Math.abs(manualAdjust.offsetX) < 0.5 &&
    Math.abs(manualAdjust.offsetY) < 0.5 &&
    Math.abs(manualAdjust.scale - 1) < 0.002 &&
    Math.abs(manualAdjust.rotation) < 0.1;
}

function manualIsActive() {
  return !manualIsNeutral();
}

function updateManualLabels() {
  offsetXVal.textContent = Math.round(manualAdjust.offsetX) + 'px';
  offsetYVal.textContent = Math.round(manualAdjust.offsetY) + 'px';
  scaleVal.textContent = Math.round(manualAdjust.scale * 100) + '%';
  rotationVal.textContent = Math.round(manualAdjust.rotation) + '°';
  resetAdjustBtn.disabled = manualIsNeutral();
}

function applyManualToSliders() {
  offsetXSlider.value = manualAdjust.offsetX;
  offsetYSlider.value = manualAdjust.offsetY;
  scaleSlider.value = Math.round(manualAdjust.scale * 100);
  rotationSlider.value = manualAdjust.rotation;
  updateManualLabels();
}

function saveManualAdjustments() {
  try {
    const payload = {
      offsetX: manualAdjust.offsetX,
      offsetY: manualAdjust.offsetY,
      scale: manualAdjust.scale,
      rotation: manualAdjust.rotation
    };
    window.localStorage.setItem(MANUAL_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('Failed to save manual overlay adjustments', err);
  }
}

function loadManualAdjustments() {
  try {
    const raw = window.localStorage.getItem(MANUAL_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        if (typeof data.offsetX === 'number') {
          manualAdjust.offsetX = clamp(data.offsetX, -250, 250);
        }
        if (typeof data.offsetY === 'number') {
          manualAdjust.offsetY = clamp(data.offsetY, -250, 250);
        }
        if (typeof data.scale === 'number') {
          manualAdjust.scale = clamp(data.scale, 0.8, 1.2);
        }
        if (typeof data.rotation === 'number') {
          manualAdjust.rotation = clamp(data.rotation, -20, 20);
        }
      }
    }
  } catch (err) {
    console.warn('Failed to load manual overlay adjustments', err);
  }
  applyManualToSliders();
}

function updateManualFromInputs() {
  manualAdjust.offsetX = clamp(parseFloat(offsetXSlider.value) || 0, -250, 250);
  manualAdjust.offsetY = clamp(parseFloat(offsetYSlider.value) || 0, -250, 250);
  manualAdjust.scale = clamp((parseFloat(scaleSlider.value) || 100) / 100, 0.8, 1.2);
  manualAdjust.rotation = clamp(parseFloat(rotationSlider.value) || 0, -20, 20);
  updateManualLabels();
  saveManualAdjustments();
  drawOnce();
}

function resetManualAdjustments() {
  manualAdjust.offsetX = manualDefaults.offsetX;
  manualAdjust.offsetY = manualDefaults.offsetY;
  manualAdjust.scale = manualDefaults.scale;
  manualAdjust.rotation = manualDefaults.rotation;
  applyManualToSliders();
  saveManualAdjustments();
  drawOnce();
}

function naturalSize(which) {
  if (which === 'A') {
    return { w: refImg.naturalWidth || 0, h: refImg.naturalHeight || 0 };
  }
  if (captureState.active) {
    return {
      w: captureState.naturalWidth || captureVideo.videoWidth || 0,
      h: captureState.naturalHeight || captureVideo.videoHeight || 0
    };
  }
  return { w: baseImg.naturalWidth || 0, h: baseImg.naturalHeight || 0 };
}

function sharedIds() {
  const ids = [];
  const seen = new Set();
  Object.keys(pointsA).forEach((id) => {
    if (pointsA[id] && pointsB[id]) {
      ids.push(id);
      seen.add(id);
    }
  });
  Object.keys(pointsB).forEach((id) => {
    if (!seen.has(id) && pointsA[id] && pointsB[id]) {
      ids.push(id);
    }
  });
  return ids;
}

function updateMatchedView() {
  const shared = sharedIds();
  if (shared.length < 3) {
    viewA = null;
    viewB = null;
    return;
  }
  const dimsA = naturalSize('A');
  const dimsB = naturalSize('B');
  const views = computeAlignedViews(pointsA, pointsB, shared, dimsA, dimsB);
  viewA = views.viewA;
  viewB = views.viewB;
}

function fitCanvas() {
  const dims = viewB ? { w: viewB.w, h: viewB.h } : naturalSize('B');
  const containerW = wrap.clientWidth || 600;
  const baseW = dims.w || containerW;
  const baseH = dims.h || (baseW * 0.75);
  const aspect = baseW ? (baseH / baseW) : 0.75;
  const w = containerW;
  const h = Math.max(1, Math.round(w * aspect));
  canvas.width = w;
  canvas.height = h;
}

function toNatural(p, dims) {
  if (!p || !dims.w || !dims.h) return null;
  return { x: p.u * dims.w, y: p.v * dims.h };
}

function toCanvasPoint(p, dims, view) {
  if (!p) return null;
  const nat = toNatural(p, dims);
  if (!nat) return null;
  if (view) {
    return {
      x: (nat.x - view.x) / (view.w || 1) * canvas.width,
      y: (nat.y - view.y) / (view.h || 1) * canvas.height
    };
  }
  return {
    x: (nat.x / (dims.w || 1)) * canvas.width,
    y: (nat.y / (dims.h || 1)) * canvas.height
  };
}

function updateStatus(baseAvailable, overlayApplied, pointsUsed, manualActiveFlag) {
  if (!stateLoaded) {
    statusEl.textContent = 'No saved faces yet. Visit the Manual Landmark Setup to upload the target image, capture your comparison face, and place at least three matching landmarks.';
    statusEl.className = 'small status-warn';
    return;
  }
  const parts = [];
  if (!refReady) {
    parts.push('Waiting for target image to load.');
  }
  if (!baseAvailable) {
    parts.push(captureState.active ? 'Waiting for live capture...' : 'No comparison image detected. Start a capture or freeze a frame in the main tool.');
  }
  if (pointsUsed < 3) {
    parts.push('At least three shared landmarks are required for alignment.');
  } else {
    parts.push('Use the manual offset, scale, and rotation controls for fine tuning once aligned.');
    if (manualActiveFlag) {
      parts.push('Manual adjustments active — reset to return to the auto alignment.');
    }
  }
  if (overlayApplied) {
    parts.push('Overlay active — adjust opacity or freeze the frame as needed.');
  }
  statusEl.textContent = parts.join(' ');
  const cls = overlayApplied ? 'status-ok' : ((baseAvailable && pointsUsed >= 3) ? 'status-warn' : 'muted');
  statusEl.className = 'small ' + cls;
}

function drawOnce() {
  fitCanvas();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const dimsB = naturalSize('B');
  updateMatchedView();
  const baseAvailable = captureState.active ? (captureVideo.readyState >= 2) : baseReady;

  if (baseAvailable) {
    if (viewB) {
      ctx.drawImage(captureState.active ? captureVideo : baseImg, viewB.x, viewB.y, viewB.w, viewB.h, 0, 0, canvas.width, canvas.height);
    } else if (dimsB.w && dimsB.h) {
      ctx.drawImage(captureState.active ? captureVideo : baseImg, 0, 0, dimsB.w, dimsB.h, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  } else {
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  let overlayApplied = false;
  const dimsA = naturalSize('A');
  const ids = controlIds.filter((id) => pointsA[id] && pointsB[id]);
  if (refReady && baseAvailable && ids.length === 3) {
    const src = ids.map((id) => toNatural(pointsA[id], dimsA));
    const dst = ids.map((id) => toCanvasPoint(pointsB[id], dimsB, viewB));
    if (src.every(Boolean) && dst.every(Boolean)) {
      const T = solveSimilarity(src, dst);
      if (T) {
        const final = composeManualTransform(T, manualAdjust);
        if (final) {
          ctx.save();
          ctx.globalAlpha = overlayOpacity;
          ctx.setTransform(final.a, final.b, final.c, final.d, final.e, final.f);
          ctx.drawImage(refImg, 0, 0);
          ctx.restore();
          overlayApplied = true;
        }
      }
    }
  }

  if (showPoints && ids.length) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ff2f68';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ids.forEach((id) => {
      const pt = toCanvasPoint(pointsB[id], dimsB, viewB);
      if (!pt) return;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  updateStatus(baseAvailable, overlayApplied, ids.length, manualIsActive());
}

function tick() {
  drawOnce();
  if (captureState.active) {
    captureState.rafId = requestAnimationFrame(tick);
  }
}

function startLiveCapture() {
  if (captureState.active) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    alert('Screen capture is not supported in this browser.');
    return;
  }
  navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }).then((stream) => {
    captureState.stream = stream;
    captureState.active = true;
    captureVideo.srcObject = stream;
    captureVideo.onloadedmetadata = () => {
      captureState.naturalWidth = captureVideo.videoWidth;
      captureState.naturalHeight = captureVideo.videoHeight;
      captureVideo.play().catch(() => {});
      tick();
    };
    const [videoTrack] = stream.getVideoTracks();
    if (videoTrack) {
      videoTrack.addEventListener('ended', stopLiveCapture, { once: true });
    }
    startBtn.disabled = true;
    stopBtn.disabled = false;
    freezeBtn.disabled = false;
  }).catch((err) => {
    console.error('Live capture failed', err);
    alert('Screen capture failed or was blocked.');
  });
}

function stopLiveCapture() {
  if (captureState.stream) {
    captureState.stream.getTracks().forEach((t) => t.stop());
  }
  captureState.stream = null;
  captureState.active = false;
  captureState.naturalWidth = 0;
  captureState.naturalHeight = 0;
  if (captureState.rafId) {
    cancelAnimationFrame(captureState.rafId);
    captureState.rafId = 0;
  }
  captureVideo.srcObject = null;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  freezeBtn.disabled = true;
  drawOnce();
}

function freezeCapture() {
  if (!captureState.active) return;
  if (captureVideo.readyState < 2) return;
  const off = document.createElement('canvas');
  off.width = captureVideo.videoWidth || captureState.naturalWidth || 0;
  off.height = captureVideo.videoHeight || captureState.naturalHeight || 0;
  if (!off.width || !off.height) return;
  const offCtx = off.getContext('2d');
  offCtx.drawImage(captureVideo, 0, 0, off.width, off.height);
  try {
    const dataUrl = off.toDataURL('image/png');
    if (dataUrl) {
      baseImg.src = dataUrl;
      baseReady = true;
      stopLiveCapture();
    }
  } catch (err) {
    console.error('Freeze capture failed', err);
  }
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) {
      statusEl.textContent = 'No saved comparator data found. Use the main page to place landmarks first.';
      return;
    }
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid saved data');
    }
    pointsA = data.pointsA || {};
    pointsB = data.pointsB || {};
    const cp = data.controlPoints || {};
    if (cp.cp1 && cp.cp2 && cp.cp3) {
      controlIds = [cp.cp1, cp.cp2, cp.cp3];
    }
    if (data.imgA) {
      refImg.src = data.imgA;
    } else {
      statusEl.textContent = 'Target image missing. Upload it on the main page.';
    }
    if (data.imgB) {
      baseImg.src = data.imgB;
      baseReady = true;
    }
    stateLoaded = true;
    drawOnce();
  } catch (err) {
    console.error('Failed to load overlay state', err);
    statusEl.textContent = 'Unable to load saved data. Refresh or rebuild the comparison on the main page.';
  }
}

refImg.onload = () => {
  refReady = true;
  drawOnce();
};
baseImg.onload = () => {
  baseReady = true;
  drawOnce();
};

opacitySlider.addEventListener('input', () => {
  overlayOpacity = clamp(opacitySlider.value, 0, 100) / 100;
  opacityVal.textContent = Math.round(overlayOpacity * 100) + '%';
  drawOnce();
});
showPointsChk.addEventListener('change', () => {
  showPoints = showPointsChk.checked;
  drawOnce();
});
startBtn.addEventListener('click', startLiveCapture);
stopBtn.addEventListener('click', stopLiveCapture);
freezeBtn.addEventListener('click', freezeCapture);
offsetXSlider.addEventListener('input', updateManualFromInputs);
offsetYSlider.addEventListener('input', updateManualFromInputs);
scaleSlider.addEventListener('input', updateManualFromInputs);
rotationSlider.addEventListener('input', updateManualFromInputs);
resetAdjustBtn.addEventListener('click', (evt) => {
  evt.preventDefault();
  resetManualAdjustments();
});

if (window.ResizeObserver) {
  const ro = new ResizeObserver(() => {
    drawOnce();
  });
  ro.observe(wrap);
} else {
  window.addEventListener('resize', drawOnce);
}

loadManualAdjustments();
loadState();
