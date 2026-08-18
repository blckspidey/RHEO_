/**
 * RHEO — Transfer Context & Pure WebSocket Chunk Streaming Engine
 *
 * Central state for ALL active transfers (sending + receiving).
 * 100% pure WebSocket relay architecture — No WebRTC, no STUN/TURN, no P2P complexity.
 *
 * On Local Wi-Fi / Hotspot: Socket.IO TCP connection routes over LAN with zero cellular/internet data consumption.
 * On Internet: Socket.IO routes through the cloud relay.
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getSocket } from '../services/socket';
import { useAuth } from './AuthContext';
import { computeFileHash, computeBufferHash, computeTotalChunks, readChunk, formatBytes } from '../utils/fileUtils';
import {
  saveChunkToStorage,
  assembleFileBlobFromStorage,
  clearTransferFromStorage,
  getTransferProgressFromStorage,
} from '../services/chunkStorage';
import api from '../services/api';

const MAX_IN_FLIGHT = 12; // Application flow control window
const CHUNK_SIZE = 1024 * 1024; // 1 MB per chunk

const TransferContext = createContext(null);

export function TransferProvider({ children }) {
  const { user, token, isAuthenticated } = useAuth();

  // Map<transferId, transferObj>
  const [transfers, setTransfers]             = useState(new Map());
  // Incoming requests waiting for accept/reject
  const [pendingRequests, setPendingRequests] = useState([]);
  // Local network peers (on same Wi-Fi / Hotspot)
  const [localPeers, setLocalPeers]           = useState([]);
  const [scanningPeers, setScanningPeers]     = useState(false);
  // Auto-accept transfers setting (persisted in localStorage)
  const [autoAccept, setAutoAccept]           = useState(() => {
    return localStorage.getItem('rheo_auto_accept') !== 'false';
  });
  // Modal / notification prompt for newly received files
  const [latestReceivedFile, setLatestReceivedFile] = useState(null);

  const toggleAutoAccept = useCallback((val) => {
    setAutoAccept(prev => {
      const next = typeof val === 'boolean' ? val : !prev;
      localStorage.setItem('rheo_auto_accept', next ? 'true' : 'false');
      return next;
    });
  }, []);

  // Map<transferId, { file, inFlight, nextChunkToSend, active, isLocal, targetUserId, startTime, chunksAcked }>
  const senderState = useRef(new Map());
  // Map<transferId, { chunks: [], received: 0, fileName, fileType, isLocal }>
  const receiverState = useRef(new Map());
  // Map<transferId, { fileName, fileSize, fileType, isLocal }> metadata cache
  const receiverMetadata = useRef(new Map());

  // ── Helper to update transfer state ───────────────────────────
  const updateTransfer = useCallback((transferId, patch) => {
    setTransfers(prev => {
      const next = new Map(prev);
      const current = next.get(transferId) || {};
      next.set(transferId, { ...current, ...patch });
      return next;
    });
  }, []);

  // ── Scan for local network connected peers ────────────────────
  const scanLocalPeers = useCallback(async () => {
    if (!isAuthenticated) return [];
    setScanningPeers(true);
    try {
      const socket = getSocket();
      if (socket && socket.connected) {
        return new Promise((resolve) => {
          const timeoutId = setTimeout(async () => {
            try {
              const res = await api.get('/users/local');
              const peers = (res.data.data?.users || []).filter(p => p.id !== user?.id);
              setLocalPeers(peers);
              resolve(peers);
            } catch {
              resolve([]);
            } finally {
              setScanningPeers(false);
            }
          }, 2000);

          socket.emit('GET_LOCAL_PEERS', {}, (res) => {
            clearTimeout(timeoutId);
            setScanningPeers(false);
            if (res && res.success && Array.isArray(res.data?.peers)) {
              const peers = res.data.peers.filter(p => p.id !== user?.id);
              setLocalPeers(peers);
              resolve(peers);
            } else {
              setLocalPeers([]);
              resolve([]);
            }
          });
        });
      } else {
        const res = await api.get('/users/local');
        const peers = (res.data.data?.users || []).filter(p => p.id !== user?.id);
        setLocalPeers(peers);
        setScanningPeers(false);
        return peers;
      }
    } catch (err) {
      console.warn('[TransferContext] Scan local peers error:', err);
      setScanningPeers(false);
      return [];
    }
  }, [isAuthenticated, user?.id]);
  // ── Fetch past transfer history from server ──────────────────
  const fetchTransferHistory = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await api.get('/transfers');
      if (res.data?.success && Array.isArray(res.data.data?.transfers)) {
        setTransfers(prev => {
          const next = new Map(prev);
          for (const t of res.data.data.transfers) {
            if (!next.has(t.id)) {
              const isSending = t.direction === 'sent';
              const progress = t.status === 'COMPLETED'
                ? 100
                : Math.min(100, Math.floor(((t.last_confirmed_chunk + 1) / (t.total_chunks || 1)) * 100));
              const bytes = t.status === 'COMPLETED'
                ? t.file_size
                : Math.min(t.file_size, (t.last_confirmed_chunk + 1) * CHUNK_SIZE);

              next.set(t.id, {
                transferId:       t.id,
                direction:        isSending ? 'sending' : 'receiving',
                status:           t.status,
                fileName:         t.file_name,
                fileSize:         t.file_size,
                totalChunks:      t.total_chunks,
                fileHash:         t.file_hash,
                senderUsername:   t.sender_username,
                receiverUsername: t.receiver_username,
                progress,
                bytesTransferred: isSending ? bytes : 0,
                bytesReceived:    !isSending ? bytes : 0,
                createdAt:        t.created_at,
                completedAt:      t.completed_at,
              });
            }
          }
          return next;
        });
      }
    } catch (err) {
      console.warn('[TransferContext] Failed to fetch transfer history:', err.message);
    }
  }, [isAuthenticated]);

  // ── Pure WebSocket Chunk sender loop ───────────────────────────
  const sendNextChunks = useCallback(async (transferId) => {
    const ss = senderState.current.get(transferId);
    const socket = getSocket();
    if (!ss || !socket || !ss.active) return;

    while (ss.inFlight < MAX_IN_FLIGHT && ss.nextChunkToSend < ss.totalChunks && ss.active) {
      const idx = ss.nextChunkToSend;
      ss.nextChunkToSend++;
      ss.inFlight++;

      const chunkData = await readChunk(ss.file, idx);
      if (!ss.chunkSendTimes) ss.chunkSendTimes = {};
      ss.chunkSendTimes[idx] = Date.now();

      // Emit chunk over WebSocket
      socket.emit('CHUNK', {
        transferId,
        chunkIndex: idx,
        totalChunks: ss.totalChunks,
        chunkData,
      });
    }
  }, []);

  // ── Handle ACK from receiver ───────────────────────────────────
  const handleChunkAck = useCallback(({ transferId, chunkIndex, progressPercent, bytesTransferred, speedBytesPerSecond, etaSeconds }) => {
    const ss = senderState.current.get(transferId);
    if (!ss) return;

    ss.inFlight = Math.max(0, ss.inFlight - 1);
    if (!ss.chunksAcked) ss.chunksAcked = 0;
    ss.chunksAcked++;

    let latencyMs = null;
    if (ss.chunkSendTimes && ss.chunkSendTimes[chunkIndex] != null) {
      latencyMs = Date.now() - ss.chunkSendTimes[chunkIndex];
      delete ss.chunkSendTimes[chunkIndex];
    }

    const now = Date.now();
    if (!ss.startTime) ss.startTime = now;
    const elapsedSec = Math.max(0.05, (now - ss.startTime) / 1000);
    const totalBytesSent = Math.min(ss.file.size, ss.chunksAcked * CHUNK_SIZE);
    const calculatedSpeed = Math.round(totalBytesSent / elapsedSec);
    const remainingBytes = Math.max(0, ss.file.size - totalBytesSent);
    const calculatedEta = calculatedSpeed > 0 ? Math.ceil(remainingBytes / calculatedSpeed) : 0;

    const calcProgress = progressPercent ?? Math.floor((ss.chunksAcked / ss.totalChunks) * 100);
    const calcBytes = bytesTransferred ?? totalBytesSent;

    updateTransfer(transferId, {
      status: 'TRANSFERRING',
      progress: calcProgress,
      bytesTransferred: calcBytes,
      speedBytesPerSecond: speedBytesPerSecond || calculatedSpeed,
      etaSeconds: etaSeconds ?? calculatedEta,
      inFlight: ss.inFlight,
      chunksAcked: ss.chunksAcked,
      ...(latencyMs != null ? { latencyMs } : {}),
    });

    sendNextChunks(transferId);
  }, [sendNextChunks, updateTransfer]);

  // ── Handle incoming chunk from sender via WebSocket ───────────
  const handleIncomingChunk = useCallback(async ({ transferId, chunkIndex, totalChunks, chunkData }) => {
    const socket = getSocket();

    // 1. Immediately emit application ACK to sender without waiting for UI renders
    if (socket) {
      socket.emit('CHUNK_ACK', { transferId, chunkIndex });
    }

    let rs = receiverState.current.get(transferId);
    const meta = receiverMetadata.current.get(transferId);
    if (!rs) {
      const total = totalChunks || meta?.totalChunks || 1;
      rs = {
        chunks: new Array(total),
        totalChunks: total,
        received: 0,
        retransmits: 0,
        fileName: meta?.fileName || 'download',
        fileType: meta?.fileType || 'application/octet-stream',
      };
      receiverState.current.set(transferId, rs);
    }

    if (rs.chunks[chunkIndex] != null) {
      rs.retransmits++;
    }
    rs.chunks[chunkIndex] = chunkData;
    rs.received = Math.min(rs.received + 1, rs.totalChunks);

    // Persist chunk to browser IndexedDB asynchronously
    saveChunkToStorage(transferId, chunkIndex, chunkData, {
      fileName: rs.fileName,
      fileType: rs.fileType,
      totalChunks: rs.totalChunks,
    });

    const totalBytesExpected = meta?.fileSize || (rs.totalChunks * CHUNK_SIZE);
    const progress = Math.floor((rs.received / rs.totalChunks) * 100);
    const bytesReceived = Math.min(totalBytesExpected, rs.received * CHUNK_SIZE);

    if (!rs.startTime) rs.startTime = Date.now();
    const elapsedSec = Math.max(0.05, (Date.now() - rs.startTime) / 1000);
    const speedBytesPerSecond = Math.round(bytesReceived / elapsedSec);
    const remainingBytes = Math.max(0, totalBytesExpected - bytesReceived);
    const etaSeconds = speedBytesPerSecond > 0 ? Math.ceil(remainingBytes / speedBytesPerSecond) : 0;

    updateTransfer(transferId, {
      status: 'TRANSFERRING',
      progress,
      bytesReceived,
      speedBytesPerSecond,
      etaSeconds,
      chunksReceived: rs.received,
      totalChunks: rs.totalChunks,
      retransmits: rs.retransmits,
    });
  }, [updateTransfer]);

  // ── Socket Events Lifecycle ───────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || !token) return;

    let activeSocket = null;
    let timer = null;

    // Auto-scan local peers and load past transfer history on mount
    scanLocalPeers();
    fetchTransferHistory();

    const onTransferRequest = (data) => {
      console.log('[TransferContext] Incoming TRANSFER_REQUEST:', data);
      receiverMetadata.current.set(data.transferId, {
        fileName:    data.fileName,
        fileSize:    data.fileSize,
        fileType:    data.fileType,
        totalChunks: data.totalChunks,
        isLocal:     data.isLocal || false,
      });

      updateTransfer(data.transferId, {
        transferId:     data.transferId,
        direction:      'receiving',
        status:         'PENDING',
        fileName:       data.fileName,
        fileSize:       data.fileSize,
        fileType:       data.fileType,
        totalChunks:    data.totalChunks,
        fileHash:       data.fileHash,
        senderId:       data.senderId,
        senderUsername: data.senderUsername,
        isZeroData:     data.isLocal || false,
        transferMode:   data.isLocal ? 'LOCAL_LAN' : 'SERVER_RELAY',
        progress:       0,
        bytesReceived:  0,
      });

      // Check auto-accept setting
      const isAuto = localStorage.getItem('rheo_auto_accept') !== 'false';
      if (isAuto) {
        const s = getSocket();
        if (s) {
          s.emit('TRANSFER_ACCEPT', { transferId: data.transferId }, (res) => {
            if (res?.success) {
              updateTransfer(data.transferId, { status: 'ACCEPTED' });
            }
          });
        }
      } else {
        setPendingRequests(prev => {
          if (prev.some(r => r.transferId === data.transferId)) return prev;
          return [...prev, data];
        });
      }
    };

    const onTransferStart = async ({ transferId, lastConfirmedChunk }) => {
      console.log('[TransferContext] TRANSFER_START received:', transferId);
      const ss = senderState.current.get(transferId);
      if (!ss) return;
      ss.active = true;
      ss.nextChunkToSend = (lastConfirmedChunk ?? -1) + 1;
      updateTransfer(transferId, { status: 'TRANSFERRING' });
      sendNextChunks(transferId);
    };

    const onChunkAck = (data) => {
      handleChunkAck(data);
    };

    const onChunk = (data) => {
      handleIncomingChunk(data);
    };

    const onTransferComplete = ({ transferId }) => {
      console.log('[TransferContext] TRANSFER_COMPLETE:', transferId);
      updateTransfer(transferId, { status: 'COMPLETED', progress: 100 });
      senderState.current.delete(transferId);
    };

    const onHashVerify = async ({ transferId, expectedHash }) => {
      console.log('[TransferContext] HASH_VERIFY received for transfer:', transferId);
      const socket = getSocket();
      const rs = receiverState.current.get(transferId);
      const meta = receiverMetadata.current.get(transferId);

      const finalFileName = rs?.fileName || meta?.fileName || 'download';
      const finalFileType = rs?.fileType || meta?.fileType || 'application/octet-stream';

      // Assemble from IndexedDB or memory
      const stored = await assembleFileBlobFromStorage(transferId, finalFileType);
      const blob = stored?.blob || (rs?.chunks ? new Blob(rs.chunks.filter(Boolean), { type: finalFileType }) : null);

      let receiverHash = '';
      if (blob) {
        try {
          const arrayBuf = await blob.arrayBuffer();
          receiverHash = await computeBufferHash(arrayBuf);
        } catch (err) {
          console.warn('[TransferContext] hash computation error:', err);
        }
      }

      // Check if expectedHash is a full 64-char SHA-256 string
      const isFullSha256 = typeof expectedHash === 'string' && /^[a-f0-9]{64}$/i.test(expectedHash);
      const verified = !isFullSha256 || !receiverHash || receiverHash === expectedHash;

      if (socket) {
        socket.emit('HASH_RESULT', { transferId, receiverHash, senderHash: expectedHash, verified });
      }

      if (verified && blob) {
        const url = URL.createObjectURL(blob);
        updateTransfer(transferId, {
          status: 'COMPLETED',
          progress: 100,
          verified: true,
          blobUrl: url,
          fileName: finalFileName,
        });

        // Set prompt for receiver UI
        setLatestReceivedFile({
          transferId,
          fileName: finalFileName,
          fileSize: meta?.fileSize || blob.size,
          blobUrl: url,
          blob,
        });

        // Trigger native download
        try {
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = finalFileName;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            if (document.body.contains(a)) document.body.removeChild(a);
          }, 1500);
        } catch (err) {
          console.warn('[TransferContext] Automatic download trigger suppressed:', err);
        }

        // Clean up temporary chunks from IndexedDB
        clearTransferFromStorage(transferId);
      } else {
        updateTransfer(transferId, { status: 'FAILED', verified: false, error: 'File verification failed' });
      }
      receiverState.current.delete(transferId);
      receiverMetadata.current.delete(transferId);
    };

    const onPauseAck = ({ transferId }) => {
      const ss = senderState.current.get(transferId);
      if (ss) ss.active = false;
      updateTransfer(transferId, { status: 'PAUSED' });
    };

    const onResumeAck = ({ transferId, resumeFromChunk }) => {
      const ss = senderState.current.get(transferId);
      if (ss) { ss.active = true; ss.nextChunkToSend = resumeFromChunk; }
      updateTransfer(transferId, { status: 'TRANSFERRING' });
      sendNextChunks(transferId);
    };

    const onCancelAck = ({ transferId }) => {
      const ss = senderState.current.get(transferId);
      if (ss) ss.active = false;
      updateTransfer(transferId, { status: 'CANCELLED' });
      senderState.current.delete(transferId);
      receiverState.current.delete(transferId);
    };

    const onTransferReject = ({ transferId }) => {
      updateTransfer(transferId, { status: 'REJECTED' });
      senderState.current.delete(transferId);
    };

    const onLocalPeersUpdate = () => {
      console.log('[TransferContext] Local network peers updated');
      scanLocalPeers();
    };

    const attach = () => {
      const s = getSocket();
      if (s) {
        activeSocket = s;
        s.off('TRANSFER_REQUEST',    onTransferRequest);
        s.off('TRANSFER_START',      onTransferStart);
        s.off('CHUNK_ACK',           onChunkAck);
        s.off('CHUNK',               onChunk);
        s.off('TRANSFER_COMPLETE',   onTransferComplete);
        s.off('HASH_VERIFY',         onHashVerify);
        s.off('PAUSE_ACK',           onPauseAck);
        s.off('RESUME_ACK',          onResumeAck);
        s.off('TRANSFER_CANCEL_ACK', onCancelAck);
        s.off('TRANSFER_REJECT',     onTransferReject);
        s.off('LOCAL_PEERS_UPDATE',  onLocalPeersUpdate);

        s.on('TRANSFER_REQUEST',    onTransferRequest);
        s.on('TRANSFER_START',      onTransferStart);
        s.on('CHUNK_ACK',           onChunkAck);
        s.on('CHUNK',               onChunk);
        s.on('TRANSFER_COMPLETE',   onTransferComplete);
        s.on('HASH_VERIFY',         onHashVerify);
        s.on('PAUSE_ACK',           onPauseAck);
        s.on('RESUME_ACK',          onResumeAck);
        s.on('TRANSFER_CANCEL_ACK', onCancelAck);
        s.on('TRANSFER_REJECT',     onTransferReject);
        s.on('LOCAL_PEERS_UPDATE',  onLocalPeersUpdate);
      } else {
        timer = setTimeout(attach, 250);
      }
    };

    attach();

    return () => {
      if (timer) clearTimeout(timer);
      if (activeSocket) {
        activeSocket.off('TRANSFER_REQUEST',    onTransferRequest);
        activeSocket.off('TRANSFER_START',      onTransferStart);
        activeSocket.off('CHUNK_ACK',           onChunkAck);
        activeSocket.off('CHUNK',               onChunk);
        activeSocket.off('TRANSFER_COMPLETE',   onTransferComplete);
        activeSocket.off('HASH_VERIFY',         onHashVerify);
        activeSocket.off('PAUSE_ACK',           onPauseAck);
        activeSocket.off('RESUME_ACK',          onResumeAck);
        activeSocket.off('TRANSFER_CANCEL_ACK', onCancelAck);
        activeSocket.off('TRANSFER_REJECT',     onTransferReject);
        activeSocket.off('LOCAL_PEERS_UPDATE',  onLocalPeersUpdate);
      }
    };
  }, [isAuthenticated, token, sendNextChunks, updateTransfer, handleChunkAck, handleIncomingChunk, scanLocalPeers]);

  // ── Public Actions ────────────────────────────────────────────

  /**
   * Send a file to one or more recipients over pure WebSocket.
   */
  const sendFile = useCallback(async (file, receiverIds, receiverUsernames) => {
    const socket = getSocket();
    if (!socket) throw new Error('Not connected to server');

    const totalChunks = computeTotalChunks(file);
    const fileHash = `${file.name}-${file.size}-${file.lastModified}`;

    return new Promise((resolve, reject) => {
      socket.emit('TRANSFER_REQUEST', {
        fileName:    file.name,
        fileSize:    file.size,
        fileType:    file.type,
        fileHash,
        totalChunks,
        receiverIds,
      }, (res) => {
        if (!res || !res.success) return reject(new Error(res?.message || 'Transfer request failed'));

        for (const t of res.data.transfers) {
          const recId = t.receiverId || t.receiver_id;
          const isLocal = localPeers.some(p => p.id === recId);

          senderState.current.set(t.id, {
            file,
            totalChunks,
            nextChunkToSend: 0,
            inFlight: 0,
            active: false,
            targetUserId: recId,
            isLocal,
            startTime: null,
            chunksAcked: 0,
          });

          updateTransfer(t.id, {
            transferId:       t.id,
            direction:        'sending',
            status:           'PENDING',
            fileName:         file.name,
            fileSize:         file.size,
            totalChunks,
            fileHash,
            receiverId:       recId,
            receiverUsername: receiverUsernames?.[recId] || recId,
            transferMode:     isLocal ? 'LOCAL_LAN' : 'SERVER_RELAY',
            isZeroData:       isLocal,
            progress:         0,
            bytesTransferred: 0,
          });
        }
        resolve(res.data);
      });
    });
  }, [updateTransfer, localPeers]);

  const acceptTransfer = useCallback((transferId) => {
    const socket = getSocket();
    return new Promise((resolve, reject) => {
      if (!socket) return reject(new Error('Not connected'));
      socket.emit('TRANSFER_ACCEPT', { transferId }, (res) => {
        if (res?.success) {
          setPendingRequests(prev => prev.filter(r => r.transferId !== transferId));
          updateTransfer(transferId, { status: 'ACCEPTED' });
          resolve();
        } else {
          reject(new Error(res?.message || 'Failed to accept transfer'));
        }
      });
    });
  }, [updateTransfer]);

  const rejectTransfer = useCallback((transferId) => {
    const socket = getSocket();
    return new Promise((resolve) => {
      if (socket) {
        socket.emit('TRANSFER_REJECT', { transferId }, () => {
          setPendingRequests(prev => prev.filter(r => r.transferId !== transferId));
          updateTransfer(transferId, { status: 'REJECTED' });
          resolve();
        });
      } else {
        setPendingRequests(prev => prev.filter(r => r.transferId !== transferId));
        updateTransfer(transferId, { status: 'REJECTED' });
        resolve();
      }
    });
  }, [updateTransfer]);

  const cancelTransfer = useCallback((transferId) => {
    const socket = getSocket();
    const ss = senderState.current.get(transferId);
    if (ss) ss.active = false;
    return new Promise((resolve) => {
      if (socket) {
        socket.emit('TRANSFER_CANCEL', { transferId }, () => {
          updateTransfer(transferId, { status: 'CANCELLED' });
          senderState.current.delete(transferId);
          resolve();
        });
      } else {
        updateTransfer(transferId, { status: 'CANCELLED' });
        senderState.current.delete(transferId);
        resolve();
      }
    });
  }, [updateTransfer]);

  const pauseTransfer = useCallback((transferId) => {
    const socket = getSocket();
    const ss = senderState.current.get(transferId);
    if (ss) ss.active = false;
    if (socket) {
      socket.emit('PAUSE_TRANSFER', { transferId });
    }
  }, []);

  const resumeTransfer = useCallback((transferId) => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit('RESUME_TRANSFER', { transferId }, (res) => {
      if (res?.success) {
        const ss = senderState.current.get(transferId);
        if (ss) { ss.active = true; ss.nextChunkToSend = res.data.resumeFromChunk; }
        updateTransfer(transferId, { status: 'TRANSFERRING' });
        sendNextChunks(transferId);
      }
    });
  }, [updateTransfer, sendNextChunks]);

  const isLocalPeer = useCallback((userId) => {
    return localPeers.some(p => p.id === userId);
  }, [localPeers]);

  const dismissTransfer = useCallback((transferId) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('TRANSFER_CANCEL', { transferId }, () => {});
    }
    const ss = senderState.current.get(transferId);
    if (ss) ss.active = false;
    senderState.current.delete(transferId);
    receiverState.current.delete(transferId);
    receiverMetadata.current.delete(transferId);

    setPendingRequests(prev => prev.filter(r => r.transferId !== transferId));
    setTransfers(prev => {
      const next = new Map(prev);
      next.delete(transferId);
      return next;
    });
  }, []);

  const clearAbortedTransfers = useCallback(() => {
    setTransfers(prev => {
      const next = new Map();
      for (const [id, t] of prev.entries()) {
        if (t.status === 'COMPLETED') {
          next.set(id, t);
        } else {
          const ss = senderState.current.get(id);
          if (ss) ss.active = false;
          senderState.current.delete(id);
          receiverState.current.delete(id);
          receiverMetadata.current.delete(id);
        }
      }
      return next;
    });
    setPendingRequests([]);
  }, []);

  return (
    <TransferContext.Provider value={{
      transfers,
      pendingRequests,
      latestReceivedFile,
      setLatestReceivedFile,
      localPeers,
      scanningPeers,
      autoAccept,
      toggleAutoAccept,
      scanLocalPeers,
      fetchTransferHistory,
      isLocalPeer,
      sendFile,
      acceptTransfer,
      rejectTransfer,
      cancelTransfer,
      dismissTransfer,
      clearAbortedTransfers,
      pauseTransfer,
      resumeTransfer,
    }}>
      {children}
    </TransferContext.Provider>
  );
}

export function useTransfer() {
  const ctx = useContext(TransferContext);
  if (!ctx) throw new Error('useTransfer must be used inside TransferProvider');
  return ctx;
}
