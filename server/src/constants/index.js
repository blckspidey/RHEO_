/**
 * DropShare — Centralized Constants
 *
 * Centralizing all magic strings/numbers prevents typos and makes
 * refactoring safe. Never scatter raw strings like 'PAUSED' across
 * the codebase.
 */

// ─────────────────────────────────────────────────────────────────
// Transfer Status
// ─────────────────────────────────────────────────────────────────
const TRANSFER_STATUS = {
  PENDING:      'PENDING',      // Created, waiting for receiver to accept
  ACCEPTED:     'ACCEPTED',     // Receiver accepted, waiting for TRANSFER_START
  TRANSFERRING: 'TRANSFERRING', // Chunks actively flowing
  PAUSED:       'PAUSED',       // Sender/receiver paused — state preserved
  INTERRUPTED:  'INTERRUPTED',  // WebSocket disconnected mid-transfer
  COMPLETED:    'COMPLETED',    // All chunks received + SHA-256 verified
  FAILED:       'FAILED',       // Unrecoverable error
  CANCELLED:    'CANCELLED',    // User cancelled
  REJECTED:     'REJECTED',     // Receiver rejected the request
};

// ─────────────────────────────────────────────────────────────────
// Socket.IO Event Names — Application-Level Transfer Protocol
//
// These are the messages our application defines on top of
// WebSocket/Socket.IO. They are NOT TCP-level concepts.
// TCP handles reliable delivery underneath — we handle transfer
// identity, progress, and recovery at this application layer.
// ─────────────────────────────────────────────────────────────────
const SOCKET_EVENTS = {
  // ── Presence ──────────────────────────────────────────────────
  USER_ONLINE:              'USER_ONLINE',
  USER_OFFLINE:             'USER_OFFLINE',

  // ── Transfer Lifecycle ────────────────────────────────────────
  TRANSFER_REQUEST:         'TRANSFER_REQUEST',    // Sender → Server → Receiver
  TRANSFER_ACCEPT:          'TRANSFER_ACCEPT',     // Receiver → Server → Sender
  TRANSFER_REJECT:          'TRANSFER_REJECT',     // Receiver → Server → Sender
  TRANSFER_START:           'TRANSFER_START',      // Server → Sender (begin sending)
  TRANSFER_CANCEL:          'TRANSFER_CANCEL',     // Either party → Server
  TRANSFER_CANCEL_ACK:      'TRANSFER_CANCEL_ACK', // Server → Both parties

  // ── Chunk Transfer ────────────────────────────────────────────
  CHUNK:                    'CHUNK',               // Sender → Server → Receiver
  CHUNK_ACK:                'CHUNK_ACK',           // Receiver → Server → Sender

  // ── WebRTC Zero-Data Local Transfer Signaling ─────────────────
  WEBRTC_SIGNAL:            'WEBRTC_SIGNAL',       // Signaling for direct P2P local LAN stream
  LOCAL_PEERS_UPDATE:       'LOCAL_PEERS_UPDATE',  // Broadcast when local network peers change

  // ── Pause / Resume ────────────────────────────────────────────
  PAUSE_TRANSFER:           'PAUSE_TRANSFER',
  PAUSE_ACK:                'PAUSE_ACK',
  RESUME_TRANSFER:          'RESUME_TRANSFER',
  RESUME_ACK:               'RESUME_ACK',

  // ── Progress Reporting ────────────────────────────────────────
  TRANSFER_PROGRESS:        'TRANSFER_PROGRESS',   // Server → Sender (progress update)

  // ── Completion & Integrity ────────────────────────────────────
  TRANSFER_COMPLETE:        'TRANSFER_COMPLETE',   // Server → Both (all chunks done)
  HASH_VERIFY:              'HASH_VERIFY',         // Server → Receiver (compute hash)
  HASH_RESULT:              'HASH_RESULT',         // Receiver → Server → Sender

  // ── Connection Recovery ───────────────────────────────────────
  TRANSFER_RESUME_REQUEST:  'TRANSFER_RESUME_REQUEST',  // Client → Server after reconnect
  TRANSFER_RESUME_RESPONSE: 'TRANSFER_RESUME_RESPONSE', // Server → Client

  // ── Errors ────────────────────────────────────────────────────
  TRANSFER_FAILED:          'TRANSFER_FAILED',
  ERROR:                    'ERROR',

  // ── Room-Based Sharing ────────────────────────────────────────
  ROOM_CREATE:              'ROOM_CREATE',        // Client → Server: create a room
  ROOM_INVITE:              'ROOM_INVITE',        // Client → Server: creator invites a user
  ROOM_REMOVE_MEMBER:       'ROOM_REMOVE_MEMBER', // Client → Server: creator removes a user
  ROOM_LEAVE:               'ROOM_LEAVE',         // Client → Server: member leaves voluntarily
  ROOM_DISMISS:             'ROOM_DISMISS',       // Client → Server: creator destroys room
  ROOM_CHAT:                'ROOM_CHAT',          // Client → Server: send a chat message
  ROOM_GET_STATE:           'ROOM_GET_STATE',     // Client → Server: get current room state
  ROOM_FILE_SHARED:         'ROOM_FILE_SHARED',   // Server → Room:   file share notification

  // Server → Client broadcasts
  ROOM_INVITED:             'ROOM_INVITED',         // You were invited to a room
  ROOM_MEMBER_JOINED:       'ROOM_MEMBER_JOINED',
  ROOM_MEMBER_LEFT:         'ROOM_MEMBER_LEFT',
  ROOM_MEMBER_REMOVED:      'ROOM_MEMBER_REMOVED',  // You were removed from a room
  ROOM_DISMISSED:           'ROOM_DISMISSED',        // Room was destroyed by creator
  ROOM_CHAT_MESSAGE:        'ROOM_CHAT_MESSAGE',
  ROOM_STATE:               'ROOM_STATE',
};

// ─────────────────────────────────────────────────────────────────
// Redis Pub/Sub Channel Names
//
// Redis channels carry small control events between Node.js instances.
// File data is NEVER sent through Redis — only through the direct
// WebSocket connection (which is TCP underneath).
// ─────────────────────────────────────────────────────────────────
const REDIS_CHANNELS = {
  PRESENCE:          'presence',
  TRANSFER_EVENTS:   'transfer_events',
};

// ─────────────────────────────────────────────────────────────────
// HTTP Status Codes (for consistent API responses)
// ─────────────────────────────────────────────────────────────────
const HTTP_STATUS = {
  OK:                   200,
  CREATED:              201,
  BAD_REQUEST:          400,
  UNAUTHORIZED:         401,
  FORBIDDEN:            403,
  NOT_FOUND:            404,
  CONFLICT:             409,
  UNPROCESSABLE:        422,
  TOO_MANY_REQUESTS:    429,
  INTERNAL_ERROR:       500,
};

// ─────────────────────────────────────────────────────────────────
// Validation Limits
// ─────────────────────────────────────────────────────────────────
const VALIDATION = {
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 50,
  PASSWORD_MIN_LENGTH: 8,
  EMAIL_MAX_LENGTH:    255,
  FILENAME_MAX_LENGTH: 500,
  // Reconnection settings for the client (documented here for server reference)
  MAX_RECONNECT_ATTEMPTS: 5,
  RECONNECT_BASE_DELAY_MS: 1000,
};

module.exports = {
  TRANSFER_STATUS,
  SOCKET_EVENTS,
  REDIS_CHANNELS,
  HTTP_STATUS,
  VALIDATION,
};
