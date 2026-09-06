-- Ajo Chain D1 schema. On-chain state (group/members) is the source of
-- truth; these tables cache it for fast reads and hold the two things the
-- chain itself doesn't: the transaction index for the transparency page, and
-- the human dispute-adjudication workflow.

CREATE TABLE IF NOT EXISTS groups (
  pubkey TEXT PRIMARY KEY,
  creator TEXT NOT NULL,
  contribution_amount_lamports TEXT NOT NULL,
  round_duration_secs INTEGER NOT NULL,
  round_number INTEGER NOT NULL,
  round_deadline INTEGER NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  synced_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  group_pubkey TEXT NOT NULL REFERENCES groups(pubkey),
  idx INTEGER NOT NULL,
  wallet_address TEXT NOT NULL,
  has_contributed INTEGER NOT NULL DEFAULT 0,
  defaulted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (group_pubkey, idx)
);

CREATE TABLE IF NOT EXISTS transactions (
  signature TEXT PRIMARY KEY,
  group_pubkey TEXT NOT NULL REFERENCES groups(pubkey),
  block_time INTEGER,
  err TEXT
);

CREATE TABLE IF NOT EXISTS disputes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_pubkey TEXT NOT NULL REFERENCES groups(pubkey),
  member_wallet TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  evidence_json TEXT NOT NULL,
  note TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | upheld | overturned
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_group ON transactions(group_pubkey);
CREATE INDEX IF NOT EXISTS idx_disputes_group ON disputes(group_pubkey);
