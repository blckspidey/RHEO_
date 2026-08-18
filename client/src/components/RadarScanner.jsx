/**
 * RHEO — ShareIt-style Clean White & Transparent Green Circular Radar Scanner
 *
 * Fully centered concentric pulse waves, modern SVG icons (no emojis),
 * multi-peer selection, and responsive mobile optimization.
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTransfer } from '../contexts/TransferContext';
import { usePresence } from '../contexts/PresenceContext';
import Avatar, { getDefaultAvatar } from './Avatar';
import api from '../services/api';

export default function RadarScanner({ selected = [], onToggle, onSendFiles }) {
  const { user } = useAuth();
  const { localPeers, scanningPeers, scanLocalPeers } = useTransfer();
  const { queryPresence } = usePresence();

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Auto-scan on mount
  useEffect(() => {
    scanLocalPeers();
  }, [scanLocalPeers]);

  // Search users by @username
  const handleSearch = async (q) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
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
  };

  // Helper to arrange multiple peers neatly in a circle
  const getPeerPosition = (index, total) => {
    if (total === 1) return { top: '22%', left: '50%', transform: 'translate(-50%, -50%)' };
    if (total === 2) {
      return index === 0
        ? { top: '25%', left: '26%', transform: 'translate(-50%, -50%)' }
        : { top: '25%', left: '74%', transform: 'translate(-50%, -50%)' };
    }
    const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
    const radius = 37; // percentage radius
    const x = 50 + radius * Math.cos(angle);
    const y = 50 + radius * Math.sin(angle);
    return { top: `${y}%`, left: `${x}%`, transform: 'translate(-50%, -50%)' };
  };

  return (
    <div className="space-y-4 max-w-[400px] mx-auto select-none w-full">
      {/* ── Circular Radar Stage (Clean White + Perfectly Centered Waves) ── */}
      <div className="relative w-full aspect-square max-w-[320px] sm:max-w-[360px] mx-auto rounded-full bg-gradient-to-b from-white via-emerald-50/30 to-teal-50/30 shadow-xl shadow-emerald-900/5 border border-emerald-200/80 overflow-hidden flex items-center justify-center">
        
        {/* Soft background radial glow */}
        <div className="absolute inset-0 bg-radial from-emerald-400/10 via-transparent to-transparent pointer-events-none" />

        {/* Perfectly centered concentric rings */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] h-[92%] rounded-full border border-emerald-500/20 pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[72%] h-[72%] rounded-full border border-emerald-500/25 pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[52%] h-[52%] rounded-full border border-teal-500/25 pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[32%] h-[32%] rounded-full border border-teal-500/30 pointer-events-none" />

        {/* Perfectly centered crosshair lines */}
        <div className="absolute inset-x-0 top-1/2 h-[1px] -translate-y-1/2 bg-emerald-500/15 pointer-events-none" />
        <div className="absolute inset-y-0 left-1/2 w-[1px] -translate-x-1/2 bg-emerald-500/15 pointer-events-none" />

        {/* Smooth sweeping radar beam */}
        <div className="absolute inset-0 rounded-full pointer-events-none animate-[spin_4.5s_linear_infinite] origin-center opacity-70">
          <div className="w-1/2 h-1/2 bg-gradient-to-br from-emerald-500/25 via-teal-400/10 to-transparent origin-bottom-right" />
        </div>

        {/* Center Node: You with centered pulse waves */}
        <div className="relative z-10 flex flex-col items-center justify-center">
          <div className="relative flex items-center justify-center">
            {/* Centered pulse wave */}
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-emerald-400/25 animate-ping pointer-events-none" />
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white border-2 border-emerald-500 shadow-md shadow-emerald-500/20 flex items-center justify-center relative z-10">
              <Avatar avatarId={localStorage.getItem('rheo_avatar') || localStorage.getItem('ds_avatar') || getDefaultAvatar(user?.username)} name={user?.username} size="sm" className="!w-10 !h-10 sm:!w-11 sm:!h-11 text-sm font-extrabold" />
            </div>
          </div>
          <div className="mt-1 px-2.5 py-0.5 rounded-full bg-white/95 border border-emerald-200 text-[11px] font-bold text-emerald-800 font-mono tracking-tight shadow-xs text-center">
            You (@{user?.username})
          </div>
        </div>

        {/* Discovered Peers in Orbit */}
        {localPeers.map((peer, idx) => {
          const isSelected = selected.some(s => s.id === peer.id);
          const pos = getPeerPosition(idx, localPeers.length);

          return (
            <button
              key={peer.id}
              id={`radar-peer-${peer.id}`}
              onClick={() => onToggle(peer)}
              style={pos}
              className={`absolute z-20 flex flex-col items-center gap-1 transition-all duration-300 group cursor-pointer ${
                isSelected ? 'scale-110' : 'hover:scale-105'
              }`}
            >
              <div className="relative">
                {/* Selection glow ring */}
                <span className={`absolute -inset-1 rounded-full transition-opacity ${
                  isSelected ? 'bg-emerald-400/50 animate-pulse' : 'bg-emerald-400/15 group-hover:bg-emerald-400/30'
                }`} />

                {/* Avatar circle */}
                <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 flex items-center justify-center shadow-md transition-all ${
                  isSelected
                    ? 'bg-emerald-500 border-white ring-4 ring-emerald-400/40 shadow-emerald-500/30 text-white'
                    : 'bg-white border-emerald-300 group-hover:border-emerald-500 shadow-emerald-900/10'
                }`}>
                  <Avatar avatarId={peer.avatarId ?? peer.avatarIndex ?? getDefaultAvatar(peer.username)} name={peer.username} size="sm" className="!w-8 !h-8 sm:!w-9 sm:!h-9 text-xs" />
                </div>

                {/* Selected Checkmark or Online Dot */}
                {isSelected ? (
                  <span className="absolute -bottom-0.5 -right-0.5 w-4.5 h-4.5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black border-2 border-white shadow-xs">
                    ✓
                  </span>
                ) : (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow-xs" />
                )}
              </div>

              {/* Username Pill */}
              <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono truncate max-w-[85px] shadow-xs transition-all ${
                isSelected
                  ? 'bg-emerald-600 text-white border border-emerald-700'
                  : 'bg-white/95 text-slate-800 border border-emerald-200 group-hover:border-emerald-400'
              }`}>
                @{peer.username}
              </div>
            </button>
          );
        })}

        {/* Empty state hint */}
        {localPeers.length === 0 && (
          <div className="absolute bottom-3 inset-x-4 text-center pointer-events-none">
            <p className="text-[10px] sm:text-[11px] font-semibold text-emerald-800 bg-white/90 py-1 px-2.5 rounded-full border border-emerald-200/80 shadow-xs backdrop-blur-xs">
              {scanningPeers ? 'Scanning local Wi-Fi / hotspot…' : 'Connect another device to this Wi-Fi/Hotspot'}
            </p>
          </div>
        )}
      </div>

      {/* ── Action Bar: Compact Refresh Button + Main Send Button + Search Toggle ── */}
      <div className="flex items-center gap-2">
        {/* Compact refresh icon button */}
        <button
          onClick={() => scanLocalPeers()}
          disabled={scanningPeers}
          title="Refresh Radar"
          className="w-10 h-10 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-700 shadow-xs transition-all flex-shrink-0 disabled:opacity-50 cursor-pointer"
        >
          <svg className={`w-4 h-4 text-emerald-600 ${scanningPeers ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        {/* Prominent Send Button */}
        <button
          id="radar-send-button"
          onClick={onSendFiles}
          disabled={selected.length === 0}
          className="btn-teal flex-1 py-2.5 sm:py-3 px-3 text-xs sm:text-sm font-extrabold rounded-2xl shadow-lg shadow-teal-700/15 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
          <span className="truncate">
            {selected.length === 0
              ? 'Select Peers on Radar'
              : `Send Files (${selected.length})`}
          </span>
        </button>

        {/* Modern Search Icon Toggle Button (no emoji) */}
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          title="Search by username"
          className={`h-10 px-3 rounded-2xl border flex items-center justify-center gap-1.5 text-xs font-bold transition-all cursor-pointer flex-shrink-0 ${
            searchOpen
              ? 'bg-teal-600 text-white border-teal-700 shadow-xs'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-xs'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="hidden sm:inline">Search</span>
        </button>
      </div>

      {/* ── Remote User Search Box (Collapsible) ──────────────────────────── */}
      {searchOpen && (
        <div className="card-clean p-3.5 space-y-2.5 animate-fade-in bg-white border-emerald-200 shadow-sm rounded-2xl">
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <input
              id="radar-user-search-input"
              className="input pl-9 pr-8 text-xs bg-slate-50/60"
              value={query}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search by exact username…"
              autoFocus
            />
            {searching && (
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <div className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Search results list */}
          {searchResults.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
              {searchResults.map(u => {
                const isSelected = selected.some(s => s.id === u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => onToggle(u)}
                    className={`w-full flex items-center justify-between p-2 rounded-xl text-left border transition-all text-xs cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-600 text-white border-emerald-700'
                        : 'bg-slate-50 border-slate-200 hover:bg-emerald-50 text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Avatar avatarId={u.avatarId ?? u.avatarIndex ?? getDefaultAvatar(u.username)} name={u.username} size="xs" />
                      <span className="font-bold truncate">@{u.username}</span>
                    </div>
                    <span className="text-[10px] font-bold">{isSelected ? '✓ Selected' : '+ Select'}</span>
                  </button>
                );
              })}
            </div>
          )}
          {query.trim().length >= 2 && !searching && searchResults.length === 0 && (
            <p className="text-[11px] text-slate-400 text-center py-1">No users found for "{query}"</p>
          )}
        </div>
      )}

      {/* ── Selected Peers Pill Bar ──────────────────────────────────────── */}
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
          {selected.map(u => (
            <span
              key={u.id}
              className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-xs"
            >
              <span>@{u.username}</span>
              <button onClick={() => onToggle(u)} className="text-emerald-700 hover:text-emerald-950 font-black text-xs ml-1 cursor-pointer">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
