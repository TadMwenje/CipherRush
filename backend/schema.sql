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

-- App Store / Play review accounts (scripts/provision_review_account.py). Ordinary
-- players in every other respect, but never listed or ranked on leaderboards.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_review_account BOOLEAN NOT NULL DEFAULT false;

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

-- External sign-in identities (Google, Apple). (provider, subject) is the
-- provider's stable user id - never the email, which can change.
CREATE TABLE IF NOT EXISTS user_identities (
    provider VARCHAR(20) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    email VARCHAR(255),
    client_id VARCHAR(255),
    apple_refresh_token TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, subject)
);

CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities (user_id);

-- Email verification. Password sign-ups start unverified and stay off the
-- leaderboards until they confirm their address; Google / Apple accounts arrive
-- verified. Accounts that predate this were marked verified once (db.py).
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;

-- One live code per account: a 6-digit code typed in the app, plus a link token
-- for the email's button. Only hashes are stored. attempts caps code guessing.
CREATE TABLE IF NOT EXISTS email_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    link_hash TEXT NOT NULL UNIQUE,
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_otps_user ON email_otps (user_id, created_at DESC);

-- Single-use password reset links. Only the SHA-256 of the token is stored.
CREATE TABLE IF NOT EXISTS password_resets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets (user_id, created_at DESC);

-- When verification emails went out, to cap how many one account can trigger.
CREATE TABLE IF NOT EXISTS email_sends (
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_sends_user ON email_sends (user_id, kind, sent_at DESC);

-- Rewarded-ad slots (backend/ads.py). pending -> earned (Google's signed SSV
-- callback) -> used (spent by a game route). transaction_id is Google's id for
-- the ad view, so one view can never pay out twice.
CREATE TABLE IF NOT EXISTS ad_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL,
    round_id UUID,
    status VARCHAR(10) NOT NULL DEFAULT 'pending',
    transaction_id TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    earned_at TIMESTAMPTZ,
    used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ad_rewards_user ON ad_rewards (user_id, kind, status);
