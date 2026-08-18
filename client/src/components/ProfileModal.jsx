/**
 * RHEO — Profile, Avatar Customizer & Activity Modal
 * Opens when clicking on the user profile avatar in the floating navbar.
 */
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTransfer } from '../contexts/TransferContext';
import Avatar, { AVATAR_PRESETS } from './Avatar';
import TransferCard from './TransferCard';
import { formatBytes } from '../utils/fileUtils';

export default function ProfileModal({ isOpen, onClose, currentAvatar, onSelectAvatar }) {
  const { user, logout } = useAuth();
  const { transfers } = useTransfer();
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'activity' | 'network'
  const [historyFilter, setHistoryFilter] = useState('all'); // 'all' | 'sent' | 'received'
  const [copiedId, setCopiedId] = useState(false);

  if (!isOpen) return null;

  const transferList = Array.from(transfers.values());
  const completedTransfers = transferList.filter(t => ['COMPLETED', 'CANCELLED', 'FAILED', 'REJECTED', 'INTERRUPTED'].includes(t.status));
  const activeTransfers = transferList.filter(t => ['PENDING', 'ACCEPTED', 'TRANSFERRING', 'PAUSED'].includes(t.status));

  const filteredHistory = completedTransfers.filter(t => {
    if (historyFilter === 'sent') return t.direction === 'sending';
    if (historyFilter === 'received') return t.direction === 'receiving';
    return true;
  });

  const totalSentBytes = transferList
    .filter(t => t.direction === 'sending' && t.status === 'COMPLETED')
    .reduce((acc, t) => acc + (t.fileSize || 0), 0);

  const totalReceivedBytes = transferList
    .filter(t => t.direction === 'receiving' && t.status === 'COMPLETED')
    .reduce((acc, t) => acc + (t.fileSize || 0), 0);

  const handleCopyId = () => {
    if (user?.id) {
      navigator.clipboard.writeText(user.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
      {/* Modal Card */}
      <div className="w-full max-w-2xl bg-white rounded-3xl border border-slate-200/90 shadow-2xl shadow-slate-900/10 overflow-hidden flex flex-col max-h-[90vh] animate-slide-up">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-teal-500/10 text-teal-600 flex items-center justify-center font-bold text-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 leading-none">Account & Mesh Profile</h3>
              <p className="text-xs text-slate-500 mt-1">Manage avatar, connection identity, and activity</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation Pill */}
        <div className="px-6 pt-4 pb-2 border-b border-slate-100 bg-white">
          <div className="flex bg-slate-100 p-1 rounded-2xl gap-1">
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                activeTab === 'profile'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Identity & Avatar
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'activity'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Transfer History</span>
              {completedTransfers.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 bg-teal-100 text-teal-700 rounded-full font-bold">
                  {completedTransfers.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('network')}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                activeTab === 'network'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Mesh Node Stats
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* TAB 1: Profile & Avatar Selection */}
          {activeTab === 'profile' && (
            <div className="space-y-6 animate-fade-in">
              {/* User Identity Highlight Card */}
              <div className="bg-gradient-to-r from-teal-50/80 via-slate-50 to-cyan-50/80 rounded-2xl p-5 border border-teal-100/80 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Avatar avatarId={currentAvatar} name={user?.displayName || user?.username} size="xl" showRing />
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-lg font-extrabold text-slate-900">
                        {user?.displayName || user?.username}
                      </h4>
                      <span className="badge-online" />
                    </div>
                    <p className="text-xs font-semibold text-teal-700 font-mono">@{user?.username}</p>
                    <p className="text-[11px] text-slate-500 mt-1">{user?.email || 'Mesh Node Verified'}</p>
                  </div>
                </div>

                <div className="text-right flex flex-col items-end gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600 bg-teal-100/60 px-2.5 py-1 rounded-full border border-teal-200/50">
                    P2P Node Active
                  </span>
                  <button
                    onClick={handleCopyId}
                    className="text-[11px] text-slate-500 hover:text-teal-700 font-mono flex items-center gap-1 transition-colors mt-1"
                  >
                    <span>ID: {user?.id?.slice(0, 8)}…</span>
                    <span>{copiedId ? '✓ Copied' : '📋'}</span>
                  </button>
                </div>
              </div>

              {/* Avatar Selector Grid */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-slate-800">Choose Your Animal Identity</h4>
                  <span className="text-xs text-slate-400">Your mesh persona</span>
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {AVATAR_PRESETS.map(preset => {
                    const isSelected = currentAvatar === preset.id;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => onSelectAvatar(preset.id)}
                        title={preset.name}
                        className={`p-2 rounded-2xl border transition-all flex flex-col items-center gap-1 group ${
                          isSelected
                            ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-400/30 shadow-sm'
                            : 'border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50/30'
                        }`}
                      >
                        <span className="text-2xl leading-none">{preset.emoji}</span>
                        <span className={`text-[10px] font-bold truncate max-w-full ${
                          isSelected ? 'text-teal-700' : 'text-slate-500 group-hover:text-slate-800'
                        }`}>
                          {preset.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: Transfer History */}
          {activeTab === 'activity' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  {['all', 'sent', 'received'].map(f => (
                    <button
                      key={f}
                      onClick={() => setHistoryFilter(f)}
                      className={`px-3 py-1 text-xs font-semibold rounded-full capitalize transition-all ${
                        historyFilter === f
                          ? 'bg-teal-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-slate-400 font-medium">
                  {filteredHistory.length} Record{filteredHistory.length === 1 ? '' : 's'}
                </span>
              </div>

              {filteredHistory.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-2">
                  <div className="w-10 h-10 mx-auto rounded-full bg-slate-200/60 text-slate-400 flex items-center justify-center text-lg">
                    📦
                  </div>
                  <p className="text-sm font-semibold text-slate-700">No transfer history in this category</p>
                  <p className="text-xs text-slate-400">Transferred files will be logged here with verify checksums.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredHistory.map(t => (
                    <TransferCard key={t.transferId} transfer={t} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Mesh Node Stats */}
          {activeTab === 'network' && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <p className="text-xs text-slate-500 font-medium">Total Flow Sent</p>
                  <p className="text-xl font-extrabold text-slate-900 mt-1">{formatBytes(totalSentBytes)}</p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <p className="text-xs text-slate-500 font-medium">Total Flow Received</p>
                  <p className="text-xl font-extrabold text-teal-700 mt-1">{formatBytes(totalReceivedBytes)}</p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <p className="text-xs text-slate-500 font-medium">Active Streams</p>
                  <p className="text-xl font-extrabold text-slate-900 mt-1">{activeTransfers.length}</p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <p className="text-xs text-slate-500 font-medium">Security Verification</p>
                  <p className="text-sm font-extrabold text-emerald-600 mt-1 flex items-center gap-1">
                    <span>✓ SHA-256</span>
                    <span className="text-[10px] text-slate-500 font-normal">(Bit-for-Bit)</span>
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-teal-50/50 border border-teal-100 text-xs text-slate-600 space-y-2">
                <p className="font-bold text-teal-900">⚡ RHEO P2P Mesh Architecture</p>
                <p>Files stream in 1 MB chunks over persistent WebSockets directly between devices. No intermediate file storage on disk ensures zero logging of raw file contents.</p>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer / Sign Out Action */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400">RHEO v1.0 Flow Protocol</span>
          <button
            onClick={() => {
              onClose();
              logout();
            }}
            className="btn-danger py-2 px-4 text-xs font-bold rounded-xl flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>

      </div>
    </div>
  );
}
