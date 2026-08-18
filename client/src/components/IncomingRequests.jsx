/**
 * RHEO — Incoming Requests Modal
 * Displays floating notification when peers request to stream files to this device.
 */
import { useTransfer } from '../contexts/TransferContext';
import { formatBytes } from '../utils/fileUtils';
import Avatar from './Avatar';

export default function IncomingRequests() {
  const { pendingRequests, acceptTransfer, rejectTransfer } = useTransfer();

  if (!pendingRequests || pendingRequests.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full animate-slide-up">
      {pendingRequests.map((req) => (
        <div
          key={req.transferId}
          className="bg-white rounded-3xl p-5 border border-teal-200/90 shadow-2xl shadow-teal-900/10 space-y-4"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Avatar name={req.senderUsername} size="sm" />
              <div>
                <p className="text-xs font-bold text-slate-900 leading-none">@{req.senderUsername}</p>
                <p className="text-[10px] text-teal-600 font-semibold mt-0.5">Incoming File Stream</p>
              </div>
            </div>
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              Request
            </span>
          </div>

          {/* File details */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-extrabold text-slate-900 truncate">{req.fileName}</p>
              <p className="text-[11px] font-mono text-slate-500">{formatBytes(req.fileSize)}</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => rejectTransfer(req.transferId)}
              className="btn-danger flex-1 py-2 text-xs font-bold rounded-xl"
            >
              Decline
            </button>
            <button
              onClick={() => acceptTransfer(req.transferId)}
              className="btn-teal flex-1 py-2 text-xs font-bold rounded-xl shadow-md shadow-teal-500/20"
            >
              Accept Flow
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
