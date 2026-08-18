/**
 * RHEO — Minimal Clean Transfer Card
 *
 * Displays only the essential details:
 * - File Name & Size
 * - Live Speed (e.g., 25.4 MB/s)
 * - ETA (e.g., 5s remaining)
 * - Clean progress bar & percentage
 * - Prominent Save File action & Pause / Resume / Cancel
 */
import { useTransfer } from '../contexts/TransferContext';
import { formatBytes, formatSpeed, formatEta } from '../utils/fileUtils';
import { assembleFileBlobFromStorage } from '../services/chunkStorage';

export default function TransferCard({ transfer }) {
  const { cancelTransfer, pauseTransfer, resumeTransfer, dismissTransfer } = useTransfer();
  const {
    transferId,
    direction,
    status,
    fileName,
    fileSize,
    progress = 0,
    bytesTransferred,
    bytesReceived,
    speedBytesPerSecond,
    etaSeconds,
    senderUsername,
    receiverUsername,
    error,
    blobUrl,
  } = transfer;

  const isSending = direction === 'sending';
  const isActive = status === 'TRANSFERRING' || status === 'ACCEPTED' || status === 'PAUSED';
  const peer = isSending ? receiverUsername : senderUsername;
  const bytes = isSending ? (bytesTransferred || 0) : (bytesReceived || 0);

  const handleDownload = async () => {
    if (blobUrl) {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName || 'download';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (document.body.contains(a)) document.body.removeChild(a);
      }, 1000);
      return;
    }

    try {
      const stored = await assembleFileBlobFromStorage(transferId);
      if (stored?.blob) {
        const url = URL.createObjectURL(stored.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName || stored.fileName || 'download';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          if (document.body.contains(a)) document.body.removeChild(a);
        }, 1000);
      }
    } catch (err) {
      console.warn('[TransferCard] Download error:', err);
    }
  };

  return (
    <div className="card-clean p-4 sm:p-5 space-y-3.5 bg-white border border-slate-200/90 shadow-sm rounded-2xl animate-slide-up transition-all hover:border-slate-300">
      {/* ── Top Row: File Info & Peer ────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>

          <div className="min-w-0">
            <p className="font-bold text-sm text-slate-900 truncate" title={fileName}>
              {fileName}
            </p>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              <span>{formatBytes(fileSize)}</span>
              <span className="mx-1.5 text-slate-300">·</span>
              <span className={`font-semibold ${isSending ? 'text-teal-700' : 'text-emerald-700'}`}>
                {isSending ? `To @${peer}` : `From @${peer}`}
              </span>
            </p>
          </div>
        </div>

        {/* Status Pill & Dismiss ✕ Button */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
            status === 'COMPLETED'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : status === 'PAUSED'
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : status === 'TRANSFERRING'
              ? 'bg-teal-50 text-teal-700 border-teal-200'
              : 'bg-slate-50 text-slate-600 border-slate-200'
          }`}>
            {status === 'TRANSFERRING' ? 'Streaming' : status === 'COMPLETED' ? 'Done' : status}
          </span>

          <button
            onClick={() => dismissTransfer(transferId)}
            className="w-6 h-6 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center text-xs font-bold transition-all cursor-pointer"
            title="Remove/Dismiss stream"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Progress Bar ─────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden relative">
          <div
            className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all duration-300 relative"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Progress & Transferred Bytes */}
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-slate-500 font-medium">
            {formatBytes(bytes)} of {formatBytes(fileSize)}
          </span>
          <span className="font-extrabold text-teal-700">{progress}%</span>
        </div>
      </div>

      {/* ── Live Essentials: Speed & ETA (Only while transferring) ────────── */}
      {isActive && status === 'TRANSFERRING' && (
        <div className="flex items-center justify-between bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-teal-800">
            <span className="text-sm">⚡</span>
            <span className="text-slate-500 font-sans text-[11px] font-bold">Speed:</span>
            <span className="font-extrabold">{speedBytesPerSecond ? formatSpeed(speedBytesPerSecond) : 'Calculating…'}</span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-700">
            <span className="text-sm">⏱</span>
            <span className="text-slate-500 font-sans text-[11px] font-bold">ETA:</span>
            <span className="font-extrabold">{etaSeconds != null ? formatEta(etaSeconds) : '—'}</span>
          </div>
        </div>
      )}

      {/* ── Error Notice ─────────────────────────────────────────────────── */}
      {error && (
        <p className="text-xs font-semibold text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-200">
          ⚠️ {error}
        </p>
      )}

      {/* ── Action Buttons ───────────────────────────────────────────────── */}
      {/* Complete Download / Save button for Receiver */}
      {!isSending && status === 'COMPLETED' && (
        <button
          onClick={handleDownload}
          className="btn-teal w-full py-2.5 text-xs font-extrabold rounded-xl flex items-center justify-center gap-2 shadow-sm cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Save {fileName || 'File'}
        </button>
      )}

      {/* Pause / Resume / Cancel for Sender */}
      {isActive && isSending && (
        <div className="flex gap-2 pt-0.5">
          {status === 'TRANSFERRING' ? (
            <button
              id={`pause-${transferId}`}
              onClick={() => pauseTransfer(transferId)}
              className="btn-ghost flex-1 text-xs py-2 rounded-xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              ⏸ Pause
            </button>
          ) : (
            <button
              id={`resume-${transferId}`}
              onClick={() => resumeTransfer(transferId)}
              className="btn-success flex-1 text-xs py-2 rounded-xl font-bold"
            >
              ▶ Resume
            </button>
          )}

          <button
            id={`cancel-${transferId}`}
            onClick={() => cancelTransfer(transferId)}
            className="btn-danger text-xs py-2 px-4 rounded-xl font-bold"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
