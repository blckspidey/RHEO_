import { createContext, useContext, useState, useEffect } from 'react';
import { getSocket } from '../services/socket';
import { useAuth } from './AuthContext';

const PresenceContext = createContext(null);

export function PresenceProvider({ children }) {
  const { isAuthenticated, token } = useAuth();
  // Map<userId, 'online'|'offline'>
  const [presence, setPresence] = useState(new Map());

  useEffect(() => {
    if (!isAuthenticated || !token) return;

    let activeSocket = null;
    let timer = null;

    const onOnline  = ({ userId }) => setPresence(p => new Map(p).set(userId, 'online'));
    const onOffline = ({ userId }) => setPresence(p => new Map(p).set(userId, 'offline'));

    const attachListeners = () => {
      const socket = getSocket();
      if (!socket) {
        timer = setTimeout(attachListeners, 250);
        return;
      }

      activeSocket = socket;
      socket.off('USER_ONLINE',  onOnline);
      socket.off('USER_OFFLINE', onOffline);

      socket.on('USER_ONLINE',  onOnline);
      socket.on('USER_OFFLINE', onOffline);
    };

    attachListeners();

    return () => {
      if (timer) clearTimeout(timer);
      if (activeSocket) {
        activeSocket.off('USER_ONLINE',  onOnline);
        activeSocket.off('USER_OFFLINE', onOffline);
      }
    };
  }, [isAuthenticated, token]);

  const isOnline = (userId) => {
    const status = presence.get(userId);
    return status === 'online' || status === true;
  };

  const queryPresence = (userIds) => {
    if (!userIds || userIds.length === 0) return;
    const socket = getSocket();
    if (!socket) return;
    socket.emit('GET_PRESENCE', { userIds }, (res) => {
      if (!res || !res.success || !res.presence) return;
      setPresence(prev => {
        const next = new Map(prev);
        Object.entries(res.presence).forEach(([id, status]) => {
          const val = (status === true || status === 'online') ? 'online' : 'offline';
          next.set(id, val);
        });
        return next;
      });
    });
  };

  return (
    <PresenceContext.Provider value={{ presence, isOnline, queryPresence }}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence() {
  return useContext(PresenceContext);
}

