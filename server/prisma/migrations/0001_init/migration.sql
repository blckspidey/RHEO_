-- ─────────────────────────────────────────────────────────────────
-- DropShare — Prisma Migration: 0001_init
--
-- Generated from schema.prisma.
-- Applied by: prisma migrate deploy (production / Docker)
--             prisma migrate dev    (local development)
--
-- This replaces the manual database/migrations/001_initial.sql.
-- PostgreSQL stores PERSISTENT application state:
--   • User identity and authentication
--   • Transfer metadata and progress checkpoints
--   • last_confirmed_chunk for crash/disconnect recovery
--
-- Redis stores TRANSIENT real-time state (not here):
--   • Online/offline presence (TTL keys)
--   • Cross-instance pub/sub events
--
-- File data is NEVER stored in PostgreSQL. Only metadata lives here.
-- ─────────────────────────────────────────────────────────────────

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────
-- TABLE: users
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE "users" (
    "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
    "username"      VARCHAR(50)  NOT NULL,
    "email"         VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "display_name"  VARCHAR(100),
    "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen"     TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- Unique constraints enforced at DB level
CREATE UNIQUE INDEX "users_username_key" ON "users"(LOWER("username"));
CREATE UNIQUE INDEX "users_email_key"    ON "users"(LOWER("email"));

-- Prefix search index: GET /api/users/search?q=
CREATE INDEX "users_username_search_idx" ON "users"("username" varchar_pattern_ops);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: transfer_groups
--
-- Shared file metadata for one send operation.
-- One group → many transfers (one per recipient).
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE "transfer_groups" (
    "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
    "sender_id"    UUID         NOT NULL,
    "file_name"    VARCHAR(500) NOT NULL,
    "file_size"    BIGINT       NOT NULL,
    "total_chunks" INTEGER      NOT NULL,
    "file_hash"    VARCHAR(64),
    "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfer_groups_pkey"      PRIMARY KEY ("id"),
    CONSTRAINT "transfer_groups_sender_fk" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX "transfer_groups_sender_id_idx" ON "transfer_groups"("sender_id");

-- ─────────────────────────────────────────────────────────────────
-- TABLE: transfers
--
-- One row per (transfer_group × recipient). Independent lifecycle.
-- last_confirmed_chunk: application-level checkpoint for resume.
--   -1 = no chunks confirmed (transfer not yet started).
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE "transfers" (
    "id"                   UUID         NOT NULL DEFAULT gen_random_uuid(),
    "group_id"             UUID         NOT NULL,
    "sender_id"            UUID         NOT NULL,
    "receiver_id"          UUID         NOT NULL,
    "status"               VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    "last_confirmed_chunk" INTEGER      NOT NULL DEFAULT -1,
    "total_chunks"         INTEGER      NOT NULL,
    "created_at"           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at"         TIMESTAMPTZ,

    CONSTRAINT "transfers_pkey"        PRIMARY KEY ("id"),
    CONSTRAINT "transfers_group_fk"    FOREIGN KEY ("group_id")    REFERENCES "transfer_groups"("id") ON DELETE CASCADE,
    CONSTRAINT "transfers_sender_fk"   FOREIGN KEY ("sender_id")   REFERENCES "users"("id")           ON DELETE CASCADE,
    CONSTRAINT "transfers_receiver_fk" FOREIGN KEY ("receiver_id") REFERENCES "users"("id")           ON DELETE CASCADE
);

CREATE INDEX "transfers_sender_id_idx"   ON "transfers"("sender_id");
CREATE INDEX "transfers_receiver_id_idx" ON "transfers"("receiver_id");
CREATE INDEX "transfers_status_idx"      ON "transfers"("status");
CREATE INDEX "transfers_group_id_idx"    ON "transfers"("group_id");
