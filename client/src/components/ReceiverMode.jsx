/**
 * RHEO — Minimal Receiver Mode Component
 *
 * Ultra-clean, minimal receiver dashboard:
 * - Active receiving stream cards (prioritized at the top of the list).
 * - Received files history displaying top 3 recent records with 1-click Save/Download.
 */
import { useAuth } from '../contexts/AuthContext';
import { useTransfer } from '../contexts/TransferContext';
import TransferCard from './TransferCard';
import Avatar, { getDefaultAvatar } from './Avatar';

export default function ReceiverMode() {
  const { user } = useAuth();
  const {
    transfers,
    pendingRequests,
    acceptTransfer,
    rejectTransfer,
    autoAccept,
    toggleAutoAccept,
    clearAbortedTransfers,
  } = useTransfer();

  const transferList = Array.from(transfers.values());
  const incomingTransfers = transferList
    .filter(t => t.direction === 'receiving')
    .sort((a, b) => {
      const statusOrder = { TRANSFERRING: 0, ACCEPTED: 1, PENDING: 2, PAUSED: 3, COMPLETED: 4, FAILED: 5, CANCELLED: 6 };
      const orderA = statusOrder[a.status] ?? 99;
      const orderB = statusOrder[b.status] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      return (new Date(b.createdAt || b.updatedAt || 0)) - (new Date(a.createdAt || a.updatedAt || 0));
    });

  const activeReceives = incomingTransfers.filter(t => ['PENDING', 'ACCEPTED', 'TRANSFERRING', 'PAUSED'].includes(t.status));
  const completedReceives = incomingTransfers.filter(t => ['COMPLETED', 'CANCELLED', 'FAILED', 'REJECTED', 'INTERRUPTED'].includes(t.status));
  const recentCompletedReceives = completedReceives.slice(0, 3);

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto px-2 sm:px-4">
      {/* ── Minimal Header Card ─────────────────────────────────────────── */}
      <div className="card-clean p-5 sm:p-6 bg-white border border-slate-200/90 shadow-sm rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="relative flex-shrink-0">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-800 shadow-xs">
              <Avatar avatarId={getDefaultAvatar(user?.username)} name={user?.username} size="sm" className="!w-9 !h-9 text-sm font-black" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white shadow-xs" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 truncate">
                Ready to Receive
              </h2>
              <span className="text-[11px] font-bold font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                @{user?.username}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Keep this screen open to receive files over the local network / cloud.
            </p>
          </div>
        </div>

        {/* Auto-accept toggle switch */}
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200/80 px-3.5 py-2 rounded-2xl flex-shrink-0 w-full sm:w-auto justify-between sm:justify-start">
          <span className="text-xs font-bold text-slate-700">
            Auto-Accept: <span className={autoAccept ? 'text-emerald-700 font-extrabold' : 'text-slate-500'}>{autoAccept ? 'ON' : 'OFF'}</span>
          </span>
          <button
            onClick={() => toggleAutoAccept()}
            title={autoAccept ? 'Disable Auto-Accept' : 'Enable Auto-Accept'}
            className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 cursor-pointer ${
              autoAccept ? 'bg-emerald-600' : 'bg-slate-300'
            }`}
          >
            <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
              autoAccept ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        </div>
      </div>

      {/* ── Pending Requests (Only when Auto-Accept is OFF) ───────────────── */}
      {!autoAccept && pendingRequests.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-extrabold text-amber-900 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
            Incoming Transfer Requests ({pendingRequests.length})
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pendingRequests.map(req => (
              <div key={req.transferId} className="card-clean p-4 space-y-3 border-amber-200 bg-amber-50/40 rounded-2xl shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={req.senderUsername} size="sm" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">@{req.senderUsername}</p>
                      <p className="text-[11px] text-slate-500 truncate">{req.fileName}</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold font-mono px-2 py-0.5 bg-white border border-slate-200 rounded-lg flex-shrink-0">
                    {req.fileSize}
                  </span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => rejectTransfer(req.transferId)}
                    className="btn-danger flex-1 py-1.5 text-xs font-bold rounded-xl cursor-pointer"
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => acceptTransfer(req.transferId)}
                    className="btn-teal flex-1 py-1.5 text-xs font-bold rounded-xl shadow-md shadow-teal-600/15 cursor-pointer"
                  >
                    Accept
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Active Receiving Transfers (Always on TOP) ─────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <span>Active Receiving</span>
            {activeReceives.length > 0 && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                {activeReceives.length} active
              </span>
            )}
          </h3>
          {activeReceives.length > 0 && (
            <button
              onClick={clearAbortedTransfers}
              className="text-xs font-bold text-slate-500 hover:text-red-600 transition-colors flex items-center gap-1 cursor-pointer"
              title="Clear all pending or stuck streams"
            >
              🧹 Clear Inactive
            </button>
          )}
        </div>

        {activeReceives.length === 0 ? (
          <div className="card-clean p-8 text-center text-slate-400 border-dashed rounded-3xl bg-slate-50/50 space-y-1.5">
            <p className="text-sm font-bold text-slate-700">No active incoming transfers</p>
            <p className="text-xs text-slate-400">When someone sends you a file, live speed and download progress will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeReceives.map(t => <TransferCard key={t.transferId} transfer={t} />)}
          </div>
        )}
      </div>

      {/* ── Recent Completed History (Past 3 Records) ─────────────────────── */}
      {recentCompletedReceives.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-700 flex items-center gap-2">
              <span>Recent Received Files</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold">
                Top 3
              </span>
            </h3>
          </div>
          <div className="space-y-3">
            {recentCompletedReceives.map(t => <TransferCard key={t.transferId} transfer={t} />)}
          </div>

          {completedReceives.length > 3 && (
            <p className="text-center text-xs text-slate-500 font-semibold pt-1">
              Showing recent 3 of {completedReceives.length} received files · Full history saved in profile
            </p>
          )}
        </div>
      )}
    </div>
  );
}
