-- Required for create_user_with_pin / issue_temporary_pin RPC helpers (gen_salt, crypt).
CREATE EXTENSION IF NOT EXISTS pgcrypto;