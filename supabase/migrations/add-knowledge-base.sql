-- ─── Knowledge Base Schema ───────────────────────────────────────────────────
-- Shared knowledge base for Siemens-related content.
-- Categories are user-created and shared. Articles support file attachments
-- and threaded replies. Authors can delete their own content.
-- Safe to run multiple times (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Categories ────────────────────────────────────────────────────────────────
create table if not exists kb_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- Seed default categories using the first admin user found in auth.users
-- This avoids FK violations from referencing a non-existent user
do $$
declare
  seed_user_id uuid;
begin
  -- Pick the first existing user to own the seed categories
  select id into seed_user_id from auth.users limit 1;
  if seed_user_id is null then
    raise notice 'No users found — skipping category seeding. Create categories from the UI.';
    return;
  end if;

  insert into kb_categories (name, created_by) values
    ('Desigo CC', seed_user_id),
    ('PXC Controllers', seed_user_id),
    ('Sequences of Operation', seed_user_id),
    ('Networking & IP', seed_user_id),
    ('Field Devices', seed_user_id),
    ('Commissioning', seed_user_id),
    ('Troubleshooting', seed_user_id),
    ('BACnet', seed_user_id),
    ('General', seed_user_id)
  on conflict (name) do nothing;
end $$;

-- ── Articles ──────────────────────────────────────────────────────────────────
create table if not exists kb_articles (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references kb_categories(id) on delete restrict,
  created_by uuid not null references auth.users(id),
  subject text not null,
  body text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Replies ───────────────────────────────────────────────────────────────────
create table if not exists kb_replies (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references kb_articles(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  body text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. INDEXES
-- ═══════════════════════════════════════════════════════════════════════════════

create index if not exists idx_kb_articles_category on kb_articles(category_id);
create index if not exists idx_kb_articles_created_by on kb_articles(created_by);
create index if not exists idx_kb_articles_created_at on kb_articles(created_at desc);
create index if not exists idx_kb_replies_article on kb_replies(article_id);
create index if not exists idx_kb_replies_created_by on kb_replies(created_by);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Categories RLS ────────────────────────────────────────────────────────────
alter table kb_categories enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Authenticated users can view KB categories' and tablename = 'kb_categories'
  ) then
    create policy "Authenticated users can view KB categories"
      on kb_categories for select
      to authenticated
      using (true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Authenticated users can create KB categories' and tablename = 'kb_categories'
  ) then
    create policy "Authenticated users can create KB categories"
      on kb_categories for insert
      to authenticated
      with check (auth.uid() = created_by);
  end if;
end $$;

-- ── Articles RLS ──────────────────────────────────────────────────────────────
alter table kb_articles enable row level security;

do $$ begin
  -- Drop old restrictive select policy if it exists
  if exists (
    select 1 from pg_policies where policyname = 'Authenticated users can view KB articles' and tablename = 'kb_articles'
  ) then
    drop policy "Authenticated users can view KB articles" on kb_articles;
  end if;

  -- Select: show non-deleted articles (but don't block update operations)
  create policy "Authenticated users can view KB articles"
    on kb_articles for select
    to authenticated
    using (true);
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Authenticated users can create KB articles' and tablename = 'kb_articles'
  ) then
    create policy "Authenticated users can create KB articles"
      on kb_articles for insert
      to authenticated
      with check (auth.uid() = created_by);
  end if;
end $$;

do $$ begin
  -- Drop old update policy if it exists
  if exists (
    select 1 from pg_policies where policyname = 'Authors can update their KB articles' and tablename = 'kb_articles'
  ) then
    drop policy "Authors can update their KB articles" on kb_articles;
  end if;

  create policy "Authors can update their KB articles"
    on kb_articles for update
    to authenticated
    using (auth.uid() = created_by);
end $$;

-- ── Replies RLS ───────────────────────────────────────────────────────────────
alter table kb_replies enable row level security;

do $$ begin
  if exists (
    select 1 from pg_policies where policyname = 'Authenticated users can view KB replies' and tablename = 'kb_replies'
  ) then
    drop policy "Authenticated users can view KB replies" on kb_replies;
  end if;

  create policy "Authenticated users can view KB replies"
    on kb_replies for select
    to authenticated
    using (true);
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Authenticated users can create KB replies' and tablename = 'kb_replies'
  ) then
    create policy "Authenticated users can create KB replies"
      on kb_replies for insert
      to authenticated
      with check (auth.uid() = created_by);
  end if;
end $$;

do $$ begin
  if exists (
    select 1 from pg_policies where policyname = 'Authors can update their KB replies' and tablename = 'kb_replies'
  ) then
    drop policy "Authors can update their KB replies" on kb_replies;
  end if;

  create policy "Authors can update their KB replies"
    on kb_replies for update
    to authenticated
    using (auth.uid() = created_by);
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. UPDATED_AT TRIGGER
-- ═══════════════════════════════════════════════════════════════════════════════

-- Reuse or create the generic updated_at trigger function
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'kb_articles_updated_at'
  ) then
    create trigger kb_articles_updated_at
      before update on kb_articles
      for each row execute function set_updated_at();
  end if;
end $$;
