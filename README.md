# DropShare V1 — Real-Time Multi-User File Transfer System

> A clean, relay-based file transfer system built on WebSocket (Socket.IO), Node.js, PostgreSQL, and Redis. Designed to be fully understandable, explainable, and production-ready at V1 scale.

---

## Table of Contents

1. [What This Is](#what-this-is)
2. [Architecture Overview](#architecture-overview)
3. [Networking Deep-Dive](#networking-deep-dive)
4. [Directory Structure](#directory-structure)
5. [Data Flow — Sending a File](#data-flow--sending-a-file)
6. [Transfer State Machine](#transfer-state-machine)
7. [Database Schema](#database-schema)
8. [Redis Usage](#redis-usage)
9. [Connection Recovery](#connection-recovery)
10. [Running Locally (Docker)](#running-locally-docker)
11. [Running Without Docker](#running-without-docker)
12. [Environment Variables](#environment-variables)
13. [API Reference](#api-reference)
14. [Socket.IO Events](#socketio-events)
15. [Scaling to Multiple Instances](#scaling-to-multiple-instances)

---

## What This Is

DropShare is a **server-relay file transfer system**. When Ganesh sends a file to Rahul:

```
Ganesh's Browser  ──WebSocket──►  DropShare Server  ──WebSocket──►  Rahul's Browser
```

- **No WebRTC.** No STUN/TURN. No peer-to-peer complexity.
- **No full-file buffering.** The server relays one chunk at a time (~1 MB each).
- **Resumable.** If either side disconnects mid-transfer, it picks up from the last confirmed chunk.
- **Multi-recipient.** One send operation creates independent transfers for each recipient.

> "The objective is not to build Dropbox. The objective is to build a clean, reliable, scalable V1 networking project."

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Client Layer                                │
│                                                                      │
│   React (Vite) + socket.io-client + Axios                           │
│   Auth → Dashboard → DropZone → UserSearch → TransferCards          │
└───────────────────────┬──────────────────────────────────────────────┘
                        │  HTTP (REST) + WebSocket (WS upgrade over TCP)
                        ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          Nginx / ALB                                 │
│                                                                      │
│   Handles WebSocket upgrade headers:                                 │
│     Upgrade: websocket                                               │
│     Connection: Upgrade                                              │
└───────────────────────┬──────────────────────────────────────────────┘
                        │
          ┌─────────────┴─────────────┐
          ▼                           ▼
┌──────────────────┐       ┌──────────────────┐
│   Node.js EC2-1  │       │   Node.js EC2-2  │   (horizontal scale)
│                  │       │                  │
│  Express (REST)  │       │  Express (REST)  │
│  Socket.IO       │◄─────►│  Socket.IO       │
│  TransferManager │  Redis│  TransferManager │
└────────┬─────────┘  Pub/ └────────┬─────────┘
         │            Sub           │
         └──────────────────────────┘
                        │
          ┌─────────────┴─────────────┐
          ▼                           ▼
┌──────────────────┐       ┌──────────────────┐
│   PostgreSQL     │       │   Redis           │
│                  │       │                  │
│  users           │       │  Presence (TTL)  │
│  transfer_groups │       │  Pub/Sub channels│
│  transfers       │       │  (presence,      │
│  (checkpoints)   │       │   transfer_events│
└──────────────────┘       └──────────────────┘
```

---

## Networking Deep-Dive

### TCP → WebSocket → Socket.IO → Application

Every file chunk travels through these layers:

```
Application Layer   │  CHUNK event { transferId, chunkIndex, ArrayBuffer }
─────────────────── │  ──────────────────────────────────────────────────
Socket.IO           │  Frames the message, handles reconnection
WebSocket           │  Bidirectional, full-duplex messages over TCP
TCP                 │  Reliable delivery, ordering, retransmission,
                    │  congestion control, flow control
IP / Ethernet       │  Packet routing
```

**Why WebSocket and not plain HTTP?**

| HTTP (polling)             | WebSocket                              |
|----------------------------|----------------------------------------|
| New TCP connection per req | One persistent TCP connection          |
| Client initiates every req | Server can push at any time            |
| High overhead for chunks   | Near-zero overhead per chunk           |
| Not suitable for streaming | Designed for real-time bidirectional   |

### WebSocket Handshake

```
Client → Server:
  GET /socket.io/?transport=websocket HTTP/1.1
  Upgrade: websocket
  Connection: Upgrade
  Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==

Server → Client:
  HTTP/1.1 101 Switching Protocols
  Upgrade: websocket
  Connection: Upgrade
  Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

After this, the connection **upgrades from HTTP to WebSocket** — a persistent, full-duplex TCP channel. File chunks flow over this channel with no further HTTP overhead.

### TCP vs Application-Level ACKs

A common misconception: "TCP already does reliable delivery, why do we ACK chunks ourselves?"

| Layer | What it guarantees |
|---|---|
| **TCP ACK** | "The TCP stack on the receiver got these bytes" |
| **Application ACK (ours)** | "The receiver app processed this chunk and wrote it to memory" |

TCP can deliver bytes to the socket buffer, but:
- The browser tab could crash before processing them
- The WebSocket could disconnect after TCP delivery but before app processing
- We need to know **which chunk to resume from** after a reconnection

Our `CHUNK_ACK` events are application-level confirmations, enabling precise resume.

### Backpressure

The sender does NOT flood the socket. We limit `MAX_IN_FLIGHT_CHUNKS = 4` (configurable). At any moment, the sender has at most 4 chunks pending acknowledgement:

```
Sender:  [sent ch0] [sent ch1] [sent ch2] [sent ch3] ← pauses here
Receiver: ACK ch0 → Sender sends ch4
Receiver: ACK ch1 → Sender sends ch5
...
```

This prevents memory exhaustion when the receiver is slower than the sender (e.g., slow disk writes on the receiver side).

---

## Directory Structure

```
File_Sharing/
├── docker-compose.yml          # PostgreSQL + Redis + Server + Nginx (local)
├── .env.example                # All environment variable templates
├── nginx/
│   └── nginx.conf              # WebSocket proxy config
├── database/
│   └── migrations/
│       └── 001_initial.sql     # Full schema (users, transfer_groups, transfers)
│
├── server/                     # Node.js backend
│   ├── Dockerfile              # Multi-stage, non-root
│   ├── package.json
│   └── src/
│       ├── server.js           # HTTP server entry, graceful shutdown
│       ├── app.js              # Express config, routes, middleware
│       ├── constants/
│       │   └── index.js        # All magic strings (TRANSFER_STATUS, SOCKET_EVENTS, ...)
│       ├── config/
│       │   ├── env.js          # Single source of truth for process.env
│       │   ├── db.js           # PostgreSQL pool (pg)
│       │   └── redis.js        # Redis clients (publisher, subscriber, client)
│       ├── utils/
│       │   └── logger.js       # Structured JSON logger
│       ├── middleware/
│       │   ├── auth.js         # JWT verification middleware
│       │   ├── errorHandler.js # Centralized error + 404 handling
│       │   └── validation.js   # Input sanitization
│       ├── services/
│       │   ├── authService.js  # bcrypt + JWT business logic
│       │   ├── userService.js  # Search, profile, last_seen
│       │   └── transferService.js # Transfer DB operations + checkpointing
│       ├── controllers/
│       │   ├── authController.js
│       │   └── userController.js
│       ├── routes/
│       │   ├── auth.js         # POST /api/auth/register, /login, /refresh
│       │   ├── users.js        # GET /api/users/search, /:id/status
│       │   └── transfers.js    # GET /api/transfers, /:id
│       ├── redis/
│       │   ├── presence.js     # setUserOnline/Offline, getBulkPresence (Redis TTL)
│       │   └── pubsub.js       # publish/subscribe helpers for cross-instance events
│       ├── sockets/
│       │   ├── index.js        # Socket.IO init, JWT middleware, Redis event routing
│       │   ├── presenceHandler.js  # GET_PRESENCE socket event
│       │   ├── transferHandler.js  # TRANSFER_REQUEST/ACCEPT/REJECT/CANCEL
│       │   ├── chunkHandler.js     # CHUNK/CHUNK_ACK/PAUSE/RESUME + disconnect
│       │   └── recoveryHandler.js  # TRANSFER_RESUME_REQUEST (reconnect recovery)
│       └── transfer/
│           ├── TransferState.js    # In-memory state for one active transfer
│           └── TransferManager.js  # Singleton registry of all active transfers
│
└── client/                     # React frontend (Vite)
    ├── index.html
    ├── vite.config.js
    ├── postcss.config.js
    ├── tailwind.config.js
    ├── .env                    # VITE_API_URL, VITE_SOCKET_URL
    └── src/
        ├── main.jsx
        ├── App.jsx             # BrowserRouter + AuthProvider + ProtectedRoute
        ├── index.css           # Tailwind v4 @theme tokens + utility classes
        ├── services/
        │   ├── api.js          # Axios with JWT interceptors
        │   └── socket.js       # Socket.IO singleton (initSocket / getSocket)
        ├── utils/
        │   └── fileUtils.js    # readChunk, computeFileHash (Web Crypto), formatters
        ├── contexts/
        │   ├── AuthContext.jsx      # Login, logout, token persistence
        │   ├── TransferContext.jsx  # Full send/receive state + socket events
        │   └── PresenceContext.jsx  # USER_ONLINE/OFFLINE real-time presence
        ├── pages/
        │   ├── AuthPage.jsx    # Login + Register tabs
        │   └── Dashboard.jsx   # Send panel + active transfers + history
        └── components/
            ├── DropZone.jsx        # Drag-and-drop file selector
            ├── UserSearch.jsx      # Live user search with online badges
            ├── TransferCard.jsx    # Progress bar, speed, ETA, actions
            └── IncomingRequests.jsx # Accept/Decline modal
```

---

## Data Flow — Sending a File

### Step 1: User selects file and recipients

```
Ganesh picks "movie.mp4" (2 GB) and selects Rahul and Amit.
Client computes:  totalChunks = ceil(2GB / 1MB) = 2048
Client computes:  SHA-256 hash (Web Crypto API, async)
```

### Step 2: TRANSFER_REQUEST

```
Ganesh's client  ──TRANSFER_REQUEST──►  Server
  { fileName, fileSize, totalChunks, fileHash, receiverIds: [rahul, amit] }

Server:
  1. Creates 1 transfer_group row in PostgreSQL
  2. Creates 2 transfer rows (T001 for Rahul, T002 for Amit)
  3. Routes TRANSFER_REQUEST event to Rahul (and Amit)
```

### Step 3: Receiver Accepts

```
Rahul's client  ──TRANSFER_ACCEPT──►  Server
  { transferId: 'T001' }

Server:
  1. Updates T001 status → ACCEPTED in PostgreSQL
  2. Creates TransferState in TransferManager (in-memory)
  3. Emits TRANSFER_START to Ganesh's socket
```

### Step 4: Chunk Transfer Loop

```
Ganesh's client (sender loop, MAX_IN_FLIGHT = 4):
  read chunk 0 from File API  → emit CHUNK { idx: 0, data: ArrayBuffer }
  read chunk 1                → emit CHUNK { idx: 1, data: ArrayBuffer }
  read chunk 2                → emit CHUNK { idx: 2, data: ArrayBuffer }
  read chunk 3                → emit CHUNK { idx: 3, data: ArrayBuffer }
  ← WAITS (4 in flight) ─────────────────────────────────────────────

Server receives CHUNK (idx: 0):
  state.markSent(0, chunkBytes)
  → finds Rahul's socket
  → emit CHUNK to Rahul (immediate relay, no full-file buffer)

Rahul's client receives CHUNK (idx: 0):
  stores chunk in receiverState.chunks[0]
  emit CHUNK_ACK { transferId, chunkIndex: 0 }

Server receives CHUNK_ACK (idx: 0):
  state.acknowledgeChunk(0, checkpointInterval)
  → if chunksSinceLastCheckpoint >= 50: UPDATE transfers SET last_confirmed_chunk = 0
  → forwards CHUNK_ACK to Ganesh's socket

Ganesh's client receives CHUNK_ACK (idx: 0):
  inFlight-- (now 3)
  → reads chunk 4, emits CHUNK { idx: 4 }
  ... loop continues
```

### Step 5: Completion + Hash Verification

```
Server detects all chunks ACK'd:
  → emit HASH_VERIFY to Rahul { expectedHash: 'abc123...' }
  → emit TRANSFER_COMPLETE to Ganesh

Rahul's client:
  Blob.arrayBuffer() → crypto.subtle.digest('SHA-256') → hex string
  emit HASH_RESULT { transferId, receiverHash, verified: true/false }

Server relays HASH_RESULT to Ganesh.

If verified:
  Browser triggers download of the reassembled Blob.
  Status → COMPLETED in PostgreSQL.

If NOT verified:
  Status → FAILED. User sees "Hash mismatch — file corrupted".
```

---

## Transfer State Machine

```
                    ┌──────────┐
                    │ PENDING  │  (created, waiting for receiver)
                    └────┬─────┘
                         │ TRANSFER_ACCEPT
                    ┌────▼─────┐
                    │ ACCEPTED │  (accepted, waiting for sender to start)
                    └────┬─────┘
                         │ TRANSFER_START + chunks begin
                    ┌────▼──────────┐
              ┌────►│ TRANSFERRING  │◄────┐
              │     └────┬──────────┘     │
              │          │ PAUSE          │ RESUME
              │     ┌────▼─────┐         │
              │     │  PAUSED  ├─────────►┘
              │     └──────────┘
              │
              │  disconnect
              │     ┌─────────────┐
              └─────┤ INTERRUPTED │  (reconnect → TRANSFER_RESUME_REQUEST → TRANSFERRING)
                    └─────────────┘
                         │ unrecoverable
              ┌──────────▼──────────────────────┐
              │  COMPLETED │ CANCELLED │ FAILED  │
              │  REJECTED                        │
              └─────────────────────────────────-┘
```

---

## Database Schema

```sql
-- One group per file send operation (shared metadata for multi-recipient sends)
CREATE TABLE transfer_groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    UUID NOT NULL REFERENCES users(id),
  file_name    TEXT NOT NULL,
  file_size    BIGINT NOT NULL,         -- bytes
  total_chunks INTEGER NOT NULL,
  file_hash    TEXT,                    -- SHA-256 hex, pre-computed by sender
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- One per recipient — fully independent lifecycle
CREATE TABLE transfers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id             UUID NOT NULL REFERENCES transfer_groups(id),
  sender_id            UUID NOT NULL REFERENCES users(id),
  receiver_id          UUID NOT NULL REFERENCES users(id),
  status               TEXT NOT NULL DEFAULT 'PENDING',
  last_confirmed_chunk INTEGER NOT NULL DEFAULT -1,  -- checkpoint for resume
  total_chunks         INTEGER NOT NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  completed_at         TIMESTAMPTZ
);
```

**Why `last_confirmed_chunk`?**

When a 2 GB file transfer is interrupted at chunk 1500, the sender needs to know where to resume. We persist `last_confirmed_chunk` periodically (every 50 chunks by default — `DB_CHECKPOINT_INTERVAL`). On reconnection, the server reads this value and tells the sender: "resume from chunk 1501."

Writing to PostgreSQL on every single ACK would mean 2048 DB writes for a 2 GB file. The checkpoint interval trades slight precision (±50 chunks on recovery) for drastically reduced DB write load.

---

## Redis Usage

Redis serves two purposes only — **no file data ever flows through Redis**.

### 1. Presence (Key-Value with TTL)

```
Key:   presence:<userId>
Value: "online"
TTL:   30 seconds (refreshed by heartbeat)
```

```
setUserOnline(userId, socketId)  → SET presence:<userId> "online" EX 30
setUserOffline(userId)           → DEL presence:<userId>
isUserOnline(userId)             → EXISTS presence:<userId>
getBulkPresence(userIds)         → MGET presence:<id1> presence:<id2> ...
```

### 2. Pub/Sub (Cross-Instance Event Relay)

Two channels:

| Channel | Purpose |
|---|---|
| `presence` | Broadcast USER_ONLINE/USER_OFFLINE to all instances |
| `transfer_events` | Route TRANSFER_REQUEST/ACCEPT/etc. to the correct instance |

**Why this is needed:**

```
Ganesh → EC2-1    (Ganesh's socket lives here)
Rahul  → EC2-2    (Rahul's socket lives here)

Ganesh sends TRANSFER_REQUEST on EC2-1.
EC2-1 checks: "Is Rahul's socket on THIS instance?" → No.
EC2-1 publishes to Redis channel "transfer_events":
  { targetUserId: rahul, eventName: 'TRANSFER_REQUEST', payload: {...} }

EC2-2 is subscribed. It receives the message.
EC2-2 finds Rahul's socket locally and emits to it.
```

File chunks themselves flow directly: **Sender Socket → Server → Receiver Socket** — all on the same TCP connection per path. If sender and receiver are on different EC2 instances, the chunk would need to cross instances. In V1, Nginx sticky sessions (ip_hash) keep sender and receiver on the same instance for chunk flow. Multi-instance chunk relay via Redis is a V2 concern (would require a dedicated streaming approach).

---

## Connection Recovery

```
Timeline:
  T=0:00  Transfer starts. Chunk 0 sent.
  T=0:30  Chunk 800 confirmed (last_confirmed_chunk = 800 in PostgreSQL).
  T=0:45  Ganesh's network drops. WebSocket disconnects.
  T=0:45  Server: handleDisconnect(ganesh)
            → checkpoint(T001, 800)
            → UPDATE transfers SET status='INTERRUPTED'
            → TransferState still in memory (not deleted yet)
  T=1:00  Ganesh's browser reconnects (new WebSocket, new socketId).
  T=1:00  JWT re-verified in Socket.IO auth middleware.
  T=1:00  Ganesh's client emits TRANSFER_RESUME_REQUEST { transferId: T001 }
  T=1:00  Server:
            → SELECT * FROM transfers WHERE id = T001
            → last_confirmed_chunk = 800
            → Recreate TransferState (or update existing) with lastConfirmedChunk = 800
            → UPDATE transfers SET status='TRANSFERRING'
            → Response: { resumeFromChunk: 801, ... }
  T=1:00  Ganesh's client resumes sending from chunk 801.
```

This works even if Ganesh reconnects to a **different EC2 instance** — the new instance has no in-memory state, but reads everything it needs from PostgreSQL.

---

## Running Locally (Docker)

### Prerequisites
- Docker Desktop (with Docker Compose)

### Steps

```bash
# 1. Clone / navigate to project root
cd File_Sharing

# 2. Copy environment template
cp .env.example .env
# Edit .env and fill in:
#   JWT_SECRET=your-secret-here-at-least-32-chars
#   (other values have sensible defaults for local dev)

# 3. Start all services
docker compose up --build

# Services started:
#   postgres  → localhost:5432
#   redis     → localhost:6379
#   server    → localhost:4000
#   nginx     → localhost:80
```

The database migrations run automatically on first start via the `depends_on` + migration script in docker-compose.

### 4. Open the client dev server

```bash
cd client
npm install
npm run dev
# → http://localhost:5173
```

The client talks to the server via `VITE_API_URL=http://localhost:4000/api` and `VITE_SOCKET_URL=http://localhost:4000`.

### To test with two users

Open two browser tabs (or two browsers) at `http://localhost:5173`.
- Register user "ganesh" in tab 1
- Register user "rahul" in tab 2
- In tab 1: search "rahul", select a file, click Send
- In tab 2: Accept the incoming request
- Watch the progress bar fill in real time

---

## Running Without Docker

### 1. Prerequisites

- Node.js ≥ 18
- PostgreSQL ≥ 14 (running locally or via a cloud service)
- Redis ≥ 6 (running locally)

### 2. Database Setup

```bash
psql -U postgres -c "CREATE DATABASE dropshare;"
psql -U postgres -d dropshare -f database/migrations/001_initial.sql
```

### 3. Server

```bash
cd server
npm install

# Create .env from example
cp ../.env.example .env
# Edit .env with your DATABASE_URL, REDIS_URL, JWT_SECRET

npm run dev   # uses nodemon for hot reload
```

### 4. Client

```bash
cd client
npm install
npm run dev
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `REDIS_URL` | ✅ | — | Redis connection string |
| `JWT_SECRET` | ✅ | — | JWT signing secret (min 32 chars) |
| `PORT` | ❌ | `5000` | Server listen port |
| `CLIENT_URL` | ❌ | `http://localhost:5173` | CORS allowed origin |
| `JWT_EXPIRES_IN` | ❌ | `7d` | JWT token lifespan |
| `CHUNK_SIZE_BYTES` | ❌ | `1048576` | Transfer chunk size (1 MB) |
| `MAX_FILE_SIZE_BYTES` | ❌ | `5368709120` | Max file size (5 GB) |
| `MAX_IN_FLIGHT_CHUNKS` | ❌ | `8` | App-level backpressure window |
| `DB_CHECKPOINT_INTERVAL` | ❌ | `50` | Chunks between PostgreSQL checkpoints |
| `NODE_ENV` | ❌ | `development` | `production` enables TLS for DB |

Client (Vite, prefixed with `VITE_`):

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:4000/api` | REST API base URL |
| `VITE_SOCKET_URL` | `http://localhost:4000` | Socket.IO server URL |

---

## API Reference

All REST endpoints return `{ success: boolean, data: {...}, message?: string }`.

### Auth

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | `{ username, password, email?, displayName? }` | Create account |
| `POST` | `/api/auth/login` | `{ username, password }` | Returns JWT token |
| `POST` | `/api/auth/refresh` | `Authorization: Bearer <token>` | Refresh token |

### Users *(requires auth)*

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/users/search?q=<query>` | Search users by username prefix |
| `GET` | `/api/users/:id/status` | Get user online status + profile |

### Transfers *(requires auth)*

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/transfers` | Transfer history (sent + received) |
| `GET` | `/api/transfers/:id` | Single transfer detail |

---

## Socket.IO Events

All Socket.IO connections require a JWT in the auth handshake:

```js
io.connect(SERVER_URL, { auth: { token: 'eyJ...' } });
```

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `TRANSFER_REQUEST` | `{ fileName, fileSize, fileHash, totalChunks, receiverIds[] }` | Initiate transfer |
| `TRANSFER_ACCEPT` | `{ transferId }` | Accept incoming transfer |
| `TRANSFER_REJECT` | `{ transferId }` | Decline incoming transfer |
| `TRANSFER_CANCEL` | `{ transferId }` | Cancel active transfer |
| `CHUNK` | `{ transferId, chunkIndex, totalChunks, chunkData: ArrayBuffer }` | Send a chunk |
| `CHUNK_ACK` | `{ transferId, chunkIndex }` | Confirm chunk received |
| `PAUSE_TRANSFER` | `{ transferId }` | Pause active transfer |
| `RESUME_TRANSFER` | `{ transferId }` | Resume paused transfer |
| `TRANSFER_RESUME_REQUEST` | `{ transferId }` | Reconnect recovery |
| `GET_PRESENCE` | `{ userIds[] }` | Bulk presence query |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `USER_ONLINE` | `{ userId }` | User came online |
| `USER_OFFLINE` | `{ userId }` | User went offline |
| `TRANSFER_REQUEST` | Full transfer metadata | Incoming file request |
| `TRANSFER_START` | `{ transferId, lastConfirmedChunk }` | Begin sending chunks |
| `CHUNK` | `{ transferId, chunkIndex, totalChunks, chunkData }` | Relayed chunk to receiver |
| `CHUNK_ACK` | `{ transferId, chunkIndex, progressPercent, speedBytesPerSecond, etaSeconds }` | ACK forwarded to sender |
| `HASH_VERIFY` | `{ transferId, expectedHash }` | Request receiver to compute hash |
| `HASH_RESULT` | `{ transferId, receiverHash, verified }` | Hash result forwarded to sender |
| `TRANSFER_COMPLETE` | `{ transferId }` | All chunks delivered |
| `PAUSE_ACK` | `{ transferId, lastConfirmedChunk }` | Pause confirmed |
| `RESUME_ACK` | `{ transferId, resumeFromChunk }` | Resume point confirmed |
| `TRANSFER_CANCEL_ACK` | `{ transferId, cancelledBy }` | Cancellation confirmed |
| `TRANSFER_FAILED` | `{ transferId, message }` | Unrecoverable error |
| `ERROR` | `{ message, transferId? }` | General error |

---

## Scaling to Multiple Instances

DropShare is designed for horizontal scaling via AWS ECS/EC2 + ALB:

```
ALB (Application Load Balancer)
 ├── Sticky Sessions: ip_hash (Nginx) or cookie (ALB)
 │   → Ensures Sender and Receiver land on the same instance
 │     for chunk relay (no cross-instance file data)
 │
 ├── EC2-1 (Node.js + Socket.IO)
 ├── EC2-2 (Node.js + Socket.IO)
 └── EC2-3 (Node.js + Socket.IO)
       │
       └── All connect to same RDS PostgreSQL + ElastiCache Redis
```

**What Redis Pub/Sub handles across instances:**
- Presence broadcasts (USER_ONLINE/OFFLINE)
- Transfer control events (TRANSFER_REQUEST, TRANSFER_ACCEPT, etc.)

**What stays within an instance:**
- Chunk relay (CHUNK events — sender and receiver are on the same instance due to sticky sessions)
- In-memory TransferManager state

**What PostgreSQL handles across failures:**
- Transfer history and status
- `last_confirmed_chunk` for precise resume after any instance failure

---

## Design Philosophy

> **V1 is about clarity over cleverness.**

1. **No magic.** Every piece of state lives in one of three places: PostgreSQL (durable), Redis (ephemeral coordination), or in-memory TransferManager (hot path). No confusion about which is authoritative.

2. **TCP does its job.** We don't re-implement reliability. TCP handles byte ordering, retransmission, and flow control. Our application layer adds transfer identity, progress tracking, and recovery.

3. **The server is a relay, not a buffer.** File data flows through the server one chunk at a time. Memory usage is bounded regardless of file size.

4. **Resumable by design.** The checkpoint pattern (not every ACK, but every N ACKs) is a deliberate tradeoff: lower DB write load at the cost of ±N chunk precision on recovery.

5. **Each component has one job.** Socket handlers call services. Services call the DB. Nothing skips a layer.

---

*Built with Node.js, Socket.IO, PostgreSQL, Redis, React (Vite), and Tailwind CSS v4.*
