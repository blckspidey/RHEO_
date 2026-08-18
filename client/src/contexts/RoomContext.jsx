/**
 * RHEO — Room Context
 *
 * Manages the active sharing room state.
 * Connects to the ROOM_* socket events from roomHandler.js on the server.
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getSocket } from '../services/socket';
import { useAuth } from './AuthContext';

const RoomContext = createContext(null);

const MAX_CHAT_HISTORY = 200;

export function RoomProvider({ children }) {
  const { isAuthenticated, token } = useAuth();

  // The currently active room (null if not in a room)
  const [activeRoom, setActiveRoom]           = useState(null);
  // List of currently active rooms on network
  const [activeRoomsList, setActiveRoomsList] = useState([]);
  // Pending room invitation while user is already in a room or to show a toast
  const [pendingInvite, setPendingInvite]     = useState(null);
  // Chat messages for the active room (pure text messages)
  const [chatMessages, setChatMessages]       = useState([]);
  // Is the chat box expanded?
  const [chatOpen, setChatOpen]               = useState(true);
  // Unread count (when chat is closed)
  const [unreadCount, setUnreadCount]         = useState(0);
  // Loading & error states
  const [creating, setCreating]               = useState(false);
  const [joining, setJoining]                 = useState(false);
  const [error, setError]                     = useState('');

  const activeRoomRef = useRef(null);

  // Keep ref in sync for socket callbacks
  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  // ── Add a chat message ────────────────────────────────────────
  const addChatMessage = useCallback((message) => {
    setChatMessages(prev => {
      const next = [...prev, message];
      return next.length > MAX_CHAT_HISTORY ? next.slice(-MAX_CHAT_HISTORY) : next;
    });
    setChatOpen(prev => {
      if (!prev) setUnreadCount(u => u + 1);
      return prev;
    });
  }, []);

  // ── Fetch active public rooms ──────────────────────────────────
  const fetchActiveRooms = useCallback(async () => {
    const socket = getSocket();
    if (!socket) return [];
    return new Promise((resolve) => {
      socket.emit('ROOM_GET_ACTIVE_ROOMS', {}, (res) => {
        if (res?.success && Array.isArray(res.data?.activeRooms)) {
          setActiveRoomsList(res.data.activeRooms);
          resolve(res.data.activeRooms);
        } else {
          setActiveRoomsList([]);
          resolve([]);
        }
      });
    });
  }, []);

  // ── Socket event handlers ─────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || !token) return;

    let activeSocket = null;
    let timer = null;

    const onRoomInvited = ({ room }) => {
      const socket = getSocket();
      if (!socket) return;

      socket.emit('ROOM_JOIN', { roomId: room.roomId }, (res) => {
        if (res?.success && res.data?.room) {
          const joined = res.data.room;
          setActiveRoom(joined);
          setChatMessages(joined.chatHistory || []);
          setChatOpen(true);
          setUnreadCount(0);
        } else {
          setPendingInvite(room);
        }
      });
    };

    const onRoomMemberJoined = ({ roomId, userId, username, avatarId }) => {
      if (!activeRoomRef.current || activeRoomRef.current.roomId !== roomId) return;
      setActiveRoom(prev => {
        if (!prev) return prev;
        const existing = prev.members.find(m => m.id === userId);
        if (existing) {
          return { ...prev, members: prev.members.map(m => m.id === userId ? { ...m, online: true, avatarId } : m) };
        }
        return { ...prev, members: [...prev.members, { id: userId, username, avatarId, online: true }] };
      });
      addChatMessage({
        id: `sys-${Date.now()}`,
        type: 'system',
        text: `${username} joined the room`,
        timestamp: new Date().toISOString(),
      });
    };

    const onRoomMemberLeft = ({ roomId, userId, reason }) => {
      if (!activeRoomRef.current || activeRoomRef.current.roomId !== roomId) return;
      setActiveRoom(prev => {
        if (!prev) return prev;
        // Purge member strictly (offline users do not stay in active rooms)
        return { ...prev, members: prev.members.filter(m => m.id !== userId) };
      });
    };

    const onRoomMemberRemoved = ({ roomId }) => {
      if (activeRoomRef.current?.roomId === roomId) {
        setActiveRoom(null);
        setChatMessages([]);
        setUnreadCount(0);
        setError('You were removed from the room.');
        setTimeout(() => setError(''), 5000);
      }
    };

    const onRoomDismissed = ({ roomId }) => {
      if (activeRoomRef.current?.roomId === roomId) {
        setActiveRoom(null);
        setChatMessages([]);
        setUnreadCount(0);
        setError('The room was closed.');
        setTimeout(() => setError(''), 5000);
      }
    };

    const onRoomChatMessage = ({ roomId, message }) => {
      if (activeRoomRef.current?.roomId !== roomId) return;
      addChatMessage(message);
    };

    const onRoomFileShared = ({ roomId, notice }) => {
      if (activeRoomRef.current?.roomId !== roomId) return;
      setActiveRoom(prev => {
        if (!prev) return prev;
        const currentFiles = prev.filesShared || [];
        if (currentFiles.some(f => f.id === notice.id)) return prev;
        return { ...prev, filesShared: [notice, ...currentFiles] };
      });
    };

    const attach = () => {
      const s = getSocket();
      if (s) {
        activeSocket = s;
        s.off('ROOM_INVITED',        onRoomInvited);
        s.off('ROOM_MEMBER_JOINED',  onRoomMemberJoined);
        s.off('ROOM_MEMBER_LEFT',    onRoomMemberLeft);
        s.off('ROOM_MEMBER_REMOVED', onRoomMemberRemoved);
        s.off('ROOM_DISMISSED',      onRoomDismissed);
        s.off('ROOM_CHAT_MESSAGE',   onRoomChatMessage);
        s.off('ROOM_FILE_SHARED',    onRoomFileShared);

        s.on('ROOM_INVITED',        onRoomInvited);
        s.on('ROOM_MEMBER_JOINED',  onRoomMemberJoined);
        s.on('ROOM_MEMBER_LEFT',    onRoomMemberLeft);
        s.on('ROOM_MEMBER_REMOVED', onRoomMemberRemoved);
        s.on('ROOM_DISMISSED',      onRoomDismissed);
        s.on('ROOM_CHAT_MESSAGE',   onRoomChatMessage);
        s.on('ROOM_FILE_SHARED',    onRoomFileShared);

        fetchActiveRooms();
      } else {
        timer = setTimeout(attach, 250);
      }
    };

    attach();

    return () => {
      if (timer) clearTimeout(timer);
      if (activeSocket) {
        activeSocket.off('ROOM_INVITED',        onRoomInvited);
        activeSocket.off('ROOM_MEMBER_JOINED',  onRoomMemberJoined);
        activeSocket.off('ROOM_MEMBER_LEFT',    onRoomMemberLeft);
        activeSocket.off('ROOM_MEMBER_REMOVED', onRoomMemberRemoved);
        activeSocket.off('ROOM_DISMISSED',      onRoomDismissed);
        activeSocket.off('ROOM_CHAT_MESSAGE',   onRoomChatMessage);
        activeSocket.off('ROOM_FILE_SHARED',    onRoomFileShared);
      }
    };
  }, [isAuthenticated, token, addChatMessage, fetchActiveRooms]);

  // ── Public Actions ────────────────────────────────────────────

  const createRoom = useCallback(async (name) => {
    const socket = getSocket();
    if (!socket) throw new Error('Not connected');
    setCreating(true);
    setError('');
    return new Promise((resolve, reject) => {
      socket.emit('ROOM_CREATE', { name }, (res) => {
        setCreating(false);
        if (res?.success && res.data?.room) {
          const room = res.data.room;
          setActiveRoom(room);
          setChatMessages(room.chatHistory || []);
          setChatOpen(true);
          setUnreadCount(0);
          resolve(room);
        } else {
          const msg = res?.message || 'Failed to create room';
          setError(msg);
          reject(new Error(msg));
        }
      });
    });
  }, []);

  const joinRoomByCode = useCallback(async (code) => {
    const socket = getSocket();
    if (!socket) throw new Error('Not connected');
    setJoining(true);
    setError('');
    return new Promise((resolve, reject) => {
      socket.emit('ROOM_JOIN_BY_CODE', { code }, (res) => {
        setJoining(false);
        if (res?.success && res.data?.room) {
          const room = res.data.room;
          setActiveRoom(room);
          setChatMessages(room.chatHistory || []);
          setChatOpen(true);
          setUnreadCount(0);
          resolve(room);
        } else {
          const msg = res?.message || 'Failed to join room';
          setError(msg);
          reject(new Error(msg));
        }
      });
    });
  }, []);

  const inviteMember = useCallback((userId) => {
    const socket = getSocket();
    const room = activeRoomRef.current;
    if (!socket || !room) return Promise.reject(new Error('No active room'));
    return new Promise((resolve, reject) => {
      socket.emit('ROOM_INVITE', { roomId: room.roomId, userId }, (res) => {
        if (res?.success) {
          if (res.data?.room) setActiveRoom(res.data.room);
          resolve(res.data?.room);
        } else {
          reject(new Error(res?.message || 'Failed to invite'));
        }
      });
    });
  }, []);

  const removeMember = useCallback((targetUserId) => {
    const socket = getSocket();
    const room = activeRoomRef.current;
    if (!socket || !room) return Promise.reject(new Error('No active room'));
    return new Promise((resolve, reject) => {
      socket.emit('ROOM_REMOVE_MEMBER', { roomId: room.roomId, userId: targetUserId }, (res) => {
        if (res?.success) {
          if (res.data?.room) setActiveRoom(res.data.room);
          resolve();
        } else {
          reject(new Error(res?.message || 'Failed to remove'));
        }
      });
    });
  }, []);

  const leaveRoom = useCallback(() => {
    const socket = getSocket();
    const room = activeRoomRef.current;
    if (!socket || !room) return;
    socket.emit('ROOM_LEAVE', { roomId: room.roomId }, () => {
      setActiveRoom(null);
      setChatMessages([]);
      setUnreadCount(0);
    });
  }, []);

  const dismissRoom = useCallback(() => {
    const socket = getSocket();
    const room = activeRoomRef.current;
    if (!socket || !room) return;
    socket.emit('ROOM_DISMISS', { roomId: room.roomId }, () => {
      setActiveRoom(null);
      setChatMessages([]);
      setUnreadCount(0);
    });
  }, []);

  const sendChatMessage = useCallback((text) => {
    const socket = getSocket();
    const room = activeRoomRef.current;
    if (!socket || !room || !text?.trim()) return;
    socket.emit('ROOM_CHAT', { roomId: room.roomId, text });
  }, []);

  const notifyFileShared = useCallback((fileName, fileSize, transferId) => {
    const socket = getSocket();
    const room = activeRoomRef.current;
    if (!socket || !room) return;
    socket.emit('ROOM_FILE_SHARED', { roomId: room.roomId, fileName, fileSize, transferId });
  }, []);

  const openChat = useCallback(() => {
    setChatOpen(true);
    setUnreadCount(0);
  }, []);

  const closeChat = useCallback(() => {
    setChatOpen(false);
  }, []);

  return (
    <RoomContext.Provider value={{
      activeRoom,
      activeRoomsList,
      pendingInvite,
      chatMessages,
      chatOpen,
      unreadCount,
      creating,
      joining,
      error,
      setError,
      fetchActiveRooms,
      createRoom,
      joinRoomByCode,
      inviteMember,
      removeMember,
      leaveRoom,
      dismissRoom,
      sendChatMessage,
      notifyFileShared,
      openChat,
      closeChat,
    }}>
      {children}
    </RoomContext.Provider>
  );
}

export function useRoom() {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error('useRoom must be used inside RoomProvider');
  return ctx;
}
