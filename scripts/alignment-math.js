export function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return Number.isFinite(min) ? min : max;
  }
  return Math.max(min, Math.min(max, value));
}

export function composeManualTransform(baseTransform, manualAdjustments) {
  if (!baseTransform || !manualAdjustments) {
    return null;
  }
  const scale = manualAdjustments.scale ?? 1;
  const rotation = (manualAdjustments.rotation ?? 0) * Math.PI / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const dx = manualAdjustments.offsetX ?? 0;
  const dy = manualAdjustments.offsetY ?? 0;

  const baseA = baseTransform.a ?? 1;
  const baseB = baseTransform.b ?? 0;
  const baseC = baseTransform.c ?? -baseB;
  const baseD = baseTransform.d ?? baseA;
  const baseE = baseTransform.tx ?? baseTransform.e ?? 0;
  const baseF = baseTransform.ty ?? baseTransform.f ?? 0;

  const m00 = scale * cos;
  const m01 = -scale * sin;
  const m02 = dx;
  const m10 = scale * sin;
  const m11 = scale * cos;
  const m12 = dy;

  const outA = m00 * baseA + m01 * baseB;
  const outB = m10 * baseA + m11 * baseB;
  const outC = m00 * baseC + m01 * baseD;
  const outD = m10 * baseC + m11 * baseD;
  const outE = m00 * baseE + m01 * baseF + m02;
  const outF = m10 * baseE + m11 * baseF + m12;

  return { a: outA, b: outB, c: outC, d: outD, e: outE, f: outF };
}

export function boundingBox(points, ids, dims) {
  if (!points || !Array.isArray(ids) || !ids.length) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  ids.forEach((id) => {
    const pt = points[id];
    if (!pt) return;
    const width = dims?.w ?? 0;
    const height = dims?.h ?? 0;
    const x = pt.u * width;
    const y = pt.v * height;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    count++;
  });
  if (!count || !Number.isFinite(minX) || !Number.isFinite(minY) ||
      !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const cx = minX + width / 2;
  const cy = minY + height / 2;
  return { x: minX, y: minY, w: width, h: height, cx, cy };
}

export function paddedBox(box, dims) {
  if (!box) return null;
  const dimWidth = dims?.w ?? 0;
  const dimHeight = dims?.h ?? 0;
  const base = Math.max(box.w, box.h);
  const pad = base * 0.25;
  const minSize = Math.min(dimWidth, dimHeight) * 0.25;
  let width = box.w + pad * 2;
  let height = box.h + pad * 2;
  if (minSize) {
    width = Math.max(width, minSize);
    height = Math.max(height, minSize);
  }
  if (dimWidth) {
    width = Math.min(width, dimWidth);
  }
  if (dimHeight) {
    height = Math.min(height, dimHeight);
  }
  return {
    cx: box.cx,
    cy: box.cy,
    w: Math.max(1, width),
    h: Math.max(1, height)
  };
}

export function alignBox(box, targetWidth, targetHeight, dims) {
  if (!box) return null;
  const dimWidth = dims?.w ?? targetWidth;
  const dimHeight = dims?.h ?? targetHeight;
  let width = Math.min(targetWidth, dimWidth);
  let height = Math.min(targetHeight, dimHeight);
  width = Math.max(1, width);
  height = Math.max(1, height);
  let x = box.cx - width / 2;
  let y = box.cy - height / 2;
  if (dimWidth) {
    if (x < 0) x = 0;
    if (x + width > dimWidth) x = Math.max(0, dimWidth - width);
  }
  if (dimHeight) {
    if (y < 0) y = 0;
    if (y + height > dimHeight) y = Math.max(0, dimHeight - height);
  }
  return { x, y, w: width, h: height };
}

function transpose(matrix) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const result = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j][i] = matrix[i][j];
    }
  }
  return result;
}

function multiplyMatrices(A, B) {
  const rows = A.length;
  const cols = B[0].length;
  const inner = B.length;
  const result = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      let sum = 0;
      for (let k = 0; k < inner; k++) {
        sum += A[i][k] * B[k][j];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

function multiplyMatrixVector(A, v) {
  const rows = A.length;
  const cols = A[0].length;
  const out = Array(rows).fill(0);
  for (let i = 0; i < rows; i++) {
    let sum = 0;
    for (let j = 0; j < cols; j++) {
      sum += A[i][j] * v[j];
    }
    out[i] = sum;
  }
  return out;
}

function invert4x4(matrix) {
  const n = 4;
  const augmented = Array.from({ length: n }, (_, i) => [
    ...matrix[i],
    ...Array.from({ length: n }, (__, j) => (i === j ? 1 : 0))
  ]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivot][col])) {
        pivot = row;
      }
    }
    const pivotVal = augmented[pivot][col];
    if (Math.abs(pivotVal) < 1e-8) {
      return null;
    }
    if (pivot !== col) {
      const tmp = augmented[pivot];
      augmented[pivot] = augmented[col];
      augmented[col] = tmp;
    }
    const denom = augmented[col][col];
    for (let j = 0; j < 2 * n; j++) {
      augmented[col][j] /= denom;
    }
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = augmented[row][col];
      for (let j = 0; j < 2 * n; j++) {
        augmented[row][j] -= factor * augmented[col][j];
      }
    }
  }

  const inv = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      inv[i][j] = augmented[i][j + n];
    }
  }
  return inv;
}

export function solveSimilarity(sourcePoints, destinationPoints) {
  if (!Array.isArray(sourcePoints) || !Array.isArray(destinationPoints) ||
      sourcePoints.length !== 3 || destinationPoints.length !== 3) {
    return null;
  }
  const M = [];
  const Y = [];
  for (let i = 0; i < 3; i++) {
    const { x: xs, y: ys } = sourcePoints[i];
    const { x: xd, y: yd } = destinationPoints[i];
    M.push([xs, -ys, 1, 0]);
    Y.push(xd);
    M.push([ys, xs, 0, 1]);
    Y.push(yd);
  }
  const MT = transpose(M);
  const MTM = multiplyMatrices(MT, M);
  const MTY = multiplyMatrixVector(MT, Y);
  const inverse = invert4x4(MTM);
  if (!inverse) {
    return null;
  }
  const result = multiplyMatrixVector(inverse, MTY);
  return { a: result[0], b: result[1], tx: result[2], ty: result[3] };
}

export function computeAlignedViews(pointsA, pointsB, ids, dimsA, dimsB) {
  if (!Array.isArray(ids) || ids.length < 3) {
    return { viewA: null, viewB: null };
  }
  if (!dimsA?.w || !dimsA?.h || !dimsB?.w || !dimsB?.h) {
    return { viewA: null, viewB: null };
  }
  const boxA = paddedBox(boundingBox(pointsA, ids, dimsA), dimsA);
  const boxB = paddedBox(boundingBox(pointsB, ids, dimsB), dimsB);
  if (!boxA || !boxB) {
    return { viewA: null, viewB: null };
  }
  const targetW = Math.min(Math.max(boxA.w, boxB.w), dimsA.w, dimsB.w);
  const targetH = Math.min(Math.max(boxA.h, boxB.h), dimsA.h, dimsB.h);
  if (targetW < boxA.w || targetW < boxB.w || targetH < boxA.h || targetH < boxB.h) {
    return { viewA: null, viewB: null };
  }
  return {
    viewA: alignBox(boxA, targetW, targetH, dimsA),
    viewB: alignBox(boxB, targetW, targetH, dimsB)
  };
}
