-- Threadline schema
-- Run this in the Supabase SQL editor (Project -> SQL Editor -> New query)
--
-- MIGRATION NOTE: if you already ran an earlier version of this schema and
-- have real data, don't re-run the whole file. Instead just run this:
--   alter table items drop constraint items_listing_type_check;
--   alter table items alter column listing_type type text[] using array[listing_type]::text[];
--   alter table items add constraint items_listing_type_check
--     check (listing_type <@ array['sell','trade','rent','borrow']::text[]);

-- 1. Profiles (one row per student, linked to Supabase auth)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  dorm text,
  avatar_url text,
  created_at timestamptz default now()
);

-- 2. Circles (private barter groups)
create table circles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_id uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table circle_members (
  circle_id uuid references circles(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (circle_id, user_id)
);

-- 3. Items (the closet listings)
create table items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete cascade,
  title text not null,
  category text not null,
  size text,
  listing_type text[] not null default '{}'::text[]
    check (listing_type <@ array['sell','trade','rent','borrow']::text[]),
  price numeric,
  photo_url text,
  circle_id uuid references circles(id) on delete set null, -- null = visible campus-wide
  status text not null default 'available' check (status in ('available','pending','gone')),
  created_at timestamptz default now()
);

-- 4. Swipes (like/pass on items)
create table swipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  item_id uuid references items(id) on delete cascade,
  direction text not null check (direction in ('like','pass')),
  created_at timestamptz default now(),
  unique (user_id, item_id)
);

-- 5. Matches (created when two people like each other's items,
--    or when someone likes an item and the owner likes them back)
create table matches (
  id uuid primary key default gen_random_uuid(),
  user_a uuid references profiles(id) on delete cascade,
  user_b uuid references profiles(id) on delete cascade,
  item_id uuid references items(id) on delete cascade,
  created_at timestamptz default now()
);

-- 6. Messages (per match)
create table messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  sender_id uuid references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

-- =========================================================
-- Row Level Security
-- =========================================================
alter table profiles enable row level security;
alter table circles enable row level security;
alter table circle_members enable row level security;
alter table items enable row level security;
alter table swipes enable row level security;
alter table matches enable row level security;
alter table messages enable row level security;

-- Profiles: anyone signed in can read basic profile info, only the owner can edit
create policy "profiles are readable by signed-in users" on profiles
  for select using (auth.role() = 'authenticated');
create policy "users can update their own profile" on profiles
  for update using (auth.uid() = id);
create policy "users can insert their own profile" on profiles
  for insert with check (auth.uid() = id);

-- Circles: readable by anyone signed in (so people can discover/join),
-- but only members' items are gated (see items policy below)
create policy "circles are readable by signed-in users" on circles
  for select using (auth.role() = 'authenticated');
create policy "any signed-in user can create a circle" on circles
  for insert with check (auth.uid() = owner_id);

-- Circle membership: users can see members of circles they belong to, and join circles
create policy "members readable by signed-in users" on circle_members
  for select using (auth.role() = 'authenticated');
create policy "users can add themselves to a circle" on circle_members
  for insert with check (auth.uid() = user_id);

-- Items: visible campus-wide if circle_id is null, otherwise only to circle members
create policy "public items are readable by anyone signed in" on items
  for select using (
    circle_id is null
    or exists (
      select 1 from circle_members cm
      where cm.circle_id = items.circle_id and cm.user_id = auth.uid()
    )
  );
create policy "users can insert their own items" on items
  for insert with check (auth.uid() = owner_id);
create policy "users can update their own items" on items
  for update using (auth.uid() = owner_id);
create policy "users can delete their own items" on items
  for delete using (auth.uid() = owner_id);

-- Swipes: users can only see/create their own swipes
create policy "users manage their own swipes" on swipes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Matches: visible to either participant
create policy "participants can read their matches" on matches
  for select using (auth.uid() = user_a or auth.uid() = user_b);
create policy "system or participants can create matches" on matches
  for insert with check (auth.uid() = user_a or auth.uid() = user_b);

-- Messages: visible to participants of the parent match
create policy "participants can read match messages" on messages
  for select using (
    exists (
      select 1 from matches m
      where m.id = messages.match_id
      and (m.user_a = auth.uid() or m.user_b = auth.uid())
    )
  );
create policy "participants can send match messages" on messages
  for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from matches m
      where m.id = messages.match_id
      and (m.user_a = auth.uid() or m.user_b = auth.uid())
    )
  );

-- Storage bucket for item photos (run once; then set the bucket to public read)
insert into storage.buckets (id, name, public) values ('item-photos', 'item-photos', true)
on conflict (id) do nothing;

-- Turn on realtime for the chat feature (lets the app receive new messages instantly
-- without polling). If this errors saying it's already added, that's fine — ignore it.
alter publication supabase_realtime add table messages;
