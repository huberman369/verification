export async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export function fitDimensions(
  w: number,
  h: number,
  maxSide = 1400,
): { w: number; h: number } {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

export type CopyMoveMatch = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  size: number;
};

export type AnalysisResult = {
  elaUrl: string;
  noiseUrl: string;
  anomalyOverlayUrl: string;
  copyMoveOverlayUrl: string;
  anomalyRatio: number;
  copyMoveMatches: number;
  score: number;
  width: number;
  height: number;
};

async function computeELA(
  img: HTMLImageElement,
  w: number,
  h: number,
  quality = 0.85,
): Promise<{ elaData: ImageData; original: ImageData }> {
  const c1 = makeCanvas(w, h);
  const ctx1 = c1.getContext("2d")!;
  ctx1.drawImage(img, 0, 0, w, h);
  const original = ctx1.getImageData(0, 0, w, h);

  const blob: Blob = await new Promise((resolve, reject) => {
    c1.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      quality,
    );
  });
  const url = URL.createObjectURL(blob);
  try {
    const recompressed = await loadImage(url);
    const c2 = makeCanvas(w, h);
    const ctx2 = c2.getContext("2d")!;
    ctx2.drawImage(recompressed, 0, 0, w, h);
    const re = ctx2.getImageData(0, 0, w, h);

    const elaData = ctx2.createImageData(w, h);
    const a = original.data;
    const b = re.data;
    const o = elaData.data;
    for (let i = 0; i < a.length; i += 4) {
      const dr = Math.abs(a[i] - b[i]);
      const dg = Math.abs(a[i + 1] - b[i + 1]);
      const db = Math.abs(a[i + 2] - b[i + 2]);
      o[i] = dr;
      o[i + 1] = dg;
      o[i + 2] = db;
      o[i + 3] = 255;
    }
    return { elaData, original };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function elaToVisualization(
  ela: ImageData,
  amplify = 18,
): string {
  const c = makeCanvas(ela.width, ela.height);
  const ctx = c.getContext("2d")!;
  const out = ctx.createImageData(ela.width, ela.height);
  const s = ela.data;
  const o = out.data;
  for (let i = 0; i < s.length; i += 4) {
    o[i] = Math.min(255, s[i] * amplify);
    o[i + 1] = Math.min(255, s[i + 1] * amplify);
    o[i + 2] = Math.min(255, s[i + 2] * amplify);
    o[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return c.toDataURL("image/png");
}

function noiseFromOriginal(original: ImageData, amplify = 6): string {
  const w = original.width;
  const h = original.height;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d")!;
  const out = ctx.createImageData(w, h);
  const s = original.data;
  const o = out.data;
  const idx = (x: number, y: number) => (y * w + x) * 4;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let ch = 0; ch < 3; ch++) {
        const center = s[idx(x, y) + ch];
        const sum =
          s[idx(x - 1, y - 1) + ch] +
          s[idx(x, y - 1) + ch] +
          s[idx(x + 1, y - 1) + ch] +
          s[idx(x - 1, y) + ch] +
          s[idx(x + 1, y) + ch] +
          s[idx(x - 1, y + 1) + ch] +
          s[idx(x, y + 1) + ch] +
          s[idx(x + 1, y + 1) + ch];
        const avg = sum / 8;
        const diff = Math.abs(center - avg) * amplify;
        o[idx(x, y) + ch] = Math.min(255, diff);
      }
      o[idx(x, y) + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return c.toDataURL("image/png");
}

function buildAnomalyOverlay(
  original: ImageData,
  ela: ImageData,
  threshold = 14,
): { url: string; ratio: number } {
  const w = ela.width;
  const h = ela.height;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d")!;
  ctx.putImageData(original, 0, 0);

  const overlay = ctx.createImageData(w, h);
  const od = overlay.data;
  const ed = ela.data;

  let flagged = 0;
  const total = w * h;

  for (let i = 0; i < ed.length; i += 4) {
    const m = Math.max(ed[i], ed[i + 1], ed[i + 2]);
    if (m > threshold) {
      const intensity = Math.min(1, (m - threshold) / 40);
      od[i] = 255;
      od[i + 1] = 40;
      od[i + 2] = 60;
      od[i + 3] = Math.round(120 + intensity * 120);
      flagged++;
    }
  }

  const tmp = makeCanvas(w, h);
  tmp.getContext("2d")!.putImageData(overlay, 0, 0);
  ctx.drawImage(tmp, 0, 0);

  return { url: c.toDataURL("image/png"), ratio: flagged / total };
}

type Block = {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  v: number;
};

function detectCopyMove(
  original: ImageData,
  blockSize = 16,
  minDist = 48,
  meanTol = 4,
  varTol = 6,
  maxMatches = 60,
): { matches: CopyMoveMatch[] } {
  const w = original.width;
  const h = original.height;
  const data = original.data;

  const blocks: Block[] = [];
  for (let y = 0; y + blockSize <= h; y += blockSize) {
    for (let x = 0; x + blockSize <= w; x += blockSize) {
      let sr = 0,
        sg = 0,
        sb = 0;
      let sr2 = 0,
        sg2 = 0,
        sb2 = 0;
      const n = blockSize * blockSize;
      for (let yy = 0; yy < blockSize; yy++) {
        for (let xx = 0; xx < blockSize; xx++) {
          const i = ((y + yy) * w + (x + xx)) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          sr += r;
          sg += g;
          sb += b;
          sr2 += r * r;
          sg2 += g * g;
          sb2 += b * b;
        }
      }
      const mr = sr / n;
      const mg = sg / n;
      const mb = sb / n;
      const vr = sr2 / n - mr * mr;
      const vg = sg2 / n - mg * mg;
      const vb = sb2 / n - mb * mb;
      const v = Math.sqrt(Math.max(0, vr + vg + vb));
      // Skip flat/uniform blocks (sky, white card areas) — they cause false matches
      if (v < 6) continue;
      blocks.push({ x, y, r: mr, g: mg, b: mb, v });
    }
  }

  // Bucket by quantized mean color
  const q = 6;
  const buckets = new Map<string, Block[]>();
  for (const blk of blocks) {
    const key = `${Math.round(blk.r / q)}|${Math.round(blk.g / q)}|${Math.round(
      blk.b / q,
    )}`;
    let arr = buckets.get(key);
    if (!arr) {
      arr = [];
      buckets.set(key, arr);
    }
    arr.push(blk);
  }

  const matches: CopyMoveMatch[] = [];
  const used = new Set<string>();
  for (const arr of buckets.values()) {
    if (arr.length < 2) continue;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i];
        const b = arr[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) continue;
        if (
          Math.abs(a.r - b.r) > meanTol ||
          Math.abs(a.g - b.g) > meanTol ||
          Math.abs(a.b - b.b) > meanTol
        )
          continue;
        if (Math.abs(a.v - b.v) > varTol) continue;
        const key = `${a.x},${a.y}-${b.x},${b.y}`;
        if (used.has(key)) continue;
        used.add(key);
        matches.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, size: blockSize });
        if (matches.length >= maxMatches) {
          return { matches };
        }
      }
    }
  }
  return { matches };
}

function buildCopyMoveOverlay(
  original: ImageData,
  matches: CopyMoveMatch[],
): string {
  const w = original.width;
  const h = original.height;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d")!;
  ctx.putImageData(original, 0, 0);

  ctx.lineWidth = Math.max(2, Math.round(Math.min(w, h) / 500));
  ctx.strokeStyle = "rgba(255, 200, 0, 0.95)";
  ctx.fillStyle = "rgba(255, 200, 0, 0.18)";
  for (const m of matches) {
    ctx.fillRect(m.ax, m.ay, m.size, m.size);
    ctx.fillRect(m.bx, m.by, m.size, m.size);
    ctx.strokeRect(m.ax, m.ay, m.size, m.size);
    ctx.strokeRect(m.bx, m.by, m.size, m.size);
    ctx.beginPath();
    ctx.moveTo(m.ax + m.size / 2, m.ay + m.size / 2);
    ctx.lineTo(m.bx + m.size / 2, m.by + m.size / 2);
    ctx.stroke();
  }
  return c.toDataURL("image/png");
}

export async function analyzeImage(
  img: HTMLImageElement,
): Promise<AnalysisResult> {
  const { w, h } = fitDimensions(img.naturalWidth, img.naturalHeight);
  const { elaData, original } = await computeELA(img, w, h);

  const elaUrl = elaToVisualization(elaData);
  const noiseUrl = noiseFromOriginal(original);
  const { url: anomalyOverlayUrl, ratio: anomalyRatio } = buildAnomalyOverlay(
    original,
    elaData,
  );

  const { matches } = detectCopyMove(original);
  const copyMoveOverlayUrl = buildCopyMoveOverlay(original, matches);

  const elaScore = Math.min(60, anomalyRatio * 800);
  const cmScore = Math.min(40, matches.length * 4);
  const score = Math.round(Math.min(100, elaScore + cmScore));

  return {
    elaUrl,
    noiseUrl,
    anomalyOverlayUrl,
    copyMoveOverlayUrl,
    anomalyRatio,
    copyMoveMatches: matches.length,
    score,
    width: w,
    height: h,
  };
}
