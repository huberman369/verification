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

export async function generateELA(
  img: HTMLImageElement,
  quality = 0.85,
  amplify = 18,
): Promise<string> {
  const { w, h } = fitDimensions(img.naturalWidth, img.naturalHeight);
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

    const out = ctx2.createImageData(w, h);
    const a = original.data;
    const b = re.data;
    const o = out.data;
    let max = 0;
    for (let i = 0; i < a.length; i += 4) {
      const dr = Math.abs(a[i] - b[i]);
      const dg = Math.abs(a[i + 1] - b[i + 1]);
      const db = Math.abs(a[i + 2] - b[i + 2]);
      if (dr > max) max = dr;
      if (dg > max) max = dg;
      if (db > max) max = db;
      o[i] = Math.min(255, dr * amplify);
      o[i + 1] = Math.min(255, dg * amplify);
      o[i + 2] = Math.min(255, db * amplify);
      o[i + 3] = 255;
    }
    ctx2.putImageData(out, 0, 0);
    return c2.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function generateNoiseMap(
  img: HTMLImageElement,
  amplify = 6,
): Promise<string> {
  const { w, h } = fitDimensions(img.naturalWidth, img.naturalHeight);
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const src = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  const s = src.data;
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
