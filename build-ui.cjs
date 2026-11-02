const fs = require("node:fs");
const path = require("node:path");

const projectRoot = __dirname;
const templatePath = path.join(projectRoot, "ui.template.html");
const imageTracerPath = path.join(projectRoot, "imagetracer.js");
const outputPath = path.join(projectRoot, "ui.html");
const placeholder = "<!-- IMAGE_TRACER_LIBRARY -->";

const ortPath = path.join(projectRoot, "node_modules", "onnxruntime-web", "dist", "ort.webgl.min.js");
const teedModelPath = path.join(projectRoot, "models", "teed.onnx");

if (!fs.existsSync(imageTracerPath)) {
  throw new Error("Missing imagetracer.js. Download the browser build and place it in the project root.");
}
if (!fs.existsSync(ortPath)) {
  throw new Error("Missing onnxruntime-web at: " + ortPath);
}
if (!fs.existsSync(teedModelPath)) {
  throw new Error("Missing TEED model at: " + teedModelPath);
}

const template = fs.readFileSync(templatePath, "utf8");
const imageTracerSource = fs.readFileSync(imageTracerPath, "utf8");
const ortSource = fs.readFileSync(ortPath, "utf8");
const teedModelBase64 = fs.readFileSync(teedModelPath).toString("base64");

if (!template.includes(placeholder)) {
  throw new Error("ui.template.html is missing the ImageTracer placeholder.");
}

const safeWorkerSource = JSON.stringify(imageTracerSource).replace(/</g, "\\u003c");

const embeddedLibrary = [
  "<script>",
  ortSource,
  "</script>",
  "<script>",
  `const TEED_MODEL_BASE64 = "${teedModelBase64}";`,
  "</script>",
  "<script>",
  imageTracerSource,
  "</script>",
  "<script>",
  `const IMAGE_TRACER_SOURCE = ${safeWorkerSource};`,
  "</script>"
].join("\n");

const output = template.replace(placeholder, embeddedLibrary);

fs.writeFileSync(outputPath, output, "utf8");
console.log("Built ui.html with ONNX Runtime, TEED model, and ImageTracer embedded.");
