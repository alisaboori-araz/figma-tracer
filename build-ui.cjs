const fs = require("node:fs");
const path = require("node:path");

const projectRoot = __dirname;
const templatePath = path.join(projectRoot, "ui.template.html");
const imageTracerPath = path.join(projectRoot, "imagetracer.js");
const outputPath = path.join(projectRoot, "ui.html");
const placeholder = "<!-- IMAGE_TRACER_LIBRARY -->";

if (!fs.existsSync(imageTracerPath)) {
  throw new Error(
    "Missing imagetracer.js. Download the browser build and place it in the project root."
  );
}

const template = fs.readFileSync(templatePath, "utf8");
const imageTracerSource = fs.readFileSync(imageTracerPath, "utf8");

if (!template.includes(placeholder)) {
  throw new Error("ui.template.html is missing the ImageTracer placeholder.");
}

const safeWorkerSource = JSON.stringify(imageTracerSource).replace(/</g, "\\u003c");
const embeddedLibrary = `<script>\n${imageTracerSource}\n</script>\n<script>const IMAGE_TRACER_SOURCE = ${safeWorkerSource};</script>`;
const output = template.replace(placeholder, embeddedLibrary);

fs.writeFileSync(outputPath, output, "utf8");
console.log("Built ui.html with ImageTracer embedded.");
