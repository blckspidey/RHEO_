/**
 * RHEO — Create Room Modal
 * Lets user name a room and add initial members before creating it.
 */
import { useState, useCallback, useRef } from 'react';
import { useRoom } from '../contexts/RoomContext';
import { useAuth } from '../contexts/AuthContext';
import Avatar, { getDefaultAvatar } from './Avatar';
import api from '../services/api';

export default function CreateRoomModal({ isOpen, onClose }) {
  const { user } = useAuth();
  const { createRoom, inviteMember, creating, error, setError } = useRoom();

  const [name, setName]                 = useState('');
  const [query, setQuery]               = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]       = useState(false);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const debounceRef = useRef(null);

  const search = useCallback((q) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
        const users = (res.data.data?.users || []).filter(u => u.id !== user?.id);
        setSearchResults(users);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  }, [user?.id]);

  const toggleMember = (u) => {
    setSelectedMembers(prev =>
      prev.some(m => m.id === u.id)
        ? prev.filter(m => m.id !== u.id)
        : [...prev, u]
    );
  };

  const handleCreate = async () => {
    setError('');
    try {
      const room = await createRoom(name.trim() || undefined);
      // Invite all selected members
      for (const m of selectedMembers) {
        await inviteMember(m.id).catch(() => {});
      }
      setName('');
      setSelectedMembers([]);
      setQuery('');
      setSearchResults([]);
      onClose(room);
    } catch {
      // error is set in context
    }
  };

  const handleClose = () => {
    setName('');
    setSelectedMembers([]);
    setQuery('');
    setSearchResults([]);
    setError('');
    onClose(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal Card */}
      <div className="relative z-10 w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-600 to-cyan-600 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-white/20 flex items-center justify-center text-white text-lg">
              🏠
            </div>
            <div>
              <h2 className="text-white font-extrabold text-lg leading-tight">Create a Room</h2>
              <p className="text-teal-100/80 text-xs">Invite members & share files together</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Room Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">
              Room Name <span className="text-slate-400 font-normal normal-case">(optional)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Team Files, Holiday Photos…"
              maxLength={60}
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Invite Members */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">
              Add Members
            </label>
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={e => search(e.target.value)}
                placeholder="Search by username…"
                className="w-full pl-9 pr-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                {searching ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                  </svg>
                )}
              </span>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden max-h-44 overflow-y-auto">
                {searchResults.map(u => {
                  const isSelected = selectedMembers.some(m => m.id === u.id);
                  return (
                    <button
                      key={u.id}
                      onClick={() => toggleMember(u)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left ${isSelected ? 'bg-teal-50' : ''}`}
                    >
                      <Avatar avatarId={getDefaultAvatar(u.username)} name={u.username} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{u.username}</p>
                        {u.displayName && (
                          <p className="text-xs text-slate-500 truncate">{u.displayName}</p>
                        )}
                      </div>
                      {isSelected && (
                        <span className="w-5 h-5 rounded-full bg-teal-500 flex items-center justify-center text-white text-xs flex-shrink-0">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Selected Members Chips */}
            {selectedMembers.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                {selectedMembers.map(m => (
                  <div key={m.id} className="flex items-center gap-1.5 bg-teal-100 text-teal-800 px-2.5 py-1 rounded-full text-xs font-semibold">
                    <Avatar avatarId={getDefaultAvatar(m.username)} name={m.username} size="xs" />
                    <span>{m.username}</span>
                    <button
                      onClick={() => toggleMember(m)}
                      className="ml-0.5 text-teal-600 hover:text-teal-900 leading-none"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-600 font-semibold bg-red-50 px-3 py-2 rounded-xl border border-red-200">
              ⚠ {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={handleClose}
              className="flex-1 py-2.5 rounded-2xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex-1 py-2.5 rounded-2xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white text-sm font-bold hover:from-teal-700 hover:to-cyan-700 transition-all shadow-md disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {creating ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Creating…
                </>
              ) : (
                <>🏠 Create Room</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
