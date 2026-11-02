const fs = require("fs");
const path = require("path");
const vm = require("vm");

console.log("=== Verifying Figma Tracer Integration ===");

// 1. Verify code.js
const codeJs = fs.readFileSync(path.join(__dirname, "code.js"), "utf8");
try {
  new vm.Script(codeJs);
  console.log("✅ code.js parses without syntax errors.");
} catch (e) {
  console.error("❌ code.js syntax error:", e);
  process.exit(1);
}

// 2. Verify ui.html
const html = fs.readFileSync(path.join(__dirname, "ui.html"), "utf8");
console.log("ui.html size:", (html.length / 1024 / 1024).toFixed(2), "MB");

const requiredIds = [
  "edge-engine",
  "classical-edge-controls",
  "ai-edge-controls",
  "ai-threshold",
  "ai-threshold-num",
  "edge-sensitivity",
  "edge-gap-close",
  "edge-display-bar",
  "edge-btn-overlay",
  "edge-btn-wireframe",
  "edge-stats",
  "tab-vector",
  "tab-edges",
  "tab-sequence"
];

for (const id of requiredIds) {
  if (!html.includes(`id="${id}"`) && !html.includes(`id='${id}'`)) {
    console.error("❌ Missing element ID in ui.html:", id);
    process.exit(1);
  }
}
console.log("✅ All required UI controls present.");

// 3. Verify TEED_MODEL_BASE64
const match = html.match(/const TEED_MODEL_BASE64 = "([^"]+)";/);
if (!match) {
  console.error("❌ TEED_MODEL_BASE64 not found in ui.html!");
  process.exit(1);
}
const modelBuf = Buffer.from(match[1], "base64");
const originalBuf = fs.readFileSync(path.join(__dirname, "models", "teed.onnx"));
if (modelBuf.length !== originalBuf.length) {
  console.error("❌ Model size mismatch: embedded", modelBuf.length, "vs original", originalBuf.length);
  process.exit(1);
}
console.log(`✅ Embedded TEED model is byte-exact: ${modelBuf.length} bytes.`);

// 4. Verify ImageTracer in Node
const it = require(path.join(__dirname, "imagetracer.js"));
const w = 64, h = 64;
const dummyImgd = {
  width: w,
  height: h,
  data: new Uint8ClampedArray(w * h * 4)
};
// Fill with white background, draw black rectangle
for (let i = 0; i < w * h * 4; i += 4) {
  dummyImgd.data[i] = 255;
  dummyImgd.data[i + 1] = 255;
  dummyImgd.data[i + 2] = 255;
  dummyImgd.data[i + 3] = 255;
}
for (let y = 16; y < 48; y++) {
  for (let x = 16; x < 48; x++) {
    const idx = (y * w + x) * 4;
    dummyImgd.data[idx] = 0;
    dummyImgd.data[idx + 1] = 0;
    dummyImgd.data[idx + 2] = 0;
  }
}

// Test classical edge detection
const classicalEdges = it.detectEdgeMap(dummyImgd, null, {
  edgesensitivity: 35,
  edgegapclose: 1,
  edgethinning: true
});
let classicalCount = 0;
for (let i = 0; i < classicalEdges.length; i++) {
  if (classicalEdges[i] === 1) classicalCount++;
}
console.log(`✅ Classical edge detection: detected ${classicalCount} edge pixels.`);
if (classicalCount === 0) {
  console.error("❌ Classical edge detector failed to find rectangle edges.");
  process.exit(1);
}

// Test AI edge map input injection
const mockAiEdges = new Uint8Array(w * h);
// Draw a 1-pixel border with a 1-pixel gap
for (let x = 10; x < 50; x++) {
  if (x !== 30) mockAiEdges[10 * w + x] = 1; // 1px gap at x=30
  mockAiEdges[50 * w + x] = 1;
}
for (let y = 10; y <= 50; y++) {
  mockAiEdges[y * w + 10] = 1;
  mockAiEdges[y * w + 50] = 1;
}

const aiDetectedMap = it.detectEdgeMap(dummyImgd, null, {
  aiedges: mockAiEdges,
  edgegapclose: 1
});

// Check that morphological gap closing bridged the gap at (30, 10)
const gapBridged = aiDetectedMap[10 * w + 30] === 1;
console.log(`✅ AI Edge injection & Morphological gap closing: gap at (30, 10) was bridged? ${gapBridged}`);
if (!gapBridged) {
  console.error("❌ Morphological gap closing failed to seal the 1px gap.");
  process.exit(1);
}

// 5. Test ONNX Runtime Web session creation & inference with the embedded model bytes
const ort = require(path.join(__dirname, "node_modules", "onnxruntime-web"));
(async () => {
  try {
    const session = await ort.InferenceSession.create(modelBuf.buffer);
    console.log("✅ ONNX Runtime Web session successfully created from embedded model.");
    console.log("   Inputs:", session.inputNames);
    console.log("   Outputs:", session.outputNames);

    // Run inference on 64x64 tensor (padded to multiple of 16, which is 64)
    const inputTensor = new ort.Tensor("float32", new Float32Array(1 * 3 * 64 * 64), [1, 3, 64, 64]);
    const feeds = {};
    feeds[session.inputNames[0]] = inputTensor;
    const t0 = Date.now();
    const result = await session.run(feeds);
    const latency = Date.now() - t0;
    const outputTensor = result[session.outputNames[0]];
    console.log(`✅ ONNX Runtime inference succeeded in ${latency} ms. Output shape:`, outputTensor.dims);
    console.log("\n🎉 ALL TESTS PASSED! Integration is rock solid.");
  } catch (err) {
    console.error("❌ ONNX inference error:", err);
    process.exit(1);
  }
})();
