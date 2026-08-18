/**
 * RHEO — Login / Register Auth Page
 * Clean off-white + teal design with animated background + Quick Guest Local Share option.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

export default function AuthPage() {
  const [mode, setMode]             = useState('login');
  const [username, setUsername]     = useState('');
  const [password, setPassword]     = useState('');
  const [email, setEmail]           = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);

  // Guest Quick Share state
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [guestName, setGuestName]           = useState('');
  const [guestLoading, setGuestLoading]     = useState(false);

  const { login, guestLogin } = useAuth();
  const navigate  = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(username, password);
      } else {
        await api.post('/auth/register', { username, password, email, displayName });
        await login(username, password);
      }
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestSubmit = async (e) => {
    e.preventDefault();
    if (!guestName.trim()) return;
    setError('');
    setGuestLoading(true);
    try {
      await guestLogin(guestName.trim());
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to start guest session');
      setShowGuestModal(false);
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 relative overflow-hidden">
      {/* Subtle mesh grid background */}
      <div className="fixed inset-0 bg-mesh-grid pointer-events-none opacity-40" />

      {/* Teal ambient glow blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/3 w-[500px] h-[500px] rounded-full bg-teal-400/10 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-cyan-400/10 blur-[100px]" />
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-in space-y-4">
        {/* Main Card */}
        <div className="bg-white/92 backdrop-blur-md border border-slate-200 rounded-3xl shadow-xl shadow-slate-900/5 overflow-hidden">

          {/* Brand Header Strip */}
          <div className="bg-gradient-to-r from-teal-600 to-cyan-600 px-8 pt-8 pb-10 relative overflow-hidden">
            {/* Decorative wave rings */}
            <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full border-2 border-white/20" />
            <div className="absolute -right-2 -top-2 w-16 h-16 rounded-full border-2 border-white/10" />

            <div className="flex items-center gap-3 relative z-10">
              <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg border border-white/30">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                    d="M3 12c3-4 6-4 9 0s6 4 9 0M3 18c3-4 6-4 9 0s6 4 9 0" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-black text-white tracking-tight font-mono">RHEO</h1>
                <p className="text-xs text-teal-100 font-semibold mt-0.5">Real-Time P2P File Flow Mesh</p>
              </div>
            </div>

            <p className="text-sm text-white/80 mt-4 relative z-10 font-medium max-w-xs">
              {mode === 'login'
                ? 'Sign in to your mesh node and start flowing files instantly.'
                : 'Create your RHEO node identity to join the P2P mesh network.'}
            </p>
          </div>

          {/* Form Section */}
          <div className="px-8 py-6 space-y-5">
            {/* Tab switcher */}
            <div className="flex bg-slate-100 p-1 rounded-2xl">
              {['login', 'register'].map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError(''); }}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                    mode === m
                      ? 'bg-white text-teal-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {m === 'login' ? 'Sign In' : 'Create Account'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Display Name</label>
                    <input
                      id="displayName"
                      className="input"
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      placeholder="Ganesh Kumar"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Email</label>
                    <input
                      id="email"
                      type="email"
                      className="input"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="ganesh@example.com"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Username</label>
                <input
                  id="username"
                  className="input"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="ganesh"
                  required
                  autoComplete="username"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Password</label>
                <input
                  id="password"
                  type="password"
                  className="input"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs font-semibold animate-fade-in flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              <button
                id="submit-auth"
                type="submit"
                disabled={loading}
                className="btn-teal w-full py-3.5 mt-2 font-extrabold text-sm rounded-2xl shadow-lg shadow-teal-600/20"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Connecting to Mesh…
                  </span>
                ) : mode === 'login' ? '→ Sign In to RHEO' : '⚡ Initialize Node Identity'}
              </button>
            </form>

            <div className="pt-2 border-t border-slate-100 flex flex-col items-center gap-3">
              {/* Quick Local Share Option */}
              <button
                type="button"
                onClick={() => { setGuestName(''); setShowGuestModal(true); }}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 hover:from-emerald-100 hover:to-teal-100 border border-teal-200 text-teal-800 font-extrabold text-xs transition-all flex items-center justify-center gap-2 shadow-xs"
              >
                <span>⚡</span> Quick Local Share (No Login Needed)
              </button>

              <p className="text-center text-[11px] text-slate-400 font-mono">
                End-to-end binary stream · Zero mobile data · Local Wi-Fi
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Guest Name Modal */}
      {showGuestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowGuestModal(false)} />
          <div className="relative z-10 w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-6 text-white text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-white/20 mx-auto flex items-center justify-center text-2xl mb-2">⚡</div>
              <h3 className="text-lg font-black">Quick Local Share</h3>
              <p className="text-xs text-emerald-100">No account required. Transfer files over Local Wi-Fi without internet data.</p>
            </div>

            <form onSubmit={handleGuestSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-slate-600 mb-1.5 uppercase tracking-wider">
                  Temporary Username
                </label>
                <input
                  type="text"
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  placeholder="e.g. Ganesh-Laptop"
                  autoFocus
                  required
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowGuestModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={guestLoading || !guestName.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold shadow-md disabled:opacity-50"
                >
                  {guestLoading ? 'Starting…' : 'Start Sharing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
