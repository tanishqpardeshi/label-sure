export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per SRS Section 11.1 / VAL-02
export const ACCEPTED_IMAGE_FORMATS = ['JPG', 'PNG', 'WEBP'] as const;
export const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export interface ImageValidationResult {
  valid: boolean;
  detectedFormat?: 'JPEG' | 'PNG' | 'WEBP';
  errorCode?: 'ERR-01';
  errorMessage?: string;
  guidance?: string;
}

/**
 * Inspects binary magic bytes to prevent spoofed file extensions or corrupt uploads (VAL-01 / VAL-03).
 */
export function detectImageMagicFormat(bytes: Uint8Array): 'JPEG' | 'PNG' | 'WEBP' | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'JPEG';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'PNG';
  }

  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'WEBP';
  }

  return null;
}

export function decodeBase64ToBytes(base64OrDataUrl: string): Uint8Array {
  const clean = base64OrDataUrl.replace(/^data:[^;]+;base64,/, '').trim();
  if (!clean) return new Uint8Array(0);

  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(clean, 'base64'));
  }

  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

/**
 * Validates file name, MIME type, byte size (<= 10 MB), and actual magic bytes (VAL-01..VAL-04).
 */
export function validateImageBuffer(params: {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  maxBytes?: number;
}): ImageValidationResult {
  const { fileName, mimeType, bytes, maxBytes = MAX_IMAGE_SIZE_BYTES } = params;

  if (!bytes || bytes.length === 0) {
    return {
      valid: false,
      errorCode: 'ERR-01',
      errorMessage: `ERR-01: Uploaded file "${fileName || 'unknown'}" is empty (0 bytes).`,
      guidance: 'Select a valid, non-empty JPG, PNG, or WEBP package image (max 10 MB).',
    };
  }

  if (bytes.length > maxBytes) {
    const sizeMb = (bytes.length / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      errorCode: 'ERR-01',
      errorMessage: `ERR-01: File "${fileName}" (${sizeMb} MB) exceeds the 10 MB per-image upload limit (VAL-02).`,
      guidance: 'Compress or resize the package image below 10 MB and retry.',
    };
  }

  const lowerName = (fileName || '').toLowerCase();
  const hasAllowedExt =
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.png') ||
    lowerName.endsWith('.webp');

  const normalizedMime = (mimeType || '').toLowerCase();
  const hasAllowedMime =
    normalizedMime === '' ||
    normalizedMime === 'image/jpeg' ||
    normalizedMime === 'image/jpg' ||
    normalizedMime === 'image/png' ||
    normalizedMime === 'image/webp';

  if (!hasAllowedExt && !hasAllowedMime) {
    return {
      valid: false,
      errorCode: 'ERR-01',
      errorMessage: `ERR-01: Unsupported file format for "${fileName}" (${mimeType || 'unknown'}).`,
      guidance: 'Only JPG, PNG, and WEBP package images are accepted (VAL-01).',
    };
  }

  const magic = detectImageMagicFormat(bytes);
  if (!magic) {
    return {
      valid: false,
      errorCode: 'ERR-01',
      errorMessage: `ERR-01: File "${fileName}" failed image signature verification (corrupt payload or non-image content, VAL-03).`,
      guidance: 'Upload a genuine, uncorrupted JPG, PNG, or WEBP photograph of the package label.',
    };
  }

  return {
    valid: true,
    detectedFormat: magic,
  };
}

/**
 * Browser-side safe decode readability check (VAL-04) ensuring Chromium/browser can decode pixels.
 */
export async function verifyBrowserImageDecode(file: File): Promise<{
  readable: boolean;
  widthPx?: number;
  heightPx?: number;
  errorMessage?: string;
}> {
  if (typeof window === 'undefined' || typeof Image === 'undefined') {
    return { readable: true };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        } else {
          reject(new Error('Image decoded with zero dimensions'));
        }
      };
      img.onerror = () => reject(new Error('Corrupt or unreadable image bitstream'));
      img.src = objectUrl;
    });

    return {
      readable: true,
      widthPx: dimensions.width,
      heightPx: dimensions.height,
    };
  } catch (err) {
    return {
      readable: false,
      errorMessage: `ERR-01: Image "${file.name}" could not be safely decoded (${err instanceof Error ? err.message : 'corrupt bitstream'}).`,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
