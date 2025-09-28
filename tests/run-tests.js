import assert from 'node:assert/strict';
import {
  alignBox,
  boundingBox,
  clamp,
  composeManualTransform,
  computeAlignedViews,
  paddedBox,
  solveSimilarity
} from '../scripts/alignment-math.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    failed++;
    console.error(`✗ ${name}`);
    console.error(err);
  }
}

const closeTo = (value, expected, epsilon = 1e-6) => Math.abs(value - expected) < epsilon;

test('clamp limits values within range', () => {
  assert.equal(clamp(10, 0, 5), 5);
  assert.equal(clamp(-3, 0, 5), 0);
  assert.equal(clamp(3, 0, 5), 3);
});

test('boundingBox returns null when insufficient data', () => {
  assert.equal(boundingBox({}, ['a'], { w: 100, h: 100 }), null);
});

test('boundingBox computes box with centre', () => {
  const points = {
    a: { u: 0.1, v: 0.2 },
    b: { u: 0.4, v: 0.3 },
    c: { u: 0.2, v: 0.5 }
  };
  const box = boundingBox(points, ['a', 'b', 'c'], { w: 100, h: 100 });
  assert.ok(box);
  assert.ok(closeTo(box.x, 10));
  assert.ok(closeTo(box.y, 20));
  assert.ok(closeTo(box.w, 30));
  assert.ok(closeTo(box.h, 30));
  assert.ok(closeTo(box.cx, 25));
  assert.ok(closeTo(box.cy, 35));
});

test('paddedBox applies padding and respects dimensions', () => {
  const box = { x: 10, y: 10, w: 20, h: 10, cx: 20, cy: 15 };
  const padded = paddedBox(box, { w: 100, h: 50 });
  assert.ok(padded.w > box.w);
  assert.ok(padded.h > box.h);
  assert.equal(padded.cx, box.cx);
  assert.equal(padded.cy, box.cy);
  assert.ok(padded.w <= 100);
  assert.ok(padded.h <= 50);
});

test('alignBox aligns within dimensions', () => {
  const box = { cx: 80, cy: 40, w: 60, h: 40 };
  const aligned = alignBox(box, 90, 70, { w: 120, h: 80 });
  assert.ok(aligned.x >= 0);
  assert.ok(aligned.y >= 0);
  assert.ok(aligned.x + aligned.w <= 120 + 1e-6);
  assert.ok(aligned.y + aligned.h <= 80 + 1e-6);
});

test('solveSimilarity solves rotation, scale, and translation', () => {
  const src = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 }
  ];
  const angle = Math.PI / 6;
  const scale = 1.5;
  const tx = 4;
  const ty = -2;
  const rot = (x, y) => ({
    x: scale * (x * Math.cos(angle) - y * Math.sin(angle)) + tx,
    y: scale * (x * Math.sin(angle) + y * Math.cos(angle)) + ty
  });
  const dst = src.map((p) => rot(p.x, p.y));
  const T = solveSimilarity(src, dst);
  assert.ok(T);
  dst.forEach((target, index) => {
    const { x, y } = src[index];
    const mapped = {
      x: T.a * x - T.b * y + T.tx,
      y: T.b * x + T.a * y + T.ty
    };
    assert.ok(closeTo(mapped.x, target.x, 1e-6));
    assert.ok(closeTo(mapped.y, target.y, 1e-6));
  });
});

test('composeManualTransform applies manual adjustments', () => {
  const base = { a: 1, b: 0, tx: 10, ty: 5 };
  const manual = { scale: 1.2, rotation: 15, offsetX: 3, offsetY: -4 };
  const result = composeManualTransform(base, manual);
  assert.ok(result);
  assert.ok(closeTo(result.e, 13.038196, 1e-3));
  assert.ok(closeTo(result.f, 4.901383, 1e-3));
});

test('computeAlignedViews returns aligned views when dims valid', () => {
  const pointsA = {
    one: { u: 0.2, v: 0.2 },
    two: { u: 0.4, v: 0.2 },
    three: { u: 0.3, v: 0.4 }
  };
  const pointsB = {
    one: { u: 0.1, v: 0.1 },
    two: { u: 0.3, v: 0.1 },
    three: { u: 0.2, v: 0.3 }
  };
  const dimsA = { w: 400, h: 500 };
  const dimsB = { w: 600, h: 600 };
  const ids = ['one', 'two', 'three'];
  const { viewA, viewB } = computeAlignedViews(pointsA, pointsB, ids, dimsA, dimsB);
  assert.ok(viewA);
  assert.ok(viewB);
  assert.ok(viewA.w > 0);
  assert.ok(viewB.w > 0);
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed, ${passed} passed.`);
  process.exitCode = 1;
} else {
  console.log(`\nAll ${passed} test(s) passed.`);
}
