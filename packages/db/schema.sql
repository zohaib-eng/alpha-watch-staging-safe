create table if not exists candidates (
  id text primary key,
  token text not null,
  pair text not null,
  input_mint text,
  output_mint text,
  amount numeric default 1000000,
  contract_address text,
  chain text not null,
  venue text not null,
  score integer default 0,
  status text default 'WATCH',
  auto_trade_enabled boolean default false,
  auto_trade_mode text default 'dry-run',
  liquidity_usd numeric default 0,
  volume_24h_usd numeric default 0,
  arb_gap_pct numeric default 0,
  created_at timestamptz default now()
);

create table if not exists approvals (
  id text primary key,
  candidate_id text not null,
  wallet text,
  status text not null default 'PENDING',
  reason text,
  requested_by text,
  reviewed_by text,
  reviewed_at timestamptz,
  metadata jsonb,
  created_at timestamptz default now()
);

create table if not exists audit_logs (
  id text primary key,
  type text not null,
  actor text not null,
  message text not null,
  metadata jsonb,
  created_at timestamptz default now()
);

create table if not exists migrations (
  id text primary key,
  applied_at timestamptz default now()
);

create table if not exists auth_challenges (
  nonce text primary key,
  wallet text,
  message text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz default now()
);

alter table candidates add column if not exists input_mint text;
alter table candidates add column if not exists output_mint text;
alter table candidates add column if not exists amount numeric default 1000000;
alter table candidates add column if not exists auto_trade_enabled boolean default false;
alter table candidates add column if not exists auto_trade_mode text default 'dry-run';
alter table approvals add column if not exists wallet text;
alter table approvals add column if not exists requested_by text;
alter table approvals add column if not exists reviewed_by text;
alter table approvals add column if not exists reviewed_at timestamptz;
alter table approvals add column if not exists metadata jsonb;

create index if not exists candidates_status_score_idx on candidates (status, score desc);
create index if not exists candidates_auto_trade_idx on candidates (auto_trade_enabled, status, score desc);
create index if not exists approvals_candidate_wallet_status_idx on approvals (candidate_id, wallet, status);
create index if not exists audit_logs_created_at_idx on audit_logs (created_at desc);
create index if not exists auth_challenges_expires_at_idx on auth_challenges (expires_at);
