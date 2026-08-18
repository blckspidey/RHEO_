/**
 * RHEO — Main Dashboard Page
 * Orchestrates the floating dynamic navbar, active Flow mode (Send / Receive / Room),
 * customizable avatar system, profile/activity modal, and room panel + chat.
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTransfer } from '../contexts/TransferContext';
import { useRoom } from '../contexts/RoomContext';
import Navbar from '../components/Navbar';
import SenderMode from '../components/SenderMode';
import ReceiverMode from '../components/ReceiverMode';
import ProfileModal from '../components/ProfileModal';
import IncomingRequests from '../components/IncomingRequests';
import RoomPanel from '../components/RoomPanel';
import RoomChatBox from '../components/RoomChatBox';
import CreateRoomModal from '../components/CreateRoomModal';
import { getSocket } from '../services/socket';

export default function Dashboard() {
  const { user } = useAuth();
  const { pendingRequests } = useTransfer();
  const { activeRoom } = useRoom();

  const [mode, setMode] = useState('sender'); // 'sender' | 'receiver' | 'room'
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
  const [currentAvatar, setCurrentAvatar] = useState(() => {
    return localStorage.getItem('rheo_avatar') || localStorage.getItem('ds_avatar') || 'fox';
  });

  // Auto-switch to room mode when a room becomes active
  useEffect(() => {
    if (activeRoom && mode !== 'room') {
      setMode('room');
    }
    if (!activeRoom && mode === 'room') {
      setMode('sender');
    }
  }, [activeRoom]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectAvatar = (avatarId) => {
    setCurrentAvatar(avatarId);
    localStorage.setItem('rheo_avatar', avatarId);
    localStorage.setItem('ds_avatar', avatarId);

    const avatarIndexMap = {
      fox: 0, panda: 1, cat: 2, dog: 3, rabbit: 4, bear: 5, koala: 6, penguin: 7,
      frog: 8, hamster: 9, wolf: 10, duck: 11, pig: 12, tiger: 13, lion: 14, monkey: 15
    };
    const avatarIndex = avatarIndexMap[avatarId] ?? 0;

    const socket = getSocket();
    if (socket) {
      socket.emit('UPDATE_AVATAR', { avatarId, avatarIndex });
    }
  };

  const handleModeChange = (newMode) => {
    if (newMode === 'room' && !activeRoom) {
      setIsCreateRoomOpen(true);
    } else {
      setMode(newMode);
    }
  };

  const handleRoomCreated = (room) => {
    setIsCreateRoomOpen(false);
    if (room) {
      setMode('room');
    }
  };

  // If there are pending incoming requests and user is on sender mode, give subtle cue
  useEffect(() => {
    if (pendingRequests && pendingRequests.length > 0) {
      // User can switch or handle via floating notification
    }
  }, [pendingRequests]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col relative selection:bg-teal-500 selection:text-white">
      {/* Mesh grid background */}
      <div className="fixed inset-0 bg-mesh-grid pointer-events-none z-0 opacity-40" />

      {/* Floating Dynamic Island Navbar */}
      <Navbar
        mode={mode}
        setMode={handleModeChange}
        user={user}
        currentAvatar={currentAvatar}
        onOpenProfile={() => setIsProfileOpen(true)}
        pendingRequestsCount={pendingRequests?.length || 0}
        hasActiveRoom={!!activeRoom}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-8 sm:py-10 relative z-10">
        {mode === 'sender' && <SenderMode />}
        {mode === 'receiver' && <ReceiverMode />}
        {mode === 'room' && activeRoom && <RoomPanel />}
        {mode === 'room' && !activeRoom && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 animate-fade-in">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-4xl shadow-lg">
              🏠
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-extrabold text-slate-900">No active room</h2>
              <p className="text-slate-500 text-sm max-w-xs">
                Create a room to share multiple files and chat with your team in real time.
              </p>
            </div>
            <button
              onClick={() => setIsCreateRoomOpen(true)}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-bold shadow-lg hover:shadow-xl hover:from-teal-700 hover:to-cyan-700 transition-all flex items-center gap-2.5"
            >
              <span>🏠</span> Create a Room
            </button>
          </div>
        )}
      </main>

      {/* Floating Incoming Transfer Alerts */}
      <IncomingRequests />

      {/* Floating Chat Box (always visible when in a room) */}
      <RoomChatBox />

      {/* Create Room Modal */}
      <CreateRoomModal
        isOpen={isCreateRoomOpen}
        onClose={handleRoomCreated}
      />

      {/* Profile & Activity Modal */}
      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        currentAvatar={currentAvatar}
        onSelectAvatar={handleSelectAvatar}
      />

      {/* Clean Modern Footer */}
      <footer className="relative z-10 border-t border-slate-200/80 py-6 px-4 sm:px-8 bg-white/50 backdrop-blur-sm text-center text-xs text-slate-400">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 font-mono">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-slate-900 tracking-wider">RHEO</span>
            <span>·</span>
            <span>Real-Time P2P Flow Mesh</span>
          </div>
          <div className="flex items-center gap-3">
            {activeRoom && (
              <span className="flex items-center gap-1.5 text-teal-700 font-semibold">
                <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                Room Active · {activeRoom.members?.length || 0} members
              </span>
            )}
            {!activeRoom && (
              <span className="flex items-center gap-1.5 text-teal-700 font-semibold">
                <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                Node WebSocket Relay Connected
              </span>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
