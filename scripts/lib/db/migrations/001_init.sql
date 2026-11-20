-- 001_init: tables replacing the Firestore collections.
-- Must stay compatible with Postgres 16 (the VPS); tests run on PGlite (17).
--
-- Firestore document ids are kept as text primary keys, so links, slugs and
-- the one-shot export stay idempotent.

-- users <- users (Firebase uid kept as id; the auth tables come in Stage 3)
create table users (
  id          text primary key,
  email       text not null,
  name        text,
  role        text not null default 'reader'
              check (role in ('admin', 'editor', 'coauthor', 'reader')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index users_email_lower_key on users (lower(email));

-- posts <- posts (fields allowed by firestore.rules, plus coverImage; anything else lands in extra)
create table posts (
  id            text primary key,
  slug          text not null unique,
  title         text not null,
  excerpt       text,
  content       text not null,
  category      text,
  cover_image   text,
  published     boolean not null default false,
  premium       boolean not null default false,
  views         integer not null default 0 check (views >= 0),
  author_id     text references users (id) on delete set null,
  author_name   text,
  author_email  text,
  extra         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index posts_published_created_idx on posts (created_at desc) where published;
create index posts_category_idx on posts (category);

-- comments <- posts/{id}/comments
create table comments (
  id           bigint generated always as identity primary key,
  legacy_id    text unique,
  post_id      text not null references posts (id) on delete cascade,
  author_id    text references users (id) on delete set null,
  author_name  text,
  body         text not null,
  status       text not null default 'visible' check (status in ('visible', 'hidden', 'pending')),
  created_at   timestamptz not null default now()
);
create index comments_post_created_idx on comments (post_id, created_at);

-- subscribers <- subscribers
create table subscribers (
  id          bigint generated always as identity primary key,
  email       text not null,
  status      text not null default 'active' check (status in ('active', 'unsubscribed', 'bounced')),
  source      text,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index subscribers_email_lower_key on subscribers (lower(email));

-- kv <- site, ai_memory, institutional_config, prompts, verticals, latest_snapshots
-- (loose-shaped pipeline state; the collection name becomes the namespace)
create table kv (
  namespace   text not null,
  key         text not null,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (namespace, key)
);

-- telemetry_events <- telemetry_logs + swarm_telemetry (append-only; 30-day retention job in Stage 1)
create table telemetry_events (
  id           bigint generated always as identity primary key,
  event        text not null,
  occurred_at  timestamptz not null default now(),
  frequency    text not null default 'unknown',
  job_id       text,
  status       text not null default 'info',
  message      text,
  details      jsonb not null default '{}'::jsonb
);
create index telemetry_events_occurred_at_idx on telemetry_events (occurred_at);
create index telemetry_events_job_idx on telemetry_events (job_id);

-- swarm_fragments <- swarm_fragments
create table swarm_fragments (
  id          text primary key,
  job_id      text,
  frequency   text,
  data        jsonb not null,
  created_at  timestamptz not null default now()
);
create index swarm_fragments_job_idx on swarm_fragments (job_id);

-- audits <- pending_audits + institutional_audits
create table audits (
  id          text primary key,
  kind        text not null check (kind in ('pending', 'institutional')),
  status      text not null default 'pending',
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index audits_kind_status_idx on audits (kind, status);

-- pulse_briefings <- pulse_briefings
create table pulse_briefings (
  id          text primary key,
  frequency   text,
  data        jsonb not null,
  created_at  timestamptz not null default now()
);
create index pulse_briefings_created_idx on pulse_briefings (created_at desc);
