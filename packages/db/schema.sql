create table if not exists candidates (
  id text primary key,
  token text not null,
  pair text not null,
  contract_address text,
  chain text not null,
  venue text not null,
  score integer default 0,
  status text default 'WATCH',
  liquidity_usd numeric default 0,
  volume_24h_usd numeric default 0,
  arb_gap_pct numeric default 0,
  created_at timestamptz default now()
);

create table if not exists approvals (
  id text primary key,
  candidate_id text not null,
  status text not null default 'PENDING',
  reason text,
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
