-- ─── User Reviews ──────────────────────────────────────────────────────────────
-- Stores user reviews/testimonials, synced via offline-first sync engine.

create table if not exists user_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text not null default '',
  display_name text not null default '',
  app_version text not null default '',
  device_class text not null default '',
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_reviews enable row level security;

create policy "Users can manage their own reviews"
  on user_reviews for all using (auth.uid() = user_id);

create trigger user_reviews_updated_at
  before update on user_reviews
  for each row execute function set_updated_at();

create index if not exists idx_user_reviews_user on user_reviews(user_id);
