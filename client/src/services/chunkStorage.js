/**
 * RHEO — Persistent IndexedDB Chunk Storage Engine
 *
 * Persists received file chunks to browser IndexedDB so that:
 * 1. Page refreshes (F5), browser crashes, or tab closes DO NOT lose downloaded chunks.
 * 2. Transfers resume exactly from the last saved chunk index without re-downloading.
 * 3. Memory usage remains low even for large files (no RAM bloat).
 */

const DB_NAME = 'rheo_transfers_db';
const DB_VERSION = 1;
const CHUNK_STORE = 'chunks';
const META_STORE = 'metadata';

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        // Key: [transferId, chunkIndex]
        db.createObjectStore(CHUNK_STORE, { keyPath: ['transferId', 'chunkIndex'] });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        // Key: transferId
        db.createObjectStore(META_STORE, { keyPath: 'transferId' });
      }
    };

    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Save incoming chunk and update transfer metadata in IndexedDB.
 */
export async function saveChunkToStorage(transferId, chunkIndex, chunkData, meta = {}) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([CHUNK_STORE, META_STORE], 'readwrite');
      const chunkStore = tx.objectStore(CHUNK_STORE);
      const metaStore  = tx.objectStore(META_STORE);

      // Put chunk binary
      chunkStore.put({
        transferId,
        chunkIndex,
        data: chunkData,
        timestamp: Date.now(),
      });

      // Update metadata
      const metaReq = metaStore.get(transferId);
      metaReq.onsuccess = () => {
        const existing = metaReq.result || {};
        const receivedCount = (existing.receivedCount || 0) + 1;
        const highestChunk = Math.max(existing.highestChunk ?? -1, chunkIndex);

        metaStore.put({
          transferId,
          fileName:    meta.fileName || existing.fileName || 'download',
          fileSize:    meta.fileSize || existing.fileSize || 0,
          fileType:    meta.fileType || existing.fileType || 'application/octet-stream',
          totalChunks: meta.totalChunks || existing.totalChunks || 1,
          fileHash:    meta.fileHash || existing.fileHash || '',
          senderUsername: meta.senderUsername || existing.senderUsername || '',
          highestChunk,
          receivedCount,
          updatedAt: Date.now(),
        });
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[chunkStorage] saveChunk error:', err);
    return false;
  }
}

/**
 * Get the highest consecutive received chunk index for a transfer.
 */
export async function getTransferProgressFromStorage(transferId) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction([META_STORE], 'readonly');
      const store = tx.objectStore(META_STORE);
      const req = store.get(transferId);

      req.onsuccess = () => {
        const meta = req.result;
        if (!meta) return resolve(null);
        resolve(meta);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Assemble all chunks into a single Blob for final download.
 */
export async function assembleFileBlobFromStorage(transferId, fileType = 'application/octet-stream') {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([CHUNK_STORE, META_STORE], 'readonly');
      const chunkStore = tx.objectStore(CHUNK_STORE);
      const metaStore  = tx.objectStore(META_STORE);

      const metaReq = metaStore.get(transferId);
      metaReq.onsuccess = () => {
        const meta = metaReq.result;
        const total = meta?.totalChunks || 1;

        // Fetch all chunks for this transfer
        const chunks = new Array(total);
        const req = chunkStore.openCursor();

        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const row = cursor.value;
            if (row.transferId === transferId) {
              chunks[row.chunkIndex] = row.data;
            }
            cursor.continue();
          } else {
            // All chunks read
            const blob = new Blob(chunks, { type: meta?.fileType || fileType });
            resolve({ blob, fileName: meta?.fileName || 'download' });
          }
        };

        req.onerror = (e) => reject(e.target.error);
      };
      metaReq.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('[chunkStorage] assembleFileBlob error:', err);
    return null;
  }
}

/**
 * Clear stored chunks after download is complete.
 */
export async function clearTransferFromStorage(transferId) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction([CHUNK_STORE, META_STORE], 'readwrite');
      const chunkStore = tx.objectStore(CHUNK_STORE);
      const metaStore  = tx.objectStore(META_STORE);

      metaStore.delete(transferId);

      const req = chunkStore.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          if (cursor.value.transferId === transferId) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve(true);
        }
      };
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}
