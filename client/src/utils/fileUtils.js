/**
 * DropShare Client — File Chunker Utility
 *
 * Splits a File object into ArrayBuffer chunks for transfer.
 * All chunking happens in the browser — no server involvement.
 *
 * Chunk size default: 1 MB (matches CHUNK_SIZE_BYTES on server).
 * Large chunks = fewer round-trips but more memory pressure.
 * Small chunks = more overhead but finer-grained resume granularity.
 */

const CHUNK_SIZE = 1024 * 1024; // 1 MB

/**
 * Compute total chunks needed for a file.
 * @param {File} file
 * @returns {number}
 */
export function computeTotalChunks(file) {
  return Math.ceil(file.size / CHUNK_SIZE);
}

/**
 * Read chunk N from a File as an ArrayBuffer.
 * Uses native async blob.arrayBuffer() for maximum performance.
 * @param {File} file
 * @param {number} chunkIndex - 0-based
 * @returns {Promise<ArrayBuffer>}
 */
export async function readChunk(file, chunkIndex) {
  const start = chunkIndex * CHUNK_SIZE;
  const end   = Math.min(start + CHUNK_SIZE, file.size);
  const blob  = file.slice(start, end);
  if (blob.arrayBuffer) {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e.target.error);
    reader.readAsArrayBuffer(blob);
  });
}

function rotr(x, n) {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

// Pure JS SHA-256 for environments where crypto.subtle is unavailable (HTTP / LAN / Mobile)
function sha256Pure(buffer) {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  let H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  const uint8 = new Uint8Array(buffer);
  const bitLength = uint8.length * 8;

  const newLength = ((uint8.length + 9 + 63) >>> 6) << 6;
  const padded = new Uint8Array(newLength);
  padded.set(uint8);
  padded[uint8.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(newLength - 4, bitLength >>> 0, false);
  view.setUint32(newLength - 8, Math.floor(bitLength / 0x100000000), false);

  const W = new Uint32Array(64);

  for (let i = 0; i < newLength; i += 64) {
    for (let t = 0; t < 16; t++) {
      W[t] = view.getUint32(i + t * 4, false);
    }
    for (let t = 16; t < 64; t++) {
      const s0 = (rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3)) >>> 0;
      const s1 = (rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10)) >>> 0;
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = H;

    for (let t = 0; t < 64; t++) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  return H.map(val => val.toString(16).padStart(8, '0')).join('');
}

/**
 * Compute SHA-256 hash of an ArrayBuffer.
 * Uses Web Crypto API when available, falls back to pure JS in insecure contexts (HTTP / LAN).
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string>} hex string
 */
export async function computeBufferHash(buffer) {
  if (typeof crypto !== 'undefined' && crypto?.subtle?.digest) {
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray  = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback below
    }
  }
  return sha256Pure(buffer);
}

/**
 * Compute SHA-256 hash of a File (fast non-blocking).
 * @param {File} file
 * @returns {Promise<string>} hex string
 */
export async function computeFileHash(file) {
  try {
    if (file.size <= 20 * 1024 * 1024 && typeof crypto !== 'undefined' && crypto?.subtle?.digest) {
      const buffer = await file.arrayBuffer();
      return await computeBufferHash(buffer);
    }
    // Fast sampling for large files to avoid UI thread freeze
    const sampleSize = 64 * 1024;
    const head = await file.slice(0, sampleSize).arrayBuffer();
    const tail = await file.slice(Math.max(0, file.size - sampleSize), file.size).arrayBuffer();
    const combined = new Uint8Array(head.byteLength + tail.byteLength);
    combined.set(new Uint8Array(head), 0);
    combined.set(new Uint8Array(tail), head.byteLength);
    return await computeBufferHash(combined.buffer);
  } catch (err) {
    console.warn('[fileUtils] Hash fallback:', err);
    return `${file.name}-${file.size}-${file.lastModified}`;
  }
}


/**
 * Format bytes to human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}

/**
 * Format speed to human-readable string.
 * @param {number} bytesPerSecond
 * @returns {string}
 */
export function formatSpeed(bytesPerSecond) {
  return `${formatBytes(bytesPerSecond)}/s`;
}

/**
 * Format ETA in seconds to human-readable string.
 * @param {number|null} seconds
 * @returns {string}
 */
export function formatEta(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60)  return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
