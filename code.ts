interface TraceOptions {
  mode: "bw" | "color";
  sourceMode?: "rendered" | "original";
  curveAlgorithm?: "potrace" | "standard";
  smoothSteps?: number;
  alphaMax?: number;
  speckleRadius?: number;
  numberofcolors: number;
  palette?: TraceColor[];
  kmeansDistance?: string;
  pathomit: number;
  ltres: number;
  qtres: number;
  traceScalePercent: number;
  invert: boolean;
  blur: number;
  threshold: number;
  stackColors: boolean;
}

interface TraceSegment {
  type: "L" | "Q" | "C";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3?: number;
  y3?: number;
  x4?: number;
  y4?: number;
}

interface TracePath {
  segments: TraceSegment[];
  holechildren: number[];
  isholepath?: boolean;
}

interface TraceColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface TraceLayer {
  color: TraceColor;
  paths: TracePath[];
}

interface TraceResult {
  width: number;
  height: number;
  layers: TraceLayer[];
}

type PluginMessage =
  | { type: "UI_READY" }
  | { type: "CHANGE_SOURCE_MODE"; sourceMode: "rendered" | "original" }
  | { type: "TRACE_REQUEST"; options: TraceOptions }
  | { type: "TRACE_RESULT"; trace: TraceResult }
  | { type: "TRACE_ERROR"; message: string };

const UI_WIDTH = 720;
const UI_HEIGHT = 640;
const OUTPUT_GAP = 32;
let sourceNode: SceneNode | null = null;
let selectionVersion = 0;
let uiReady = false;
let currentSourceMode: "rendered" | "original" = "rendered";

function postStatus(message: string, isError = false, busy = false): void {
  figma.ui.postMessage({ type: "STATUS", message, isError, busy });
}

function reportError(message: string): void {
  console.error(message);
  figma.notify(message, { error: true });
  postStatus(message, true);
}

function getSelectedImagePaint(node: SceneNode): ImagePaint | null {
  if (!("fills" in node) || node.fills === figma.mixed) {
    return null;
  }

  return (
    node.fills.find(
      (paint): paint is ImagePaint =>
        paint.type === "IMAGE" && paint.visible !== false
    ) ?? null
  );
}

function hasImagePaint(node: SceneNode): boolean {
  return getSelectedImagePaint(node) !== null;
}

async function getNodeBytes(
  node: SceneNode,
  sourceMode: "rendered" | "original" = currentSourceMode
): Promise<Uint8Array> {
  if (sourceMode === "original") {
    const paint = getSelectedImagePaint(node);
    if (paint && paint.imageHash) {
      const image = figma.getImageByHash(paint.imageHash);
      if (image) {
        return await image.getBytesAsync();
      }
    }
  }

  // Rendered layer mode: captures the layer appearance directly from canvas (crops, masks, frames, vectors, etc.)
  return await node.exportAsync({
    format: "PNG",
    constraint: { type: "SCALE", value: 1 },
  });
}

async function refreshSelectionPreview(
  sourceMode: "rendered" | "original" = currentSourceMode
): Promise<void> {
  const version = ++selectionVersion;
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    postStatus("Select any layer on canvas to trace.");
    figma.ui.postMessage({ type: "NO_SELECTION" });
    return;
  }
  if (selection.length !== 1) {
    postStatus("Select exactly one layer to trace.", true);
    return;
  }

  const node = selection[0];
  const hasImage = hasImagePaint(node);

  try {
    postStatus(`Loading preview: ${node.name}…`, false, true);
    const bytes = await getNodeBytes(node, sourceMode);
    if (version !== selectionVersion) {
      return;
    }

    figma.ui.postMessage({
      type: "PREVIEW_IMAGE",
      bytes,
      layerName: node.name,
      hasImagePaint: hasImage,
    });
    postStatus(`Ready to trace: ${node.name}`);
  } catch (error) {
    console.error("Unable to load preview for layer:", error);
    if (version === selectionVersion) {
      postStatus("Unable to capture the selected layer.", true);
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeOptions(options: TraceOptions): TraceOptions {
  const mode = options.mode === "bw" ? "bw" : "color";
  const requestedTraceScalePercent = Number(options.traceScalePercent);
  const normalizedPalette =
    mode === "color" && Array.isArray(options.palette)
      ? options.palette
          .slice(0, 16)
          .map((color) => ({
            r: Math.round(clamp(Number(color.r), 0, 255)),
            g: Math.round(clamp(Number(color.g), 0, 255)),
            b: Math.round(clamp(Number(color.b), 0, 255)),
            a: Math.round(clamp(Number(color.a), 0, 255)),
          }))
          .filter((color) =>
            [color.r, color.g, color.b, color.a].every(Number.isFinite)
          )
      : undefined;

  const palette =
    normalizedPalette && normalizedPalette.length >= 2
      ? normalizedPalette
      : undefined;

  return {
    mode,
    sourceMode: options.sourceMode === "original" ? "original" : "rendered",
    curveAlgorithm: options.curveAlgorithm === "standard" ? "standard" : "potrace",
    smoothSteps: Number.isFinite(Number(options.smoothSteps))
      ? Math.max(0, Math.round(Number(options.smoothSteps)))
      : 2,
    alphaMax: Number.isFinite(Number(options.alphaMax))
      ? Math.max(0, Number(options.alphaMax))
      : 1.0,
    speckleRadius: Number.isFinite(Number(options.speckleRadius))
      ? Math.max(0, Number(options.speckleRadius))
      : 1.5,
    numberofcolors: palette
      ? palette.length
      : Number.isFinite(Number(options.numberofcolors))
      ? Math.max(2, Math.round(Number(options.numberofcolors)))
      : 8,
    ...(palette ? { palette } : {}),
    kmeansDistance:
      typeof options.kmeansDistance === "string"
        ? options.kmeansDistance
        : "perceptual",
    pathomit: Number.isFinite(Number(options.pathomit))
      ? Math.max(0, Math.round(Number(options.pathomit)))
      : 12,
    ltres: Number.isFinite(Number(options.ltres))
      ? Math.max(0.0001, Number(options.ltres))
      : 1.0,
    qtres: Number.isFinite(Number(options.qtres))
      ? Math.max(0.0001, Number(options.qtres))
      : 1.0,
    traceScalePercent: Number.isFinite(requestedTraceScalePercent)
      ? Math.round(clamp(requestedTraceScalePercent, 1, 100))
      : 50,
    invert: Boolean(options.invert),
    blur: Number.isFinite(Number(options.blur))
      ? Math.max(0, Math.round(Number(options.blur)))
      : 0,
    threshold: Number.isFinite(Number(options.threshold))
      ? Math.round(clamp(Number(options.threshold), 0, 255))
      : 128,
    stackColors: Boolean(options.stackColors),
  };
}

async function traceSelectedImage(options: TraceOptions): Promise<void> {
  const selection = figma.currentPage.selection;

  if (selection.length !== 1) {
    reportError("Select exactly one layer to trace, then click Place traced vector.");
    return;
  }

  sourceNode = selection[0];

  try {
    postStatus("Reading layer data…", false, true);
    const bytes = await getNodeBytes(sourceNode, options.sourceMode || currentSourceMode);
    if (bytes.length === 0) {
      reportError("The selected layer produced no image data.");
      return;
    }

    postStatus("Tracing layer in background…", false, true);
    figma.ui.postMessage({
      type: "TRACE_IMAGE",
      bytes,
      options: normalizeOptions(options),
    });
  } catch (error) {
    console.error("Unable to read layer bytes:", error);
    reportError("Unable to capture the selected layer.");
  }
}

function isFinitePoint(...values: number[]): boolean {
  return values.every(Number.isFinite);
}

function makePaint(color: TraceColor): SolidPaint {
  return {
    type: "SOLID",
    color: { r: color.r / 255, g: color.g / 255, b: color.b / 255 },
    opacity: color.a / 255,
  };
}

function addPathLoop(
  path: TracePath,
  network: { vertices: VectorVertex[]; segments: VectorSegment[] },
  loops: number[][],
  scaleX: number,
  scaleY: number,
  offsetX: number,
  offsetY: number
): void {
  if (path.segments.length < 3) {
    return;
  }

  const vertexOffset = network.vertices.length;
  const segmentOffset = network.segments.length;

  for (const segment of path.segments) {
    if (!isFinitePoint(segment.x1, segment.y1)) {
      throw new Error("The tracer returned invalid path coordinates.");
    }
    network.vertices.push({
      x: segment.x1 * scaleX - offsetX,
      y: segment.y1 * scaleY - offsetY,
    });
  }

  for (let index = 0; index < path.segments.length; index += 1) {
    const segment = path.segments[index];
    const start = vertexOffset + index;
    const end = vertexOffset + ((index + 1) % path.segments.length);
    let vectorSegment: VectorSegment;

    if (segment.type === "Q") {
      if (
        segment.x3 === undefined ||
        segment.y3 === undefined ||
        !isFinitePoint(segment.x2, segment.y2, segment.x3, segment.y3)
      ) {
        throw new Error("The tracer returned an incomplete curve.");
      }

      const startPoint = network.vertices[start];
      const endPoint = network.vertices[end];
      const controlX = segment.x2 * scaleX - offsetX;
      const controlY = segment.y2 * scaleY - offsetY;
      vectorSegment = {
        start,
        end,
        tangentStart: {
          x: (2 / 3) * (controlX - startPoint.x),
          y: (2 / 3) * (controlY - startPoint.y),
        },
        tangentEnd: {
          x: (2 / 3) * (controlX - endPoint.x),
          y: (2 / 3) * (controlY - endPoint.y),
        },
      };
    } else if (segment.type === "C") {
      const startPoint = network.vertices[start];
      const endPoint = network.vertices[end];
      const cp1X = segment.x2 * scaleX - offsetX;
      const cp1Y = segment.y2 * scaleY - offsetY;
      const cp2X = (segment.x3 !== undefined ? segment.x3 : segment.x2) * scaleX - offsetX;
      const cp2Y = (segment.y3 !== undefined ? segment.y3 : segment.y2) * scaleY - offsetY;
      vectorSegment = {
        start,
        end,
        tangentStart: {
          x: cp1X - startPoint.x,
          y: cp1Y - startPoint.y,
        },
        tangentEnd: {
          x: cp2X - endPoint.x,
          y: cp2Y - endPoint.y,
        },
      };
    } else {
      vectorSegment = { start, end };
    }

    network.segments.push(vectorSegment);
  }

  loops.push(path.segments.map((_, index) => segmentOffset + index));
}

async function createNativeTrace(
  trace: TraceResult,
  source: SceneNode
): Promise<GroupNode> {
  if (!isFinitePoint(trace.width, trace.height) || trace.width <= 0 || trace.height <= 0) {
    throw new Error("The tracer returned invalid dimensions.");
  }

  const scaleX = source.width / trace.width;
  const scaleY = source.height / trace.height;
  const baseX = source.x + source.width + OUTPUT_GAP;
  const baseY = source.y;
  const vectors: VectorNode[] = [];

  try {
    let processedPaths = 0;
    for (const layer of trace.layers) {
      for (let pathIndex = 0; pathIndex < layer.paths.length; pathIndex += 1) {
        const path = layer.paths[pathIndex];
        if (path.isholepath || path.segments.length < 3) {
          continue;
        }

        const allPathSegments = [...path.segments];
        for (const holeIndex of path.holechildren) {
          const hole = layer.paths[holeIndex];
          if (hole) {
            allPathSegments.push(...hole.segments);
          }
        }

        let minX = Infinity;
        let minY = Infinity;
        for (let i = 0; i < allPathSegments.length; i += 1) {
          const sx = allPathSegments[i].x1 * scaleX;
          const sy = allPathSegments[i].y1 * scaleY;
          if (sx < minX) minX = sx;
          if (sy < minY) minY = sy;
        }
        const offsetX = minX;
        const offsetY = minY;

        const network = { vertices: [] as VectorVertex[], segments: [] as VectorSegment[] };
        const loops: number[][] = [];

        addPathLoop(path, network, loops, scaleX, scaleY, offsetX, offsetY);
        for (const holeIndex of path.holechildren) {
          const hole = layer.paths[holeIndex];
          if (hole) {
            addPathLoop(hole, network, loops, scaleX, scaleY, offsetX, offsetY);
          }
        }
        if (loops.length === 0) {
          continue;
        }

        const vector = figma.createVector();
        vector.name = "Traced path";
        await vector.setVectorNetworkAsync({
          vertices: network.vertices,
          segments: network.segments,
          regions: [{ windingRule: "EVENODD", loops, fills: [makePaint(layer.color)] }],
        });
        vector.x = baseX + offsetX;
        vector.y = baseY + offsetY;
        vectors.push(vector);

        processedPaths += 1;
        // Yield periodically so Figma UI stays responsive on large traces
        if (processedPaths % 40 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    }

    if (vectors.length === 0) {
      throw new Error("No usable vector paths were produced.");
    }

    const group = figma.group(vectors, figma.currentPage);
    group.name = "Image Trace";
    return group;
  } catch (error) {
    for (const vector of vectors) {
      if (!vector.removed) {
        vector.remove();
      }
    }
    throw error;
  }
}

async function handleUiMessage(message: PluginMessage): Promise<void> {
  if (message.type === "UI_READY") {
    uiReady = true;
    await refreshSelectionPreview();
    return;
  }

  if (message.type === "CHANGE_SOURCE_MODE") {
    currentSourceMode = message.sourceMode;
    await refreshSelectionPreview(currentSourceMode);
    return;
  }

  if (message.type === "TRACE_REQUEST") {
    await traceSelectedImage(message.options);
    return;
  }

  if (message.type === "TRACE_ERROR") {
    reportError(message.message || "Image tracing failed.");
    return;
  }

  if (message.type !== "TRACE_RESULT") {
    return;
  }

  try {
    if (!sourceNode || sourceNode.removed) {
      throw new Error("The original selection is no longer available.");
    }

    postStatus("Creating Figma vectors…", false, true);
    const tracedNode = await createNativeTrace(message.trace, sourceNode);
    figma.currentPage.selection = [tracedNode];
    figma.viewport.scrollAndZoomIntoView([sourceNode, tracedNode]);
    figma.closePlugin("Image traced successfully.");
  } catch (error) {
    console.error("Unable to create traced vectors:", error);
    reportError("Unable to add the traced vector paths to the canvas.");
  }
}

figma.showUI(__html__, { width: UI_WIDTH, height: UI_HEIGHT });
figma.ui.onmessage = (message: PluginMessage) => {
  void handleUiMessage(message);
};
figma.on("selectionchange", () => {
  if (uiReady) {
    void refreshSelectionPreview();
  }
});
