interface TraceOptions {
  mode: "bw" | "color";
  numberofcolors: number;
  palette?: TraceColor[];
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
  type: "L" | "Q";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3?: number;
  y3?: number;
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
  | { type: "TRACE_REQUEST"; options: TraceOptions }
  | { type: "TRACE_RESULT"; trace: TraceResult }
  | { type: "TRACE_ERROR"; message: string };

const UI_WIDTH = 720;
const UI_HEIGHT = 640;
const OUTPUT_GAP = 32;
let sourceNode: SceneNode | null = null;
let selectionVersion = 0;
let uiReady = false;

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

async function refreshSelectionPreview(): Promise<void> {
  const version = ++selectionVersion;
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    postStatus("Select one layer with an image fill.");
    return;
  }
  if (selection.length !== 1) {
    postStatus("Select exactly one layer with an image fill.", true);
    return;
  }

  const paint = getSelectedImagePaint(selection[0]);
  if (!paint || !paint.imageHash) {
    postStatus("Selected layer has no visible image fill.", true);
    return;
  }

  const image = figma.getImageByHash(paint.imageHash);
  if (!image) {
    postStatus("Figma could not load the selected image.", true);
    return;
  }

  try {
    postStatus("Loading preview…", false, true);
    const bytes = await image.getBytesAsync();
    if (version !== selectionVersion) {
      return;
    }

    figma.ui.postMessage({ type: "PREVIEW_IMAGE", bytes });
    postStatus(`Ready to trace: ${selection[0].name}`);
  } catch (error) {
    console.error("Unable to load preview image:", error);
    if (version === selectionVersion) {
      postStatus("Unable to load a preview for this image.", true);
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
    numberofcolors: palette
      ? palette.length
      : Math.round(clamp(options.numberofcolors, 2, 16)),
    ...(palette ? { palette } : {}),
    pathomit: Math.round(clamp(options.pathomit, 2, 30)),
    ltres: clamp(options.ltres, 0.1, 4),
    qtres: clamp(options.qtres, 0.1, 4),
    traceScalePercent: Number.isFinite(requestedTraceScalePercent)
      ? Math.round(clamp(requestedTraceScalePercent, 1, 100))
      : 50,
    invert: Boolean(options.invert),
    blur: Math.round(clamp(options.blur, 0, 10)),
    threshold: Math.round(clamp(options.threshold, 0, 255)),
    stackColors: Boolean(options.stackColors),
  };
}

async function traceSelectedImage(options: TraceOptions): Promise<void> {
  const selection = figma.currentPage.selection;

  if (selection.length !== 1) {
    reportError("Select exactly one layer with an image fill, then click Trace.");
    return;
  }

  sourceNode = selection[0];
  const imagePaint = getSelectedImagePaint(sourceNode);
  if (!imagePaint || !imagePaint.imageHash) {
    reportError("The selected layer does not have a usable image fill.");
    return;
  }

  const image = figma.getImageByHash(imagePaint.imageHash);
  if (!image) {
    reportError("Figma could not read the selected image.");
    return;
  }

  try {
    postStatus("Reading image data…", false, true);
    const bytes = await image.getBytesAsync();
    if (bytes.length === 0) {
      reportError("The selected image has no readable data.");
      return;
    }

    postStatus("Tracing image…", false, true);
    figma.ui.postMessage({
      type: "TRACE_IMAGE",
      bytes,
      options: normalizeOptions(options),
    });
  } catch (error) {
    console.error("Unable to read image bytes:", error);
    reportError("Unable to read the selected image data.");
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
          x: (2 /3) * (controlX - endPoint.x),
          y: (2 / 3) * (controlY - endPoint.y),
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

        const offsetX = Math.min(...allPathSegments.map((segment) => segment.x1 * scaleX));
        const offsetY = Math.min(...allPathSegments.map((segment) => segment.y1 * scaleY));
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
