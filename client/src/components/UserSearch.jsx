/**
 * RHEO — User Search & Local Network Auto-Discovery Radar
 *
 * 1. Local Network / Hotspot Mode: Scans & displays connected users on the
 *    same local network (0 Internet Data consumption via direct LAN WebRTC stream).
 * 2. Search Fallback: Allows searching by username/usertag across the cloud relay.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import api from '../services/api';
import { usePresence } from '../contexts/PresenceContext';
import { useAuth } from '../contexts/AuthContext';
import { useTransfer } from '../contexts/TransferContext';
import Avatar, { getDefaultAvatar } from './Avatar';

export default function UserSearch({ selected, onToggle }) {
  const { user } = useAuth();
  const { localPeers, scanningPeers, scanLocalPeers, isLocalPeer } = useTransfer();
  const { isOnline, queryPresence } = usePresence();

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  // Search by usertag/username (Fallback model)
  const search = useCallback((q) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
        const users = (res.data.data?.users || []).filter(u => u.id !== user?.id);
        setSearchResults(users);
        if (users.length > 0) queryPresence(users.map(u => u.id));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  }, [queryPresence, user?.id]);

  const showSearchResults = query.trim().length >= 2;
  const showEmptySearch = showSearchResults && !searching && searchResults.length === 0;

  return (
    <div className="space-y-4">
      {/* ── 1. Local Network / Hotspot Radar (Zero Data) ───────────────────── */}
      <div className="rounded-2xl border border-teal-200/90 bg-gradient-to-br from-teal-50/70 via-white to-cyan-50/60 p-4 space-y-3 shadow-sm shadow-teal-900/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative w-4 h-4 flex items-center justify-center">
              <span className="absolute w-4 h-4 rounded-full bg-teal-500/30 animate-ping" />
              <span className="w-2.5 h-2.5 rounded-full bg-teal-600 relative z-10" />
            </div>
            <div>
              <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                Local Network / Hotspot Radar
                <span className="text-[10px] font-bold text-teal-700 bg-teal-100/90 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  0 Data Used
                </span>
              </span>
            </div>
          </div>

          <button
            onClick={() => scanLocalPeers()}
            disabled={scanningPeers}
            className="text-[11px] font-bold text-teal-700 hover:text-teal-900 bg-white border border-teal-200 hover:border-teal-300 px-2.5 py-1 rounded-xl flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-50"
            title="Scan for devices connected to the same Wi-Fi or Hotspot"
          >
            <svg className={`w-3.5 h-3.5 ${scanningPeers ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{scanningPeers ? 'Scanning…' : 'Scan Network'}</span>
          </button>
        </div>

        {/* Local peers list */}
        {localPeers.length > 0 ? (
          <div className="space-y-1.5 pt-1">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Connected on same Wi-Fi / Hotspot ({localPeers.length})
            </p>
            <div className="space-y-1">
              {localPeers.map(peer => {
                const isSelected = selected.some(s => s.id === peer.id);
                const avatarId = getDefaultAvatar(peer.username);

                return (
                  <button
                    key={peer.id}
                    id={`local-peer-${peer.id}`}
                    onClick={() => onToggle(peer)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all border ${
                      isSelected
                        ? 'bg-teal-100/80 border-teal-400 shadow-xs'
                        : 'bg-white border-teal-200/70 hover:border-teal-300 hover:bg-teal-50/50'
                    }`}
                  >
                    <Avatar avatarId={avatarId} name={peer.username} size="sm" />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {peer.displayName || peer.username}
                        </span>
                        <span className="text-[11px] text-teal-800 font-mono font-medium truncate">@{peer.username}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="text-[10px] font-bold text-emerald-700 font-mono">⚡ Direct LAN Stream (0 Data)</span>
                      </div>
                    </div>

                    {/* Checkmark */}
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center flex-shrink-0">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="bg-white/80 border border-slate-200/80 rounded-xl p-3 text-center space-y-1">
            <p className="text-xs font-semibold text-slate-600">
              {scanningPeers ? 'Scanning for connected devices…' : 'No other devices detected on this local network'}
            </p>
            <p className="text-[11px] text-slate-400">
              Tip: Connect devices to the same Wi-Fi or turn on a Mobile Hotspot and connect to it for 0 data usage.
            </p>
          </div>
        )}
      </div>

      {/* ── 2. Fallback: Search by Username / Usertag ───────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Or Search by Username / Usertag (Cloud Relay)
          </label>
        </div>

        {/* Search Input */}
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            id="user-search-input"
            className="input pl-9 pr-9 text-sm bg-slate-50/60"
            value={query}
            onChange={e => search(e.target.value)}
            placeholder="Type @username to search across internet…"
          />
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!searching && query && (
            <button
              onClick={() => { setQuery(''); setSearchResults([]); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Search Results List */}
        {showSearchResults && searchResults.length > 0 && (
          <div className="space-y-1 pt-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-0.5">
              Search Results for "{query}"
            </p>
            {searchResults.map(u => {
              const isSelected = selected.some(s => s.id === u.id);
              const online = isOnline(u.id);
              const local = isLocalPeer(u.id);
              const avatarId = getDefaultAvatar(u.username);

              return (
                <button
                  key={u.id}
                  id={`user-result-${u.id}`}
                  onClick={() => onToggle(u)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-left transition-all border ${
                    isSelected
                      ? 'bg-teal-50 border-teal-300 shadow-sm'
                      : 'bg-white border-slate-200 hover:border-teal-300 hover:bg-teal-50/40'
                  }`}
                >
                  <Avatar avatarId={avatarId} name={u.username} size="sm" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-slate-900 truncate">
                        {u.displayName || u.username}
                      </span>
                      <span className="text-xs text-slate-400 font-mono truncate">@{u.username}</span>
                    </div>
                    <div className="text-[10px] font-medium text-slate-400 mt-0.5">
                      {local ? (
                        <span className="text-teal-700 font-bold">⚡ Connected on Local Network</span>
                      ) : (
                        <span>🌐 Remote Cloud Relay</span>
                      )}
                    </div>
                  </div>

                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${online ? 'bg-emerald-500' : 'bg-slate-300'}`} />

                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Empty search state */}
        {showEmptySearch && (
          <p className="text-xs text-slate-400 text-center py-3 bg-slate-50 rounded-2xl border border-slate-200">
            No users found for "<span className="font-semibold text-slate-600">{query}</span>"
          </p>
        )}
      </div>

      {/* ── Selected Chips ────────────────────────────────────────────────── */}
      {selected.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Selected Target Nodes ({selected.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {selected.map(u => {
              const local = isLocalPeer(u.id);
              return (
                <span
                  key={u.id}
                  className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border shadow-xs ${
                    local
                      ? 'bg-teal-600 text-white border-teal-700'
                      : 'bg-slate-800 text-white border-slate-900'
                  }`}
                >
                  <Avatar avatarId={getDefaultAvatar(u.username)} name={u.username} size="xs" className="!w-4 !h-4 !rounded-full text-xs" />
                  <span>@{u.username}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${local ? 'bg-teal-700 text-teal-100' : 'bg-slate-700 text-slate-200'}`}>
                    {local ? '⚡ 0 Data' : '🌐 Relay'}
                  </span>
                  <button onClick={() => onToggle(u)} className="text-slate-300 hover:text-white ml-0.5">×</button>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
