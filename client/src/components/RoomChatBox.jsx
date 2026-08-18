/**
 * RHEO — Room Chat Box
 * Floating text chat widget pinned to bottom-right corner.
 * Shows in any mode when a room is active. Dedicated to text conversation.
 */
import { useEffect, useRef, useState } from 'react';
import { useRoom } from '../contexts/RoomContext';
import { useAuth } from '../contexts/AuthContext';
import Avatar, { getDefaultAvatar } from './Avatar';

function formatTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function RoomChatBox() {
  const { user } = useAuth();
  const {
    activeRoom, chatMessages, chatOpen, unreadCount,
    sendChatMessage, openChat, closeChat,
  } = useRoom();

  const [input, setInput] = useState('');
  const [minimized, setMinimized] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Filter text messages for the chatbox (excluding files since files live in Room Files Repository)
  const textMessages = chatMessages.filter(m => m.type !== 'file');

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (!minimized && chatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [textMessages, minimized, chatOpen]);

  // Focus input when opened
  useEffect(() => {
    if (!minimized && chatOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [minimized, chatOpen]);

  if (!activeRoom) return null;

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    sendChatMessage(text);
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleToggle = () => {
    if (minimized) {
      setMinimized(false);
      openChat();
    } else {
      setMinimized(true);
      closeChat();
    }
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-40 flex flex-col items-end"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* ── Expanded Chat Panel ─────────────────────────────── */}
      <div
        className={`bg-slate-900 rounded-3xl shadow-2xl border border-slate-700/80 overflow-hidden transition-all duration-300 origin-bottom-right
          ${minimized ? 'w-0 h-0 opacity-0 scale-75 pointer-events-none' : 'w-80 opacity-100 scale-100'}
        `}
        style={{ maxHeight: minimized ? 0 : '480px' }}
      >
        {/* Chat Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-3 flex items-center justify-between border-b border-slate-700/60">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-teal-500/20 flex items-center justify-center text-sm">💬</div>
            <div>
              <p className="text-white font-bold text-xs leading-tight truncate max-w-[140px]">{activeRoom.name}</p>
              <p className="text-slate-400 text-[10px]">
                {activeRoom.members?.length || 0} members · Code: <span className="font-mono text-teal-400 font-bold">{activeRoom.code}</span>
              </p>
            </div>
          </div>
          <button
            onClick={handleToggle}
            className="w-7 h-7 rounded-xl bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-300 hover:text-white transition-colors text-xs"
          >
            ▼
          </button>
        </div>

        {/* Messages */}
        <div className="overflow-y-auto px-3 py-3 space-y-2.5" style={{ height: '340px' }}>
          {textMessages.length === 0 && (
            <div className="text-center py-12 text-slate-500 text-xs space-y-1">
              <div className="text-2xl">💬</div>
              <p className="font-semibold text-slate-400">Room Chat</p>
              <p className="text-slate-500 text-[11px]">Send real-time text messages to room members.</p>
            </div>
          )}

          {textMessages.map((msg, i) => {
            const isMe = msg.senderId === user?.id;
            const isSystem = msg.type === 'system';

            if (isSystem) {
              return (
                <div key={msg.id || i} className="text-center my-1">
                  <span className="text-[10px] text-slate-400 bg-slate-800/80 border border-slate-700/50 px-2.5 py-0.5 rounded-full">
                    {msg.text}
                  </span>
                </div>
              );
            }

            return (
              <div key={msg.id || i} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className="flex-shrink-0 mt-auto">
                  <Avatar avatarId={msg.avatarId || getDefaultAvatar(msg.senderUsername)} name={msg.senderUsername} size="xs" />
                </div>
                <div className={`flex flex-col gap-0.5 max-w-[210px] ${isMe ? 'items-end' : 'items-start'}`}>
                  {!isMe && (
                    <span className="text-[10px] text-slate-400 font-semibold ml-1">@{msg.senderUsername}</span>
                  )}
                  <div
                    className={`px-3 py-2 rounded-2xl text-xs leading-relaxed break-words shadow-xs
                      ${isMe
                        ? 'bg-gradient-to-br from-teal-500 to-cyan-600 text-white rounded-tr-sm'
                        : 'bg-slate-800 text-slate-100 border border-slate-700/70 rounded-tl-sm'
                      }`}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[10px] text-slate-500 mx-1">{formatTime(msg.timestamp)}</span>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-3 pb-3 pt-2 border-t border-slate-700/60">
          <div className="flex gap-2 items-end bg-slate-800/90 rounded-2xl px-3 py-2 border border-slate-700/60 focus-within:border-teal-500/50 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message…"
              rows={1}
              className="flex-1 bg-transparent text-slate-100 text-xs placeholder-slate-500 resize-none outline-none leading-relaxed"
              style={{ maxHeight: '80px', overflowY: 'auto' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="flex-shrink-0 w-7 h-7 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shadow-sm"
            >
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
          <p className="text-[10px] text-slate-500 mt-1 text-center">Enter to send · Shift+Enter for newline</p>
        </div>
      </div>

      {/* ── Minimized Floating Bubble ────────────────────────── */}
      <button
        onClick={handleToggle}
        className={`mt-2 relative w-14 h-14 rounded-2xl shadow-xl transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center
          ${minimized
            ? 'bg-gradient-to-br from-teal-600 to-cyan-700 text-white'
            : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
          }`}
      >
        <div className="flex flex-col items-center justify-center">
          <span className="text-xl">💬</span>
          {minimized && (
            <span className="text-[9px] font-black text-teal-100 leading-none">CHAT</span>
          )}
        </div>
        {/* Unread badge */}
        {unreadCount > 0 && minimized && (
          <span className="absolute -top-1.5 -right-1.5 w-5.5 h-5.5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center shadow-lg animate-bounce">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
