/**
 * RHEO — Clean Floating Dynamic Island Navbar
 * Responsive, overflow-safe for mobile screens with clean typography.
 */
import Avatar from './Avatar';

export default function Navbar({
  mode,
  setMode,
  user,
  currentAvatar,
  onOpenProfile,
  pendingRequestsCount = 0,
  hasActiveRoom = false,
}) {
  return (
    <header className="sticky top-3 sm:top-4 z-40 px-3 sm:px-6 max-w-6xl mx-auto w-full">
      <div className="card-glass px-3 sm:px-6 py-2 sm:py-3 border border-slate-200/90 shadow-md shadow-teal-900/5 rounded-2xl sm:rounded-3xl flex items-center justify-between gap-2 sm:gap-4">
        
        {/* Brand Logo */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-teal-600 via-teal-500 to-cyan-500 flex items-center justify-center shadow-md shadow-teal-500/20 text-white flex-shrink-0">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12c3-4 6-4 9 0s6 4 9 0M3 18c3-4 6-4 9 0s6 4 9 0" />
            </svg>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-lg sm:text-xl tracking-tight text-slate-900 font-mono">
              RHEO
            </span>
          </div>
        </div>

        {/* Central Mode Switcher Pill */}
        <nav aria-label="Mode Navigation" className="flex items-center bg-slate-100/90 p-1 rounded-xl sm:rounded-2xl border border-slate-200/70 flex-shrink-0">
          <button
            onClick={() => setMode('sender')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg sm:rounded-xl text-xs font-bold transition-all cursor-pointer ${
              mode === 'sender'
                ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80 font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="text-xs">Send</span>
          </button>

          <button
            onClick={() => setMode('receiver')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg sm:rounded-xl text-xs font-bold transition-all relative cursor-pointer ${
              mode === 'receiver'
                ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80 font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
            </svg>
            <span className="text-xs">Receive</span>
            {pendingRequestsCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping absolute -top-0.5 -right-0.5" />
            )}
          </button>

          {/* Room Mode Button */}
          <button
            onClick={() => setMode('room')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg sm:rounded-xl text-xs font-bold transition-all relative cursor-pointer ${
              mode === 'room'
                ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-sm font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="text-xs">🏠</span>
            <span className="text-xs">Room</span>
            {hasActiveRoom && (
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse absolute -top-0.5 -right-0.5" />
            )}
          </button>
        </nav>

        {/* User Profile Trigger */}
        <div className="flex items-center flex-shrink-0">
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-1.5 sm:gap-2.5 p-1 sm:pl-2 sm:pr-3 sm:py-1.5 rounded-xl sm:rounded-2xl bg-slate-100/90 hover:bg-slate-200/80 border border-slate-200/80 transition-all cursor-pointer"
            title="Open Profile & Transfers"
          >
            <div className="relative flex-shrink-0">
              <Avatar avatarId={currentAvatar} name={user?.displayName || user?.username} size="sm" className="!w-7 !h-7 sm:!w-8 sm:!h-8 text-xs" />
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
            </div>
            <div className="text-left hidden md:block max-w-[100px] truncate">
              <p className="text-xs font-bold text-slate-800 leading-none truncate">
                {user?.displayName || user?.username}
              </p>
              <p className="text-[10px] text-teal-600 font-mono mt-0.5 truncate">@{user?.username}</p>
            </div>
            <svg className="w-3 h-3 text-slate-400 hidden sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

      </div>
    </header>
  );
}
