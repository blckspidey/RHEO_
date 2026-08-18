-- ─────────────────────────────────────────────────────────────────
-- DropShare Database Schema — Migration 001
--
-- PostgreSQL stores PERSISTENT application state:
--   • User identity and authentication
--   • Transfer metadata and history
--   • last_confirmed_chunk for crash/disconnect recovery
--
-- Redis stores TRANSIENT real-time state:
--   • Online/offline presence
--   • Cross-instance pub/sub events
--
-- IMPORTANT: File data is NEVER stored in PostgreSQL.
-- Only metadata (filename, size, hash, chunk progress) lives here.
-- ─────────────────────────────────────────────────────────────────

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────────
-- TABLE: users
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    username      VARCHAR(50) NOT NULL,
    email         VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen     TIMESTAMPTZ
);

-- Unique constraints — enforce at DB level (not just application level)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (LOWER(username));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email    ON users (LOWER(email));

-- Index for search queries: GET /api/users/search?q=
CREATE INDEX IF NOT EXISTS idx_users_username_search ON users (username varchar_pattern_ops);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: transfer_groups
--
-- A transfer group is created when one sender selects a file and
-- one or more recipients. The file metadata is stored once here.
-- Each recipient gets an independent row in the transfers table.
--
-- Example:
--   Ganesh sends movie.mp4 to [Rahul, Amit, Priya]
--   → One transfer_group row (file metadata)
--   → Three transfers rows (one per recipient)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transfer_groups (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name    VARCHAR(500) NOT NULL,
    -- file_size in bytes — supports files up to 9.2 EB (BIGINT max)
    file_size    BIGINT       NOT NULL CHECK (file_size > 0),
    total_chunks INT          NOT NULL CHECK (total_chunks > 0),
    -- SHA-256 hex digest (64 characters) — computed by sender before transfer
    file_hash    VARCHAR(64),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transfer_groups_sender ON transfer_groups (sender_id);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: transfers
--
-- One row per (transfer_group, recipient) pair.
-- Each transfer is fully independent — one can be PAUSED while
-- others continue TRANSFERRING.
--
-- last_confirmed_chunk:
--   The application-level chunk index that the receiver has
--   successfully processed and acknowledged. Used to resume after
--   disconnection or server restart.
--
--   NOTE: TCP has its own sequence numbers and acknowledgements for
--   reliable byte delivery. This is a SEPARATE, HIGHER-LEVEL concept
--   for application transfer recovery. We do not touch TCP internals.
--
-- status values (see constants/index.js):
--   PENDING → ACCEPTED → TRANSFERRING → COMPLETED
--                                     → PAUSED
--                                     → INTERRUPTED
--                                     → FAILED
--                                     → CANCELLED
--                      → REJECTED
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transfers (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id             UUID        NOT NULL REFERENCES transfer_groups(id) ON DELETE CASCADE,
    sender_id            UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status               VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    -- -1 means no chunks confirmed yet (transfer not started or just accepted)
    last_confirmed_chunk INT         NOT NULL DEFAULT -1,
    total_chunks         INT         NOT NULL CHECK (total_chunks > 0),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at         TIMESTAMPTZ
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_transfers_sender_id   ON transfers (sender_id);
CREATE INDEX IF NOT EXISTS idx_transfers_receiver_id ON transfers (receiver_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status      ON transfers (status);
CREATE INDEX IF NOT EXISTS idx_transfers_group_id    ON transfers (group_id);

-- ─────────────────────────────────────────────────────────────────
-- TRIGGER: auto-update updated_at on row modification
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_transfers_updated_at
    BEFORE UPDATE ON transfers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
