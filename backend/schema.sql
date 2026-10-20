-- CipherRush PostgreSQL schema
-- Replaces the previous MongoDB collections: users, game_sessions, achievements

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    total_score INTEGER NOT NULL DEFAULT 0,
    puzzles_completed INTEGER NOT NULL DEFAULT 0,
    badges TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_active TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Widen password_hash for bcrypt (~60 chars) if this table predates the hashing upgrade.
ALTER TABLE users ALTER COLUMN password_hash TYPE VARCHAR(255);

-- Usernames and emails are normalized to lowercase by the application before every
-- write and lookup, so a case-insensitive unique index closes the case-variation
-- bypass (e.g. "User1" vs "user1") even if a stray write ever skips normalization.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));
CREATE INDEX IF NOT EXISTS idx_users_total_score ON users (total_score DESC);

CREATE TABLE IF NOT EXISTS game_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    game_type VARCHAR(20) NOT NULL,
    level INTEGER NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_game_sessions_user_id ON game_sessions (user_id);

CREATE TABLE IF NOT EXISTS achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    badge_name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    earned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_achievements_user_id ON achievements (user_id);

-- Per-game progression: each game levels up independently from its own XP,
-- gated by a minimum number of completed rounds at the current level (see
-- MIN_COMPLETIONS_TO_LEVEL_UP in leveling.py) so leveling can't be skipped
-- purely by farming XP in one sitting.
CREATE TABLE IF NOT EXISTS game_progress (
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    game_type VARCHAR(20) NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    xp INTEGER NOT NULL DEFAULT 0,
    completions_at_level INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, game_type)
);

-- Bumped on logout; every issued session token embeds the value it was minted
-- with, so incrementing it revokes all outstanding tokens for the account.
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;

-- Server-authoritative game rounds. `state` holds everything the client must
-- never see (answer keys, deck order, RNG seeds) plus in-progress play, so a
-- round is scored only from inputs the server validated itself. completed_at
-- is set exactly once, which is what makes a round non-replayable.
CREATE TABLE IF NOT EXISTS game_rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    game_type VARCHAR(20) NOT NULL,
    level INTEGER NOT NULL,
    state JSONB NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_game_rounds_user ON game_rounds (user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One Daily Cipher attempt per player per UTC day.
CREATE TABLE IF NOT EXISTS daily_attempts (
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    day DATE NOT NULL,
    round_id UUID NOT NULL,
    solved BOOLEAN NOT NULL DEFAULT FALSE,
    score INTEGER NOT NULL DEFAULT 0,
    seconds INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_daily_attempts_day ON daily_attempts (day, solved, seconds);

-- Rotating refresh tokens. A used token presented again (outside a short
-- grace window for parallel requests) means it was stolen: all sessions die.
CREATE TABLE IF NOT EXISTS refresh_tokens (
    jti TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id);
