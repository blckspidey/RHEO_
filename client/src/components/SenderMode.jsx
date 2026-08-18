/**
 * RHEO — Sender Mode Component (Multi-Peer Selection Flow)
 *
 * Flow:
 * 1. User sees clean white & transparent green circular Radar.
 * 2. User taps one or more peers to select them (showing checkmarks).
 * 3. User clicks the prominent "Send Files" button below the radar.
 * 4. Native file picker opens -> selected file streams to all chosen recipients!
 * 5. Shows active transfers & top 3 recent completed transfers.
 */
import { useState, useRef } from 'react';
import { useTransfer } from '../contexts/TransferContext';
import RadarScanner from './RadarScanner';
import TransferCard from './TransferCard';

export default function SenderMode() {
  const { transfers, sendFile, clearAbortedTransfers } = useTransfer();

  const [recipients, setRecipients] = useState([]);
  const [sending, setSending]       = useState(false);
  const [sendError, setSendError]   = useState('');

  const fileInputRef = useRef(null);

  // Toggle selection for multiple peers
  const toggleRecipient = (peer) => {
    setRecipients(prev =>
      prev.some(r => r.id === peer.id)
        ? prev.filter(r => r.id !== peer.id)
        : [...prev, peer]
    );
    setSendError('');
  };

  // When user clicks the prominent Send Files button:
  const handlePromptFilePicker = () => {
    if (recipients.length === 0) return;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  // Once a file is chosen from the native file dialog:
  const handleFileChosen = async (e) => {
    const file = e.target.files?.[0];
    if (!file || recipients.length === 0) return;

    setSending(true);
    setSendError('');
    try {
      const usernameMap = {};
      recipients.forEach(r => { usernameMap[r.id] = r.username; });
      await sendFile(file, recipients.map(r => r.id), usernameMap);
      setRecipients([]); // Reset selection after starting transfer
    } catch (err) {
      setSendError(err.message);
    } finally {
      setSending(false);
    }
  };

  // Filter transfers to only show outgoing transfers (sorted most recent & active first)
  const transferList = Array.from(transfers.values());
  const mySentTransfers = transferList
    .filter(t => t.direction === 'sending')
    .sort((a, b) => {
      const statusOrder = { TRANSFERRING: 0, ACCEPTED: 1, PENDING: 2, PAUSED: 3, COMPLETED: 4, FAILED: 5, CANCELLED: 6 };
      const orderA = statusOrder[a.status] ?? 99;
      const orderB = statusOrder[b.status] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      return (new Date(b.createdAt || b.updatedAt || 0)) - (new Date(a.createdAt || a.updatedAt || 0));
    });

  const activeSends = mySentTransfers.filter(t => ['PENDING', 'ACCEPTED', 'TRANSFERRING', 'PAUSED'].includes(t.status));
  const completedSends = mySentTransfers.filter(t => ['COMPLETED', 'CANCELLED', 'FAILED', 'REJECTED'].includes(t.status));
  const recentCompletedSends = completedSends.slice(0, 3);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-fade-in max-w-6xl mx-auto">
      {/* Hidden native file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChosen}
      />

      {/* ── Left Column: Clean White & Transparent Green Circular Radar ────── */}
      <div className="lg:col-span-6 space-y-6">
        <div className="card-clean p-5 sm:p-7 space-y-4 bg-white shadow-sm border border-slate-200/90 rounded-3xl">
          <div className="text-center space-y-1">
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
              Select Device(s) & Send
            </h2>
            <p className="text-xs text-slate-500">
              Tap one or multiple users on the radar, then click Send to stream files.
            </p>
          </div>

          {/* Clean White + Transparent Green Circular Radar */}
          <RadarScanner
            selected={recipients}
            onToggle={toggleRecipient}
            onSendFiles={handlePromptFilePicker}
          />

          {/* Error display */}
          {sendError && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-center gap-2">
              <span>⚠️</span>
              <span>{sendError}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Right Column: Live Transfers & History ─────────────────────────── */}
      <div className="lg:col-span-6 space-y-6">
        {/* Active Outgoing Streams */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <span>Active Transfers</span>
              {activeSends.length > 0 && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                  {activeSends.length} active
                </span>
              )}
            </h3>
            {activeSends.length > 0 && (
              <button
                onClick={clearAbortedTransfers}
                className="text-xs font-bold text-slate-500 hover:text-red-600 transition-colors flex items-center gap-1 cursor-pointer"
                title="Clear all pending or stuck streams"
              >
                🧹 Clear Inactive
              </button>
            )}
          </div>

          {activeSends.length === 0 ? (
            <div className="card-clean p-8 text-center text-slate-400 space-y-2 border-dashed rounded-3xl bg-slate-50/50">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-sm font-bold text-slate-700">No active transfers</p>
              <p className="text-xs text-slate-400">Select users on the radar and click Send to stream files.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeSends.map(t => <TransferCard key={t.transferId} transfer={t} />)}
            </div>
          )}
        </div>

        {/* Recent Outgoing History (Past 3 Records) */}
        {recentCompletedSends.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-700 flex items-center gap-2">
                <span>Recent Outgoing Transfers</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold">
                  Top 3
                </span>
              </h3>
            </div>
            <div className="space-y-3">
              {recentCompletedSends.map(t => <TransferCard key={t.transferId} transfer={t} />)}
            </div>

            {completedSends.length > 3 && (
              <p className="text-center text-xs text-slate-500 font-semibold pt-1">
                Showing recent 3 of {completedSends.length} sent files · Full history saved in profile
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
