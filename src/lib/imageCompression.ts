/**
 * Client-side image compression before upload to storage.
 *
 * Rationale: storage quota is the real cost driver (see tier limits).
 * Photos from phones/renders are 2-8 MB; resizing to max 1920px and
 * re-encoding to WebP typically cuts 70-85% with no visible loss.
 *
 * Non-image files (PDF, DWG, XLSX, ...) are returned untouched.
 * If anything fails, the ORIGINAL file is returned — compression must
 * never block an upload.
 */

const MAX_DIMENSION = 1920;
const QUALITY = 0.82;
/** Files below this size aren't worth re-encoding. */
const MIN_SIZE_BYTES = 200 * 1024;

const COMPRESSIBLE = ['image/jpeg', 'image/png', 'image/webp'];

export interface CompressedResult {
  /** File to upload (compressed or original). */
  file: File | Blob;
  /** Extension to use for the storage path. */
  ext: string;
  /** True when compression actually happened. */
  compressed: boolean;
  originalSize: number;
  finalSize: number;
}

function extFromType(type: string, fallback: string): string {
  if (type === 'image/webp') return 'webp';
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/png') return 'png';
  return fallback;
}

function supportsWebp(): boolean {
  try {
    const c = document.createElement('canvas');
    return c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image decode failed'));
    };
    img.src = url;
  });
}

export async function compressImage(file: File): Promise<CompressedResult> {
  const originalExt = (file.name.split('.').pop() || 'bin').toLowerCase();
  const passthrough: CompressedResult = {
    file,
    ext: originalExt,
    compressed: false,
    originalSize: file.size,
    finalSize: file.size,
  };

  if (!COMPRESSIBLE.includes(file.type)) return passthrough;
  if (file.size < MIN_SIZE_BYTES) return passthrough;

  try {
    const img = await loadImage(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return passthrough;
    ctx.drawImage(img, 0, 0, width, height);

    const targetType = supportsWebp() ? 'image/webp' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, targetType, QUALITY),
    );
    if (!blob || blob.size >= file.size) return passthrough;

    const ext = extFromType(targetType, originalExt);
    const baseName = file.name.replace(/\.[^.]+$/, '');
    const out = new File([blob], `${baseName}.${ext}`, { type: targetType });

    return {
      file: out,
      ext,
      compressed: true,
      originalSize: file.size,
      finalSize: out.size,
    };
  } catch {
    return passthrough;
  }
}

/** Human-readable saving, e.g. "4.2 MB → 620 KB (−85%)". */
export function describeSaving(r: CompressedResult): string | null {
  if (!r.compressed) return null;
  const fmt = (b: number) =>
    b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
  const pct = Math.round((1 - r.finalSize / r.originalSize) * 100);
  return `${fmt(r.originalSize)} → ${fmt(r.finalSize)} (−${pct}%)`;
}
