import { io } from 'socket.io-client';

const getSocketUrl = () => {
  if (import.meta.env.VITE_SOCKET_URL && !import.meta.env.VITE_SOCKET_URL.includes('localhost')) {
    return import.meta.env.VITE_SOCKET_URL;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:5000`;
  }
  return 'http://localhost:5000';
};

let socket = null;
let currentToken = null;

export function initSocket(token) {
  if (!token) {
    disconnectSocket();
    return null;
  }

  if (socket && currentToken === token) {
    if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  currentToken = token;
  const savedAvatar = localStorage.getItem('rheo_avatar') || localStorage.getItem('ds_avatar') || 'fox';
  const avatarIndexMap = {
    fox: 0, panda: 1, cat: 2, dog: 3, rabbit: 4, bear: 5, koala: 6, penguin: 7,
    frog: 8, hamster: 9, wolf: 10, duck: 11, pig: 12, tiger: 13, lion: 14, monkey: 15
  };
  const avatarIndex = avatarIndexMap[savedAvatar] ?? 0;

  socket = io(getSocketUrl(), {
    auth: { token, avatarId: savedAvatar, avatarIndex },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 10,
    reconnectionDelay: 1500,
  });

  return socket;
}


export function getSocket() {
  if (!socket) {
    const token = currentToken || localStorage.getItem('ds_token');
    if (token) {
      return initSocket(token);
    }
  }
  return socket;
}

export function disconnectSocket() {
  currentToken = null;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

