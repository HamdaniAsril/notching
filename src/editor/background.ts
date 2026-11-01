// Pictures for the editor's background: loaded, and shrunk to a JPEG data URL
// that goes into the doc, so a re-open does not depend on today's wallpaper.

const JPEG_QUALITY = 0.85;

// A picture's size fitted so its longest side is at most `max`; never enlarged.
export function fitSize(w: number, h: number, max: number): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

// `cors` asks for a picture the canvas may read back; the notchshot: scheme
// has to allow it.
export function loadImage(src: string, cors = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('picture did not load'));
    img.src = src;
  });
}

// Longest side at most `max` pixels. A transparent file goes on white, which
// JPEG cannot keep as clear.
export function toJpeg(img: HTMLImageElement, max: number): string {
  const { w, h } = fitSize(img.naturalWidth, img.naturalHeight, max);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context for the background');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

export async function wallpaperJpeg(url: string, max: number): Promise<string> {
  return toJpeg(await loadImage(url, true), max);
}

function readFile(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('file not read'));
    reader.readAsDataURL(file);
  });
}

export async function fileJpeg(file: Blob, max: number): Promise<string> {
  return toJpeg(await loadImage(await readFile(file)), max);
}
