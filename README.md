# RHEO — Real-Time Relay File Transfer

> A production-ready, relay-based file sharing platform built on **WebSocket (Socket.IO)**, **Node.js**, **PostgreSQL**, and **Redis**. Send files of up to 5 GB to multiple users simultaneously — with rooms, live chat, resumable transfers, and zero peer-to-peer complexity.

[![Node.js](https://img.shields.io/badge/Node.js-20-green)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-blue)](https://react.dev)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-black)](https://socket.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7-red)](https://redis.io)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-purple)](https://prisma.io)

---

## Table of Contents

1. [What is RHEO?](#what-is-rheo)
2. [Key Features](#key-features)
3. [Architecture Overview](#architecture-overview)
4. [How File Transfer Works](#how-file-transfer-works)
5. [Transfer State Machine](#transfer-state-machine)
6. [Rooms & Live Chat](#rooms--live-chat)
7. [Connection Recovery](#connection-recovery)
8. [Tech Stack](#tech-stack)
9. [Directory Structure](#directory-structure)
10. [Database Schema](#database-schema)
11. [Redis Usage](#redis-usage)
12. [API Reference](#api-reference)
13. [Socket.IO Events](#socketio-events)
14. [Environment Variables](#environment-variables)
15. [Running Locally](#running-locally)
16. [Production Deployment](#production-deployment)
17. [CI/CD Pipeline](#cicd-pipeline)

---

## What is RHEO?

RHEO is a **server-relay file transfer system**. When a sender uploads a file, the server streams it chunk-by-chunk to each receiver in real time:

```
Sender's Browser  ──WebSocket──►  RHEO Server  ──WebSocket──►  Receiver's Browser
```

**Key philosophy:**
- ❌ No WebRTC. No STUN/TURN servers. No NAT traversal headaches.
- ❌ No full-file buffering on the server. Chunks are relayed one at a time (~1 MB each).
- ✅ Resumable transfers. If either side disconnects mid-transfer, it picks up from the last confirmed chunk.
- ✅ Multi-recipient. One send operation fans out to independent transfer streams for every receiver.
- ✅ Collaborative rooms. Users can create rooms, invite others, chat, and share files together.

---

## Key Features

| Feature | Description |
|---|---|
| 🚀 **Chunked Relay Transfer** | Files split into 1 MB chunks, relayed in real-time via WebSocket |
| 📶 **Resumable Transfers** | PostgreSQL checkpoints allow resume after disconnect |
| 👥 **Multi-Recipient** | One file → independent streams to N receivers simultaneously |
| 🏠 **Collaborative Rooms** | Create rooms with 6-digit codes, invite friends |
| 💬 **Live Room Chat** | Real-time in-room chat with optimistic UI rendering |
| 🔐 **JWT Authentication** | Secure user auth with access + refresh token rotation |
| 📡 **Presence System** | Live online/offline indicator via Redis TTL keys |
| 📊 **Transfer Stats** | Live speed, ETA, and progress tracking |
| 🐳 **Docker Ready** | Full Docker Compose for dev and production |
| ⚡ **CI/CD Automated** | GitHub Actions deploys backend to EC2 + frontend to Vercel |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│                                                                 │
│   React (Vite) + Socket.IO Client + Axios                       │
│   Auth → Dashboard → RadarScanner → Rooms → TransferCards       │
│   Deployed on: Vercel                                           │
└────────────────────────┬────────────────────────────────────────┘
                         │  HTTPS REST + WSS WebSocket
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     NGINX REVERSE PROXY                         │
│                                                                 │
│   SSL Termination (Let's Encrypt)                               │
│   WebSocket Upgrade headers forwarded                           │
│   Proxy to Node.js on port 5000                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   NODE.JS BACKEND (AWS EC2)                     │
│                                                                 │
│   Express.js     — REST API (Auth, Users, Transfers)            │
│   Socket.IO      — Real-time events, chunk relay                │
│   TransferManager — In-flight chunk flow control (8 in-flight)  │
│   ChunkHandler   — Receives chunks, relays to receiver          │
│   RoomHandler    — Room state, invitations, live chat           │
│   PresenceHandler — Online/offline tracking via Redis           │
└────────────┬────────────────────────┬───────────────────────────┘
             │                        │
             ▼                        ▼
┌──────────────────────┐   ┌──────────────────────┐
│     PostgreSQL       │   │        Redis          │
│    (Neon DB / EC2)   │   │     (EC2 Docker)      │
│                      │   │                       │
│  users               │   │  Presence TTL keys    │
│  transfers           │   │  Socket.IO Pub/Sub    │
│  transfer_chunks     │   │  User → socketId map  │
│  refresh_tokens      │   │                       │
└──────────────────────┘   └──────────────────────┘
```

---

## How File Transfer Works

### Step-by-Step Flow

1. **Sender selects a file** and a target user on the dashboard.
2. **Frontend emits `TRANSFER_REQUEST`** via Socket.IO to the server.
3. **Server creates a `Transfer` record** in PostgreSQL with status `PENDING`.
4. **Server emits `TRANSFER_REQUEST`** to the receiver's socket.
5. **Receiver accepts** → emits `TRANSFER_ACCEPTED`.
6. **Sender starts chunking** the file in the browser using the `FileReader` API (~1 MB per chunk).
7. **Sender emits `CHUNK_SEND`** for each chunk with `{ transferId, chunkIndex, data (ArrayBuffer) }`.
8. **Server relays the chunk** instantly to the receiver's socket via `CHUNK_RECEIVE`.
9. **Receiver emits `CHUNK_ACK`** after processing each chunk.
10. **Server records checkpoint** in PostgreSQL every 50 chunks.
11. **Flow control window**: At most 8 unacknowledged chunks in-flight at once — prevents buffer overflow.
12. **Transfer completes** → status updated to `COMPLETED` in the database.

### In-Flight Flow Control

```
Sender ──► [Chunk 1] ──► Server ──► Receiver ──► [ACK 1] ──► Sender
Sender ──► [Chunk 2] ──► Server ──► Receiver ──► [ACK 2] ──► Sender
...
(Max 8 unACKed chunks at once — pauses sender if window is full)
```

This is NOT TCP's congestion window. TCP handles byte-level flow control internally. This application-level window prevents RAM exhaustion when the receiver is slower than the sender.

---

## Transfer State Machine

```
PENDING
   │
   │ (receiver accepts)
   ▼
TRANSFERRING
   │
   ├──────────────────────► COMPLETED
   │                              │
   │ (cancel/disconnect)          └─► (final state)
   ▼
CANCELLED / FAILED
```

Each transfer goes through these states stored in PostgreSQL. On reconnection, the server queries the last confirmed chunk index and resumes from there.

---

## Rooms & Live Chat

RHEO includes a full collaborative rooms system built entirely in-memory (no database persistence for rooms):

- **Create a Room** — Generates a unique 6-digit alphanumeric code (e.g. `8X3A92`)
- **Invite Members** — Search users by username and invite them to your room
- **Join by Code** — Any user can join a room by entering the 6-digit code
- **Live Chat** — Real-time text chat with zero-latency optimistic UI rendering
- **File Announcements** — Automatic notifications when files are shared within a room
- **Radar View** — Visual scanner showing all online room members with avatars

### Chat Optimistic Rendering

When you send a message, it appears **instantly** in your chat window (0ms delay) without waiting for the server echo. When the server broadcasts the message back, the optimistic placeholder is seamlessly replaced with the confirmed server message.

---

## Connection Recovery

If either the sender or receiver disconnects mid-transfer:

1. **Socket.IO's reconnection** kicks in automatically (up to 15 attempts).
2. **Server detects reconnect** via `RECOVERY_REQUEST` event.
3. **Server queries PostgreSQL** for the last confirmed chunk checkpoint.
4. **Transfer resumes** from the last saved chunk index — no data retransmitted.

This is made possible by PostgreSQL checkpoint writes every 50 chunks via `DB_CHECKPOINT_INTERVAL`.

---

## Tech Stack

### Backend
| Technology | Purpose |
|---|---|
| **Node.js 20** | Server runtime |
| **Express.js** | REST API framework |
| **Socket.IO 4** | WebSocket bidirectional events |
| **Prisma ORM** | Type-safe PostgreSQL access |
| **PostgreSQL 16** | Persistent storage (users, transfers) |
| **Redis 7** | Presence TTL, Socket.IO multi-instance pub/sub |
| **JSON Web Tokens** | Stateless authentication |
| **bcrypt** | Password hashing |

### Frontend
| Technology | Purpose |
|---|---|
| **React 18** | UI framework |
| **Vite** | Build tool and dev server |
| **Socket.IO Client** | Real-time WebSocket connection |
| **Axios** | HTTP API calls |
| **Context API** | State management (Auth, Transfer, Room) |

### Infrastructure
| Technology | Purpose |
|---|---|
| **Docker & Docker Compose** | Container orchestration |
| **Nginx** | SSL termination + reverse proxy |
| **AWS EC2** | Backend hosting |
| **Vercel** | Frontend hosting |
| **Neon DB** | Managed cloud PostgreSQL |
| **GitHub Actions** | CI/CD pipeline |
| **Let's Encrypt** | Free SSL certificates |

---

## Directory Structure

```
rheo/
├── .github/
│   └── workflows/
│       └── deploy.yml          # CI/CD GitHub Actions pipeline
│
├── client/                     # React + Vite frontend
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Avatar.jsx          # User avatar with 16 animal options
│   │   │   ├── CreateRoomModal.jsx # Room creation flow
│   │   │   ├── DropZone.jsx        # Drag-and-drop file input
│   │   │   ├── IncomingRequests.jsx# Incoming transfer accept/reject UI
│   │   │   ├── Navbar.jsx          # Top navigation bar
│   │   │   ├── ProfileModal.jsx    # Profile edit, avatar, username
│   │   │   ├── RadarScanner.jsx    # Visual room member scanner
│   │   │   ├── ReceiverMode.jsx    # Receiver dashboard panel
│   │   │   ├── RoomChatBox.jsx     # Floating real-time chat widget
│   │   │   ├── RoomPanel.jsx       # Full room management panel
│   │   │   ├── SenderMode.jsx      # Sender dashboard panel
│   │   │   ├── TransferCard.jsx    # Per-transfer progress card
│   │   │   ├── TransferStats.jsx   # Global transfer statistics
│   │   │   └── UserSearch.jsx      # Search users to send files to
│   │   ├── contexts/
│   │   │   ├── AuthContext.jsx     # Login, register, JWT management
│   │   │   ├── RoomContext.jsx     # Room state, chat, invitations
│   │   │   └── TransferContext.jsx # Transfer lifecycle, speed, ETA
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx       # Main app dashboard
│   │   │   └── Auth.jsx            # Login / Register page
│   │   └── services/
│   │       ├── api.js              # Axios HTTP client
│   │       └── socket.js           # Socket.IO client + reconnection
│   ├── vercel.json                 # Vercel SPA rewrite config
│   └── vite.config.js
│
├── server/                     # Node.js backend
│   ├── src/
│   │   ├── config/
│   │   │   └── env.js              # Single source of truth for env vars
│   │   ├── controllers/
│   │   │   ├── authController.js   # Login, register, refresh token
│   │   │   ├── transferController.js # Transfer history REST API
│   │   │   └── userController.js   # User search, profile
│   │   ├── middleware/
│   │   │   └── auth.js             # JWT verification middleware
│   │   ├── redis/
│   │   │   ├── client.js           # Redis connection singleton
│   │   │   ├── presence.js         # Online/offline TTL management
│   │   │   └── pubsub.js           # Multi-instance pub/sub channels
│   │   ├── routes/
│   │   │   ├── auth.js             # POST /api/auth/...
│   │   │   ├── transfers.js        # GET /api/transfers/...
│   │   │   └── users.js            # GET /api/users/...
│   │   ├── services/
│   │   │   ├── authService.js      # JWT sign/verify, bcrypt logic
│   │   │   ├── transferService.js  # DB operations for transfers
│   │   │   └── userService.js      # User lookup, update
│   │   ├── sockets/
│   │   │   ├── index.js            # Socket.IO server init + auth middleware
│   │   │   ├── chunkHandler.js     # CHUNK_SEND relay + ACK forwarding
│   │   │   ├── presenceHandler.js  # Online/offline socket events
│   │   │   ├── recoveryHandler.js  # Reconnect resume logic
│   │   │   ├── roomHandler.js      # Room CRUD, invitations, chat
│   │   │   └── transferHandler.js  # TRANSFER_REQUEST, ACCEPT, CANCEL
│   │   ├── transfer/
│   │   │   └── TransferManager.js  # In-flight window + flow control
│   │   ├── utils/
│   │   │   └── logger.js           # Structured JSON logger
│   │   ├── app.js                  # Express app setup
│   │   └── server.js               # HTTP server entry point
│   ├── prisma/
│   │   └── schema.prisma           # Database schema
│   ├── Dockerfile                  # Multi-stage production Docker build
│   └── .env.example
│
├── nginx/
│   ├── nginx.conf                  # Development Nginx config
│   └── nginx.prod.conf             # Production Nginx with SSL
│
├── docker-compose.yml              # Development stack
├── docker-compose.prod.yml         # Production stack (EC2 + Neon DB)
└── DEPLOYMENT.md                   # Step-by-step deployment guide
```

---

## Database Schema

### `users`
| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `username` | String (unique) | Display name |
| `email` | String (unique) | Login email |
| `password_hash` | String | bcrypt hash |
| `avatar_id` | String | Avatar animal name |
| `last_seen` | DateTime | Last activity timestamp |
| `created_at` | DateTime | Account creation time |

### `transfers`
| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `sender_id` | UUID | FK → users |
| `receiver_id` | UUID | FK → users |
| `file_name` | String | Original file name |
| `file_size` | BigInt | File size in bytes |
| `mime_type` | String | File MIME type |
| `status` | Enum | `PENDING`, `TRANSFERRING`, `COMPLETED`, `CANCELLED`, `FAILED` |
| `total_chunks` | Int | Total number of chunks |
| `last_confirmed_chunk` | Int | Last ACKed chunk index (for resume) |
| `created_at` | DateTime | Transfer creation time |
| `completed_at` | DateTime | Completion timestamp |

### `refresh_tokens`
| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → users |
| `token_hash` | String | Hashed refresh token |
| `expires_at` | DateTime | Token expiry |
| `revoked` | Boolean | Whether token has been revoked |

---

## Redis Usage

| Key Pattern | Type | TTL | Purpose |
|---|---|---|---|
| `presence:user:{userId}` | String | 35s | Online indicator (refreshed every 25s) |
| `socket:user:{userId}` | String | 35s | Maps userId → socketId |
| `socket:id:{socketId}` | String | 35s | Maps socketId → userId |
| Pub/Sub channels | — | — | Cross-instance event broadcasting |

---

## API Reference

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | None | Create new account |
| `POST` | `/api/auth/login` | None | Login, get JWT |
| `POST` | `/api/auth/refresh` | None | Refresh access token |
| `POST` | `/api/auth/logout` | Bearer | Revoke refresh token |

### Users

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/users/search?q={query}` | Bearer | Search users by username |
| `GET` | `/api/users/me` | Bearer | Get own profile |
| `PUT` | `/api/users/me` | Bearer | Update profile/avatar |

### Transfers

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/transfers` | Bearer | Get transfer history |
| `GET` | `/api/transfers/:id` | Bearer | Get single transfer details |

### Health

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Server health check |

---

## Socket.IO Events

### Transfer Events (Client → Server)

| Event | Payload | Description |
|---|---|---|
| `TRANSFER_REQUEST` | `{ receiverId, fileName, fileSize, mimeType, totalChunks }` | Initiate file transfer |
| `TRANSFER_CANCEL` | `{ transferId }` | Cancel an active transfer |
| `CHUNK_SEND` | `{ transferId, chunkIndex, data (ArrayBuffer) }` | Send a file chunk |
| `CHUNK_ACK` | `{ transferId, chunkIndex }` | Acknowledge received chunk |
| `RECOVERY_REQUEST` | `{ transferId }` | Resume after reconnect |

### Transfer Events (Server → Client)

| Event | Payload | Description |
|---|---|---|
| `TRANSFER_REQUEST` | `{ transfer }` | Incoming file transfer notification |
| `TRANSFER_ACCEPTED` | `{ transferId }` | Receiver accepted your transfer |
| `TRANSFER_REJECTED` | `{ transferId }` | Receiver rejected your transfer |
| `TRANSFER_CANCELLED` | `{ transferId }` | Transfer was cancelled |
| `CHUNK_RECEIVE` | `{ transferId, chunkIndex, data }` | Incoming chunk from sender |
| `CHUNK_ACK` | `{ transferId, chunkIndex }` | ACK forwarded back to sender |
| `TRANSFER_COMPLETE` | `{ transferId }` | Transfer completed |
| `RECOVERY_RESPONSE` | `{ lastChunkIndex }` | Resume point after reconnect |

### Room Events (Client → Server)

| Event | Description |
|---|---|
| `ROOM_CREATE` | Create a new room |
| `ROOM_JOIN` | Join an existing room |
| `ROOM_INVITE` | Invite a user to your room |
| `ROOM_LEAVE` | Leave a room |
| `ROOM_DISMISS` | Close room (creator only) |
| `ROOM_CHAT` | Send a chat message |
| `ROOM_FILE_SHARED` | Announce a file transfer in room |

### Room Events (Server → Client)

| Event | Description |
|---|---|
| `ROOM_INVITED` | You've been invited to a room |
| `ROOM_MEMBER_JOINED` | Someone joined your room |
| `ROOM_MEMBER_LEFT` | Someone left your room |
| `ROOM_DISMISSED` | Room was closed |
| `ROOM_CHAT_MESSAGE` | New chat message in room |
| `ROOM_FILE_SHARED` | File shared notification in room |

### Presence Events

| Event | Direction | Description |
|---|---|---|
| `USER_ONLINE` | Server → Client | A user came online |
| `USER_OFFLINE` | Server → Client | A user went offline |

---

## Environment Variables

### Server (`server/.env`)

```env
# Required
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="your-super-secret-jwt-key"

# Optional (with defaults)
NODE_ENV=development
PORT=5000
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173

# Transfer tuning
CHUNK_SIZE_BYTES=1048576          # 1 MB chunks
MAX_FILE_SIZE_BYTES=5368709120    # 5 GB max file size
MAX_IN_FLIGHT_CHUNKS=8            # Flow control window
DB_CHECKPOINT_INTERVAL=50         # Checkpoint every 50 chunks
```

### Client (`client/.env.local`)

```env
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

---

## Running Locally

### Prerequisites

- [Node.js 20+](https://nodejs.org)
- [Docker Desktop](https://docker.com)
- [Git](https://git-scm.com)

### Option A: Docker Compose (Recommended)

```bash
# Clone the repo
git clone https://github.com/blckspidey/RHEO_.git
cd RHEO_

# Start PostgreSQL + Redis + Server + Nginx
docker-compose up -d

# Frontend dev server (in a separate terminal)
cd client
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

### Option B: Manual Setup

**1. Start PostgreSQL and Redis:**
```bash
docker run -d --name rheo_postgres -p 5432:5432 \
  -e POSTGRES_DB=rheo_db -e POSTGRES_USER=rheo_user \
  -e POSTGRES_PASSWORD=rheo_pass postgres:16-alpine

docker run -d --name rheo_redis -p 6379:6379 redis:7-alpine
```

**2. Setup the server:**
```bash
cd server
cp .env.example .env
# Edit .env with your connection strings

npm install
npx prisma migrate dev
npm run dev
```

**3. Setup the client:**
```bash
cd client
npm install
npm run dev
```

---

## Production Deployment

For full step-by-step production setup on AWS EC2 with SSL, see [DEPLOYMENT.md](./DEPLOYMENT.md).

**Summary:**
1. Launch an EC2 instance (Ubuntu 22.04, t3.small minimum)
2. Install Docker and Docker Compose
3. Clone the repo to `~/RHEO_`
4. Create `.env` with your Neon DB `DATABASE_URL` and secrets
5. Run `docker-compose -f docker-compose.prod.yml up -d`
6. Configure Let's Encrypt SSL with Certbot

**Services on EC2:**
| Container | Purpose |
|---|---|
| `rheo_server` | Node.js API + Socket.IO |
| `rheo_redis` | Redis for presence and pub/sub |
| `rheo_nginx` | SSL + reverse proxy |

Frontend is deployed separately on **Vercel** (auto-detected Vite project).

---

## CI/CD Pipeline

Every `git push origin main` triggers the GitHub Actions pipeline at [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml):

```
push to main
    │
    ├─► Job 1: Verify & Build Check
    │       Install deps → Generate Prisma client → Build React app
    │
    ├─► Job 2: Deploy Backend to EC2 (SSH)
    │       SSH into EC2 → git pull → Write .env from secrets
    │       → docker-compose up -d --build → prune old images
    │
    └─► Job 3: Deploy Frontend to Vercel
            npx vercel --prod (using VERCEL_TOKEN)
```

### Required GitHub Secrets

| Secret | Description |
|---|---|
| `EC2_HOST` | EC2 public IP or domain |
| `EC2_USERNAME` | SSH username (usually `ubuntu`) |
| `EC2_SSH_KEY` | Private SSH key for EC2 access |
| `DATABASE_URL` | Neon DB PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret |
| `VERCEL_TOKEN` | Vercel personal access token |
| `VERCEL_ORG_ID` | Vercel organization ID |
| `VERCEL_PROJECT_ID` | Vercel project ID |

---

## License

MIT — Built with ❤️ by [Ganesh Daware](https://github.com/blckspidey)
