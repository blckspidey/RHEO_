/**
 * RHEO — Restructured Room Panel
 *
 * Features:
 * 1. Dual Room Gateway (Create Room OR Join Room by 6-digit code e.g. 8X3A92).
 * 2. Active Live Rooms Auto-Discovery (Click 1-Tap Join to enter any active room).
 * 3. Strict Offline Removal (offline users are completely purged when they disconnect/close).
 * 4. Room Files Repository — displays top 3 recent records on page, with direct Download options.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useRoom } from '../contexts/RoomContext';
import { useTransfer } from '../contexts/TransferContext';
import { useAuth } from '../contexts/AuthContext';
import Avatar, { getDefaultAvatar } from './Avatar';
import TransferCard from './TransferCard';
import api from '../services/api';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function RoomPanel() {
  const { user } = useAuth();
  const {
    activeRoom, activeRoomsList, fetchActiveRooms, createRoom, joinRoomByCode, inviteMember, removeMember,
    leaveRoom, dismissRoom, notifyFileShared, creating, joining, error, setError,
  } = useRoom();
  const { transfers, sendFile, clearAbortedTransfers } = useTransfer();

  // Gateway form state
  const [createName, setCreateName] = useState('');
  const [joinCode, setJoinCode]     = useState('');

  // File dropzone & queue
  const [dragging, setDragging]   = useState(false);
  const [sending, setSending]     = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendQueue, setSendQueue] = useState([]);
  const fileInputRef              = useRef(null);

  // Invite member search
  const [showInviteSearch, setShowInviteSearch] = useState(false);
  const [inviteQuery, setInviteQuery]           = useState('');
  const [inviteResults, setInviteResults]       = useState([]);
  const [inviting, setInviting]                 = useState(false);
  const [inviteSearching, setInviteSearching]   = useState(false);
  const debounceRef                             = useRef(null);

  const isCreator = activeRoom?.creatorId === user?.id;
  const otherMembers = (activeRoom?.members || []).filter(m => m.id !== user?.id);

  // Periodically refresh active public rooms list when on gateway screen
  useEffect(() => {
    if (!activeRoom) {
      fetchActiveRooms();
      const interval = setInterval(fetchActiveRooms, 4000);
      return () => clearInterval(interval);
    }
  }, [activeRoom, fetchActiveRooms]);

  // ── Create & Join Room ───────────────────────────────────────
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    try {
      await createRoom(createName.trim() || undefined);
      setCreateName('');
    } catch {
      // handled in context
    }
  };

  const handleJoinSubmit = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    try {
      await joinRoomByCode(joinCode.trim());
      setJoinCode('');
    } catch {
      // handled in context
    }
  };

  const handleQuickJoinCode = async (code) => {
    try {
      await joinRoomByCode(code);
    } catch {
      // handled in context
    }
  };

  // ── Invite Search ────────────────────────────────────────────
  const searchInvite = useCallback((q) => {
    setInviteQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setInviteResults([]); return; }
    setInviteSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
        const existing = new Set(activeRoom?.members?.map(m => m.id) || []);
        const users = (res.data.data?.users || []).filter(u => !existing.has(u.id) && u.id !== user?.id);
        setInviteResults(users);
      } catch {
        setInviteResults([]);
      } finally {
        setInviteSearching(false);
      }
    }, 350);
  }, [activeRoom?.members, user?.id]);

  const handleInvite = async (targetUser) => {
    setInviting(true);
    try {
      await inviteMember(targetUser.id);
      setInviteQuery('');
      setInviteResults([]);
      setShowInviteSearch(false);
    } catch (err) {
      setSendError(err.message);
    } finally {
      setInviting(false);
    }
  };

  // ── File Sending to Room ──────────────────────────────────────
  const sendFilesToRoom = async (files) => {
    if (!files || files.length === 0) return;
    if (!activeRoom?.members?.length) {
      setSendError('No members in room to send to.');
      return;
    }

    const receiverIds = (activeRoom.members || [])
      .filter(m => m.id !== user?.id)
      .map(m => m.id);

    if (receiverIds.length === 0) {
      setSendError('No other members to receive files.');
      return;
    }

    const usernameMap = {};
    (activeRoom.members || []).forEach(m => { usernameMap[m.id] = m.username; });

    setSending(true);
    setSendError('');
    setSendQueue(Array.from(files).map(f => f.name));

    for (const file of Array.from(files)) {
      try {
        const res = await sendFile(file, receiverIds, usernameMap);
        const transferId = res?.transfers?.[0]?.id;
        notifyFileShared(file.name, file.size, transferId);
      } catch (err) {
        setSendError(err.message || 'Failed to send file');
        break;
      }
    }

    setSending(false);
    setSendQueue([]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const files = e.dataTransfer?.files;
    if (files?.length) sendFilesToRoom(files);
  };

  const handleFileInput = (e) => {
    const files = e.target.files;
    if (files?.length) sendFilesToRoom(files);
    e.target.value = '';
  };

  // ── Download File Helper ──────────────────────────────────────
  const handleDownloadFile = (fileItem) => {
    const matchedTransfer = Array.from(transfers.values()).find(
      t => t.fileName === fileItem.fileName && t.blobUrl
    );

    if (matchedTransfer?.blobUrl) {
      const a = document.createElement('a');
      a.href = matchedTransfer.blobUrl;
      a.download = fileItem.fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => document.body.removeChild(a), 1000);
    } else {
      alert(`File "${fileItem.fileName}" was shared by @${fileItem.senderUsername}. Standard P2P flow streams it automatically when sent!`);
    }
  };

  // Filter transfers (shows BOTH sending and receiving active streams)
  const roomTransfers = Array.from(transfers.values())
    .filter(t => ['PENDING','ACCEPTED','TRANSFERRING','PAUSED'].includes(t.status));

  // ── GATEWAY VIEW (When not in a room) ─────────────────────────
  if (!activeRoom) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-teal-500 to-cyan-600 mx-auto flex items-center justify-center text-3xl text-white shadow-xl shadow-teal-500/20">
            🏠
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Room Sharing Hub</h2>
          <p className="text-slate-500 text-xs sm:text-sm max-w-md mx-auto">
            Create a private room or enter a 6-digit Room Code to join. Offline users are automatically removed from rooms when they close or leave.
          </p>
        </div>

        {error && (
          <div className="max-w-md mx-auto p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 font-semibold flex items-center gap-2">
            <span>⚠️</span>
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-700">✕</button>
          </div>
        )}

        {/* Dual Gateway Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Card 1: Create a Room */}
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-md p-6 sm:p-8 space-y-5 flex flex-col justify-between hover:border-teal-300 transition-all">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center text-xl font-bold">
                  ➕
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-lg">Create a New Room</h3>
                  <p className="text-xs text-slate-500">Get a 6-digit Room Code to share with active online members</p>
                </div>
              </div>

              <form onSubmit={handleCreateSubmit} className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
                    Room Name <span className="text-slate-400 normal-case">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={createName}
                    onChange={e => setCreateName(e.target.value)}
                    placeholder="e.g. Design Assets, Project Alpha…"
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={creating}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-extrabold text-sm shadow-md hover:from-teal-700 hover:to-cyan-700 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {creating ? 'Creating Room…' : '🏠 Create Room'}
                </button>
              </form>
            </div>
          </div>

          {/* Card 2: Join Existing Room */}
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-md p-6 sm:p-8 space-y-5 flex flex-col justify-between hover:border-cyan-300 transition-all">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-cyan-100 text-cyan-800 flex items-center justify-center text-xl font-bold">
                  🔑
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-lg">Join Existing Room</h3>
                  <p className="text-xs text-slate-500">Enter the 6-digit Room Code provided by the host</p>
                </div>
              </div>

              <form onSubmit={handleJoinSubmit} className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
                    6-Digit Room Code
                  </label>
                  <input
                    type="text"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="e.g. 8X3A92"
                    maxLength={10}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-base font-mono font-extrabold tracking-widest text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all uppercase"
                  />
                </div>

                <button
                  type="submit"
                  disabled={joining || !joinCode.trim()}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-600 to-teal-600 text-white font-extrabold text-sm shadow-md hover:from-cyan-700 hover:to-teal-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {joining ? 'Joining Room…' : '🔑 Join Room'}
                </button>
              </form>
            </div>
          </div>

        </div>

        {/* ── Discovered Live Active Rooms Section ────────────────── */}
        {activeRoomsList.length > 0 && (
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                <h3 className="font-extrabold text-slate-900 text-base">Active Live Rooms on Network</h3>
              </div>
              <button
                onClick={fetchActiveRooms}
                className="text-xs font-bold text-teal-700 hover:text-teal-900 flex items-center gap-1"
              >
                ⟳ Refresh
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeRoomsList.map(r => (
                <div key={r.roomId} className="p-4 rounded-2xl border border-teal-100 bg-teal-50/40 flex items-center justify-between hover:bg-teal-50 transition-colors">
                  <div className="min-w-0 pr-2">
                    <p className="font-extrabold text-sm text-slate-900 truncate">{r.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Host: <span className="font-semibold text-slate-700">@{r.creatorUsername}</span> · {r.memberCount} online
                    </p>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-white border border-teal-200 text-[11px] font-mono font-bold text-teal-800">
                      {r.code}
                    </span>
                  </div>
                  <button
                    onClick={() => handleQuickJoinCode(r.code)}
                    disabled={joining}
                    className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs shadow-xs transition-all flex-shrink-0"
                  >
                    Join Room
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    );
  }

  // ── ACTIVE ROOM WORKSPACE VIEW ───────────────────────────────
  const filesList = activeRoom.filesShared || [];
  // Keep only past 3 records of history on page
  const recentFilesList = filesList.slice(0, 3);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in max-w-6xl mx-auto">

      {/* ── Left Column: Room Overview & Members ─────────────────── */}
      <div className="lg:col-span-5 space-y-4">

        {/* Room Header Banner */}
        <div className="bg-gradient-to-br from-teal-600 via-teal-700 to-cyan-800 rounded-3xl p-5 shadow-lg text-white space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center text-2xl shadow-inner">🏠</div>
              <div>
                <h2 className="font-black text-xl leading-tight">{activeRoom.name}</h2>
                <p className="text-teal-100/80 text-xs mt-0.5">
                  {activeRoom.members?.length || 0} online member{activeRoom.members?.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {isCreator ? (
              <button
                onClick={dismissRoom}
                className="text-xs px-3 py-1.5 rounded-xl bg-red-500/80 hover:bg-red-600 text-white font-bold transition-all flex items-center gap-1 shadow-sm"
              >
                🗑 Dismiss
              </button>
            ) : (
              <button
                onClick={leaveRoom}
                className="text-xs px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold transition-all flex items-center gap-1"
              >
                ↩ Leave
              </button>
            )}
          </div>

          {/* Clean 6-Digit Room Code Display (No Copy Button) */}
          <div className="bg-white/15 backdrop-blur-md rounded-2xl p-3 flex items-center justify-between border border-white/20">
            <div>
              <p className="text-[10px] text-teal-100/80 font-bold uppercase tracking-wider">Room Code</p>
              <p className="text-lg font-mono font-black tracking-widest text-white">{activeRoom.code || '8X3A92'}</p>
            </div>
            <span className="text-[11px] font-bold text-teal-100 bg-white/10 px-2.5 py-1 rounded-xl">
              Active Room
            </span>
          </div>
        </div>

        {/* Room Members List */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <span>👥</span> Online Members
              <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 font-bold">
                {activeRoom.members?.length || 0}
              </span>
            </h3>
            {isCreator && (
              <button
                onClick={() => setShowInviteSearch(v => !v)}
                className="text-xs px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold transition-colors flex items-center gap-1 shadow-xs"
              >
                + Invite
              </button>
            )}
          </div>

          {/* Search to invite */}
          {showInviteSearch && (
            <div className="px-4 py-3 border-b border-slate-100 bg-teal-50/60 space-y-2">
              <input
                type="text"
                value={inviteQuery}
                onChange={e => searchInvite(e.target.value)}
                placeholder="Search username to invite…"
                autoFocus
                className="w-full px-3 py-2 rounded-xl border border-teal-200 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              {inviteResults.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white shadow overflow-hidden max-h-36 overflow-y-auto">
                  {inviteResults.map(u => (
                    <button
                      key={u.id}
                      onClick={() => handleInvite(u)}
                      disabled={inviting}
                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-teal-50 transition-colors text-left"
                    >
                      <Avatar avatarId={getDefaultAvatar(u.username)} name={u.username} size="xs" />
                      <span className="text-xs font-bold text-slate-800 flex-1 truncate">{u.username}</span>
                      <span className="text-[11px] text-teal-600 font-bold">+ Invite</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Members Rows */}
          <div className="divide-y divide-slate-100">
            {(activeRoom.members || []).map(m => {
              const isMe = m.id === user?.id;
              const isOwner = m.id === activeRoom.creatorId;
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors">
                  <div className="relative flex-shrink-0">
                    <Avatar avatarId={m.avatarId || getDefaultAvatar(m.username)} name={m.username} size="sm" />
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white bg-green-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-extrabold text-slate-900 truncate">{m.username}</span>
                      {isOwner && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-extrabold uppercase">Owner</span>}
                      {isMe && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-800 font-extrabold">You</span>}
                    </div>
                    <p className="text-xs text-green-600 font-semibold">Active Online</p>
                  </div>
                  {isCreator && !isMe && (
                    <button
                      onClick={() => removeMember(m.id)}
                      className="w-7 h-7 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all flex items-center justify-center text-xs"
                      title={`Remove ${m.username}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Right Column: Files Repository & Upload ────────────────── */}
      <div className="lg:col-span-7 space-y-5">

        {/* Drop Zone to Upload Files */}
        <div
          className={`rounded-3xl border-2 border-dashed transition-all duration-200 p-6 text-center cursor-pointer group
            ${dragging
              ? 'border-teal-500 bg-teal-50 scale-[1.01]'
              : 'border-slate-200 bg-slate-50/60 hover:border-teal-400 hover:bg-teal-50/40'
            }`}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileInput} />
          <div className={`mx-auto w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-2 transition-all
            ${dragging ? 'bg-teal-500 scale-110' : 'bg-slate-200 group-hover:bg-teal-100'}`}>
            {sending ? '⏳' : dragging ? '📂' : '📤'}
          </div>
          <p className="font-extrabold text-slate-900 text-sm mb-0.5">
            {sending ? 'Sharing files to room…' : 'Drop files here or click to share with room'}
          </p>
          <p className="text-xs text-slate-500">
            {otherMembers.length > 0
              ? `Streams to all ${otherMembers.length} member${otherMembers.length !== 1 ? 's' : ''} in this room`
              : 'Add or invite members to start streaming files'
            }
          </p>

          {sending && sendQueue.length > 0 && (
            <div className="mt-3 space-y-1">
              {sendQueue.map((name, i) => (
                <div key={i} className="flex items-center gap-2 bg-white rounded-xl px-3 py-1.5 text-xs text-slate-700 border border-teal-100">
                  <span>📄</span>
                  <span className="flex-1 truncate font-semibold">{name}</span>
                  <span className="text-slate-400">Streaming…</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {sendError && (
          <div className="px-4 py-2.5 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 font-semibold flex items-center gap-2">
            ⚠️ {sendError}
            <button onClick={() => setSendError('')} className="ml-auto text-red-400 hover:text-red-700">✕</button>
          </div>
        )}

        {/* Active Streams (Sender + Receiver progress cards) */}
        {roomTransfers.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                Active File Streams
              </h3>
              <button
                onClick={clearAbortedTransfers}
                className="text-xs font-bold text-slate-500 hover:text-red-600 transition-colors flex items-center gap-1 cursor-pointer"
                title="Clear all pending, paused, or stuck streams"
              >
                🧹 Clear Inactive
              </button>
            </div>
            <div className="space-y-2">
              {roomTransfers.map(t => <TransferCard key={t.transferId} transfer={t} />)}
            </div>
          </div>
        )}

        {/* ── ROOM FILES REPOSITORY (Past 3 Records Displayed) ────────────────── */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden space-y-0">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-sm">📁</div>
              <div>
                <h3 className="text-sm font-black text-slate-900 leading-tight">Room Files Repository</h3>
                <p className="text-[11px] text-slate-500">Showing top 3 recent shared files</p>
              </div>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-extrabold">
              {filesList.length} total file{filesList.length !== 1 ? 's' : ''}
            </span>
          </div>

          {recentFilesList.length === 0 ? (
            <div className="p-8 text-center text-slate-400 space-y-2">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-50 flex items-center justify-center text-2xl">📭</div>
              <p className="text-xs font-bold text-slate-600">No files in room repository yet</p>
              <p className="text-[11px] text-slate-400">Files uploaded above will appear here for all members.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentFilesList.map((item, idx) => (
                <div key={item.id || idx} className="p-4 flex items-center gap-3 hover:bg-slate-50/70 transition-colors">
                  <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-lg flex-shrink-0">
                    📄
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-extrabold text-slate-900 truncate">{item.fileName}</p>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                      <span className="font-semibold text-slate-700">{formatBytes(item.fileSize)}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Avatar avatarId={item.avatarId || getDefaultAvatar(item.senderUsername)} name={item.senderUsername} size="xs" />
                        <span>@{item.senderUsername}</span>
                      </span>
                      <span>·</span>
                      <span>{formatTime(item.timestamp)}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDownloadFile(item)}
                    className="px-3.5 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold text-xs border border-teal-200 transition-all flex items-center gap-1.5 flex-shrink-0 shadow-2xs"
                  >
                    <span>⬇</span> Download
                  </button>
                </div>
              ))}
            </div>
          )}

          {filesList.length > 3 && (
            <div className="p-3 bg-slate-50 border-t border-slate-100 text-center text-xs text-slate-500 font-semibold">
              Showing recent 3 of {filesList.length} files · Full history saved in room state
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
