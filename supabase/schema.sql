-- Threadline schema
-- Run this in the Supabase SQL editor (Project -> SQL Editor -> New query)
--
-- MIGRATION NOTE: if you already ran an earlier version of this schema and
-- have real data, don't re-run the whole file. Instead just run this:
--   alter table items drop constraint items_listing_type_check;
--   alter table items alter column listing_type type text[] using array[listing_type]::text[];
--   alter table items add constraint items_listing_type_check
--     check (listing_type <@ array['sell','trade','rent','borrow']::text[]);
--
-- If you already have the listing_type array migration applied and just need
-- separate sale/rent prices, run this:
--   alter table items add column rent_price numeric;
--
-- If you already have the listing_type array + rent_price migrations applied
-- and just need the new wishlist/saves feature, run this instead:
--   create table saves (
--     id uuid primary key default gen_random_uuid(),
--     user_id uuid references profiles(id) on delete cascade,
--     item_id uuid references items(id) on delete cascade,
--     created_at timestamptz default now(),
--     unique (user_id, item_id)
--   );
--   alter table saves enable row level security;
--   create policy "users manage their own saves" on saves
--     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
--
-- If you already have everything above and just need the new grouped-chat
-- redesign (one conversation per person instead of per item, unlike = closed
-- not deleted), that's a bigger migration — see the "Grouped chat migration"
-- comment further down this file, right before the matches/messages RLS
-- policies, and run that block plus the new record_swipe_and_match function
-- at the bottom of this file.
--
-- If you already have the notifications+actor_id migration applied and just
-- need the new campus system + public/private circles, run this instead:
--   alter table profiles add column campus text not null default 'UCLA'
--     check (campus in ('UCLA', 'UCSD', 'UT Austin'));
--   alter table circles add column is_private boolean not null default false;
--   alter table circles add column campus_tag text;
--   create unique index circles_campus_tag_unique on circles (campus_tag) where campus_tag is not null;
--   create table circle_codes (
--     circle_id uuid primary key references circles(id) on delete cascade,
--     code text not null
--   );
--   alter table circle_codes enable row level security;
--   drop policy "users can add themselves to a circle" on circle_members;
--   create policy "users can join public circles directly" on circle_members
--     for insert with check (
--       auth.uid() = user_id
--       and exists (select 1 from circles c where c.id = circle_members.circle_id and c.is_private = false)
--     );
--   create policy "members can read their circle's join code" on circle_codes
--     for select using (
--       exists (select 1 from circle_members cm where cm.circle_id = circle_codes.circle_id and cm.user_id = auth.uid())
--     );
--   create policy "circle owner can set the join code" on circle_codes
--     for insert with check (
--       exists (select 1 from circles c where c.id = circle_codes.circle_id and c.owner_id = auth.uid())
--     );
-- ...then run the join_private_circle function and the campus-circle seed
-- insert, both at the bottom of this file.
--
-- If you already have the campus/circle-privacy migration applied and just
-- need leave-circle, delete-circle, and campus-scoped circle browsing, run
-- this instead:
--   alter table circles add column campus text not null default 'UCLA'
--     check (campus in ('UCLA', 'UCSD', 'UT Austin'));
--   update circles set campus = campus_tag where campus_tag is not null;
--   create policy "owner can delete their circle" on circles
--     for delete using (auth.uid() = owner_id);
--   create policy "users can leave circles" on circle_members
--     for delete using (auth.uid() = user_id);
--
-- If you already have leave/delete circles applied and just need the new
-- automatic per-circle group chat, run this instead:
--   create table circle_messages (
--     id uuid primary key default gen_random_uuid(),
--     circle_id uuid references circles(id) on delete cascade,
--     sender_id uuid references profiles(id) on delete cascade,
--     body text not null,
--     created_at timestamptz default now()
--   );
--   alter table circle_messages enable row level security;
--   create policy "circle members can read the circle chat" on circle_messages
--     for select using (
--       exists (select 1 from circle_members cm where cm.circle_id = circle_messages.circle_id and cm.user_id = auth.uid())
--     );
--   create policy "circle members can post in the circle chat" on circle_messages
--     for insert with check (
--       auth.uid() = sender_id
--       and exists (select 1 from circle_members cm where cm.circle_id = circle_messages.circle_id and cm.user_id = auth.uid())
--     );
--   alter publication supabase_realtime add table circle_messages;

-- 1. Profiles (one row per student, linked to Supabase auth)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  dorm text,
  avatar_url text,
  campus text not null default 'UCLA' check (campus in ('UCLA', 'UCSD', 'UT Austin')),
  created_at timestamptz default now()
);

-- 2. Circles (barter groups — public ones anyone can join, private ones need a code)
create table circles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_id uuid references profiles(id) on delete set null,
  is_private boolean not null default false,
  campus text not null default 'UCLA' check (campus in ('UCLA', 'UCSD', 'UT Austin')), -- which campus this circle belongs to; set from the creator's campus when made
  campus_tag text, -- set only on the 3 premade official campus circles ('UCLA' / 'UCSD' / 'UT Austin'); null for user-created circles
  created_at timestamptz default now()
);

-- only one official circle per campus
create unique index circles_campus_tag_unique on circles (campus_tag) where campus_tag is not null;

create table circle_members (
  circle_id uuid references circles(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (circle_id, user_id)
);

-- Join codes for private circles, kept in their own table so RLS can hide
-- the code from non-members while the circle itself stays browsable by everyone.
create table circle_codes (
  circle_id uuid primary key references circles(id) on delete cascade,
  code text not null
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
  price numeric, -- sale price
  rent_price numeric, -- rent price (separate from sale price)
  photo_url text,
  circle_id uuid references circles(id) on delete set null, -- null = visible campus-wide
  status text not null default 'available' check (status in ('available','pending','gone','completed')),
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

-- 4b. Saves (bookmark an item without swiping/matching on it — no chat implication)
create table saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  item_id uuid references items(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, item_id)
);

-- 4c. Conversations (one shared thread per pair of people, regardless of how
-- many items they've matched on with each other — chat should stay the same
-- thread even as individual item-matches come and go)
create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_lo uuid references profiles(id) on delete cascade, -- the two participants,
  user_hi uuid references profiles(id) on delete cascade, -- stored in a fixed order (lo < hi) so a pair only ever gets one row
  created_at timestamptz default now(),
  unique (user_lo, user_hi)
);

-- 5. Matches (one row per item that sparked mutual interest between two
--    people; several of these can point at the same conversation)
create table matches (
  id uuid primary key default gen_random_uuid(),
  user_a uuid references profiles(id) on delete cascade,
  user_b uuid references profiles(id) on delete cascade,
  item_id uuid references items(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete cascade,
  status text not null default 'active' check (status in ('active','closed','pending_completion','completed')),
  requested_by uuid references profiles(id) on delete set null, -- who asked to mark it complete, while status = 'pending_completion'
  created_at timestamptz default now()
);

-- At most one match row per (pair of people, item) — this is what lets
-- "unlike then like again" reactivate the same row instead of duplicating it.
create unique index matches_pair_item_idx on matches (least(user_a, user_b), greatest(user_a, user_b), item_id);

-- 6. Messages (per conversation, not per item-match)
create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  sender_id uuid references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

-- 6b. Circle chat (one shared group chat per circle — no separate "chat
-- created" step needed, since circle_id itself is the chat's identity.
-- Access is enforced live by RLS against current circle_members, so joining
-- grants it and leaving revokes it automatically — nothing to clean up.)
create table circle_messages (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid references circles(id) on delete cascade,
  sender_id uuid references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

-- 7. Notifications (match/message/transaction events, one row per recipient)
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade, -- recipient
  actor_id uuid references profiles(id) on delete cascade, -- who caused it (clickable in the UI)
  type text not null check (type in ('like','match','message','transaction')),
  body text not null, -- everything AFTER the actor's clickable name, e.g. 'liked your "Denim Jacket"'
  conversation_id uuid references conversations(id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz default now()
);

-- =========================================================
-- Row Level Security
-- =========================================================
alter table profiles enable row level security;
alter table circles enable row level security;
alter table circle_members enable row level security;
alter table circle_codes enable row level security;
alter table items enable row level security;
alter table swipes enable row level security;
alter table saves enable row level security;
alter table conversations enable row level security;
alter table matches enable row level security;
alter table messages enable row level security;
alter table circle_messages enable row level security;
alter table notifications enable row level security;

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
-- Only the creator can delete their circle. The 3 official campus circles
-- have owner_id = null, so no one can ever match this and delete those.
create policy "owner can delete their circle" on circles
  for delete using (auth.uid() = owner_id);

-- Circle membership: users can see members of circles they belong to, and join circles
create policy "members readable by signed-in users" on circle_members
  for select using (auth.role() = 'authenticated');
-- Direct self-joins only work for PUBLIC circles. Private circles can only be
-- joined through join_private_circle(), which checks the code server-side —
-- otherwise anyone could insert themselves into a private circle_members row
-- without ever knowing the code. The one exception: the circle's own creator
-- can always add themselves, even to a private circle they just made.
create policy "users can join public circles directly" on circle_members
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from circles c
      where c.id = circle_members.circle_id
      and (c.is_private = false or c.owner_id = auth.uid())
    )
  );

-- Anyone can leave any circle they're in (including the official campus one).
create policy "users can leave circles" on circle_members
  for delete using (auth.uid() = user_id);

-- Circle codes: only visible to people already in the circle (so members can
-- see it to share with friends, but non-members can't just look it up)
create policy "members can read their circle's join code" on circle_codes
  for select using (
    exists (select 1 from circle_members cm where cm.circle_id = circle_codes.circle_id and cm.user_id = auth.uid())
  );
create policy "circle owner can set the join code" on circle_codes
  for insert with check (
    exists (select 1 from circles c where c.id = circle_codes.circle_id and c.owner_id = auth.uid())
  );

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

-- Saves: users can only see/create/delete their own saves
create policy "users manage their own saves" on saves
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================================================
-- Grouped chat migration (for installs that already have the old
-- one-match-one-chat model and real data — run this whole block once,
-- then skip down to "grant execute" for the updated function)
-- =========================================================
--   create table conversations (
--     id uuid primary key default gen_random_uuid(),
--     user_lo uuid references profiles(id) on delete cascade,
--     user_hi uuid references profiles(id) on delete cascade,
--     created_at timestamptz default now(),
--     unique (user_lo, user_hi)
--   );
--   alter table conversations enable row level security;
--   create policy "participants can read their conversation" on conversations
--     for select using (auth.uid() = user_lo or auth.uid() = user_hi);
--
--   alter table matches add column conversation_id uuid references conversations(id) on delete cascade;
--   alter table matches add column status text not null default 'active' check (status in ('active','closed'));
--
--   -- backfill: create one conversation per distinct pair from existing matches
--   insert into conversations (user_lo, user_hi)
--   select distinct least(user_a, user_b), greatest(user_a, user_b) from matches
--   on conflict (user_lo, user_hi) do nothing;
--
--   update matches m set conversation_id = c.id
--   from conversations c
--   where c.user_lo = least(m.user_a, m.user_b) and c.user_hi = greatest(m.user_a, m.user_b);
--
--   create unique index matches_pair_item_idx on matches (least(user_a, user_b), greatest(user_a, user_b), item_id);
--
--   alter table messages add column conversation_id uuid references conversations(id) on delete cascade;
--   update messages msg set conversation_id = m.conversation_id
--   from matches m where m.id = msg.match_id;
--
--   drop policy "participants can read match messages" on messages;
--   drop policy "participants can send match messages" on messages;
--   create policy "participants can read conversation messages" on messages
--     for select using (
--       exists (select 1 from conversations c where c.id = messages.conversation_id
--         and (c.user_lo = auth.uid() or c.user_hi = auth.uid()))
--     );
--   create policy "participants can send conversation messages" on messages
--     for insert with check (
--       auth.uid() = sender_id
--       and exists (select 1 from conversations c where c.id = messages.conversation_id
--         and (c.user_lo = auth.uid() or c.user_hi = auth.uid()))
--     );
--
-- After running the block above, also re-run the record_swipe_and_match
-- function definition near the bottom of this file (it's a create-or-replace,
-- safe to run again) to pick up the new conversation-aware logic.
--
-- If you already have the grouped-chat migration applied and just need the
-- new "transaction complete" confirmation flow, run this instead:
--   alter table matches drop constraint matches_status_check;
--   alter table matches add constraint matches_status_check
--     check (status in ('active','closed','pending_completion','completed'));
--   alter table matches add column requested_by uuid references profiles(id) on delete set null;
-- ...then re-run record_swipe_and_match (updated to clear requested_by) and
-- the two new functions (request_transaction_complete, respond_transaction_complete)
-- from the bottom of this file.
--
-- If you already have the transaction-complete migration applied and just
-- need the new notifications feature, run this instead:
--   create table notifications (
--     id uuid primary key default gen_random_uuid(),
--     user_id uuid references profiles(id) on delete cascade,
--     type text not null check (type in ('match','message','transaction')),
--     body text not null,
--     conversation_id uuid references conversations(id) on delete cascade,
--     read boolean not null default false,
--     created_at timestamptz default now()
--   );
--   alter table notifications enable row level security;
--   create policy "users manage their own notifications" on notifications
--     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
--   alter publication supabase_realtime add table notifications;
-- ...then re-run record_swipe_and_match, request_transaction_complete,
-- respond_transaction_complete (all three updated to insert notifications),
-- and the new notify_new_message trigger, all from the bottom of this file.
--
-- If you already have the notifications table and just need the "who liked
-- you" + clickable-profile feature, run this instead:
--   alter table notifications drop constraint notifications_type_check;
--   alter table notifications add constraint notifications_type_check
--     check (type in ('like','match','message','transaction'));
--   alter table notifications add column actor_id uuid references profiles(id) on delete cascade;
-- ...then re-run record_swipe_and_match, request_transaction_complete,
-- respond_transaction_complete, and notify_new_message, all from the bottom
-- of this file (all four are updated to set actor_id).

-- Conversations: visible to either participant
create policy "participants can read their conversation" on conversations
  for select using (auth.uid() = user_lo or auth.uid() = user_hi);

-- Matches: visible to either participant
create policy "participants can read their matches" on matches
  for select using (auth.uid() = user_a or auth.uid() = user_b);
create policy "system or participants can create matches" on matches
  for insert with check (auth.uid() = user_a or auth.uid() = user_b);

-- Messages: visible to participants of the parent conversation (shared across
-- every item they've matched on with each other, not just one match row)
create policy "participants can read conversation messages" on messages
  for select using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
      and (c.user_lo = auth.uid() or c.user_hi = auth.uid())
    )
  );
create policy "participants can send conversation messages" on messages
  for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
      and (c.user_lo = auth.uid() or c.user_hi = auth.uid())
    )
  );

-- Notifications: users can only see/update their own (marking read)
create policy "users manage their own notifications" on notifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Circle chat: only CURRENT members can read or post — checked live against
-- circle_members, so joining grants access immediately and leaving revokes
-- it immediately, with nothing to explicitly create or tear down.
create policy "circle members can read the circle chat" on circle_messages
  for select using (
    exists (select 1 from circle_members cm where cm.circle_id = circle_messages.circle_id and cm.user_id = auth.uid())
  );
create policy "circle members can post in the circle chat" on circle_messages
  for insert with check (
    auth.uid() = sender_id
    and exists (select 1 from circle_members cm where cm.circle_id = circle_messages.circle_id and cm.user_id = auth.uid())
  );

-- Storage bucket for item photos (run once; then set the bucket to public read)
insert into storage.buckets (id, name, public) values ('item-photos', 'item-photos', true)
on conflict (id) do nothing;

-- Making the bucket "public" only controls whether reads bypass auth — Supabase Storage
-- still enforces its own RLS on storage.objects separately, and has zero policies by
-- default. Without these, uploads silently fail (the item still gets created, just with
-- no photo). These three policies match the "{userId}/filename" path used in Closet.jsx.
create policy "anyone can view item photos" on storage.objects
  for select using (bucket_id = 'item-photos');

create policy "users can upload their own item photos" on storage.objects
  for insert with check (
    bucket_id = 'item-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users can delete their own item photos" on storage.objects
  for delete using (
    bucket_id = 'item-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Turn on realtime for the chat feature (lets the app receive new messages instantly
-- without polling). If this errors saying it's already added, that's fine — ignore it.
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table circle_messages;

-- =========================================================
-- Match detection function
-- =========================================================
-- No mutual-interest requirement: liking an item always opens (or reuses)
-- a chat with that item's owner, whether or not they've liked anything of
-- yours. The chat shows every item either of you has liked from the other.
-- Unliking marks that item's match "closed" instead of deleting it, so the
-- shared chat thread stays intact even as individual items come and go.
create or replace function public.record_swipe_and_match(p_item_id uuid, p_direction text)
returns table(matched boolean, match_id uuid, conversation_id uuid) as $$
declare
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_match_id uuid;
  v_conversation_id uuid;
  v_lo uuid;
  v_hi uuid;
  v_item_title text;
begin
  insert into swipes (user_id, item_id, direction)
  values (v_user_id, p_item_id, p_direction)
  on conflict (user_id, item_id) do update set direction = excluded.direction;

  select owner_id, title into v_owner_id, v_item_title from items where id = p_item_id;

  if v_owner_id is not null and v_owner_id <> v_user_id then
    v_lo := least(v_user_id, v_owner_id);
    v_hi := greatest(v_user_id, v_owner_id);

    if p_direction = 'like' then
      select id into v_conversation_id from conversations where user_lo = v_lo and user_hi = v_hi;
      if v_conversation_id is null then
        insert into conversations (user_lo, user_hi) values (v_lo, v_hi)
        returning id into v_conversation_id;
      end if;

      insert into matches (user_a, user_b, item_id, conversation_id, status)
      values (v_user_id, v_owner_id, p_item_id, v_conversation_id, 'active')
      on conflict (least(user_a, user_b), greatest(user_a, user_b), item_id)
      do update set status = 'active', conversation_id = excluded.conversation_id, requested_by = null
      returning id into v_match_id;

      -- One notification per like. It carries the conversation_id so tapping
      -- it opens the chat directly.
      insert into notifications (user_id, actor_id, type, body, conversation_id)
      values (v_owner_id, v_user_id, 'like', 'liked your "' || coalesce(v_item_title, 'item') || '"', v_conversation_id);
    elsif p_direction = 'pass' then
      update matches
      set status = 'closed', requested_by = null
      where item_id = p_item_id
        and (user_a = v_user_id or user_b = v_user_id)
      returning id, matches.conversation_id into v_match_id, v_conversation_id;
    end if;
  end if;

  return query select (v_match_id is not null and p_direction = 'like'), v_match_id, v_conversation_id;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.record_swipe_and_match(uuid, text) to authenticated;

-- =========================================================
-- Transaction completion flow
-- =========================================================
-- One person requests "transaction complete" on an item; the other person
-- must confirm before it actually flips. Both steps go through security
-- definer functions (rather than a client-side UPDATE) so we can enforce
-- "only a participant can request" and "only the OTHER participant can
-- confirm" without needing an UPDATE policy that would let either person
-- unilaterally mark it complete.
create or replace function public.request_transaction_complete(p_item_id uuid)
returns table(match_id uuid, conversation_id uuid, status text) as $$
declare
  v_user_id uuid := auth.uid();
  v_match_id uuid;
  v_conversation_id uuid;
  v_other_id uuid;
  v_item_title text;
begin
  select title into v_item_title from items where id = p_item_id;

  update matches
  set status = 'pending_completion', requested_by = v_user_id
  where item_id = p_item_id
    and (user_a = v_user_id or user_b = v_user_id)
    and matches.status = 'active'
  returning id, matches.conversation_id, (case when user_a = v_user_id then user_b else user_a end)
  into v_match_id, v_conversation_id, v_other_id;

  if v_match_id is not null then
    insert into notifications (user_id, actor_id, type, body, conversation_id)
    values (v_other_id, v_user_id, 'transaction', 'wants to confirm the trade for "' || coalesce(v_item_title, 'an item') || '"', v_conversation_id);
  end if;

  return query select v_match_id, v_conversation_id, 'pending_completion'::text;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.request_transaction_complete(uuid) to authenticated;

create or replace function public.respond_transaction_complete(p_item_id uuid, p_accept boolean)
returns table(match_id uuid, conversation_id uuid, status text) as $$
declare
  v_user_id uuid := auth.uid();
  v_match_id uuid;
  v_conversation_id uuid;
  v_new_status text;
  v_requester_id uuid;
  v_item_title text;
begin
  v_new_status := case when p_accept then 'completed' else 'active' end;
  select title into v_item_title from items where id = p_item_id;

  select requested_by into v_requester_id
  from matches
  where item_id = p_item_id
    and (user_a = v_user_id or user_b = v_user_id)
    and matches.status = 'pending_completion'
    and requested_by <> v_user_id;

  update matches
  set status = v_new_status, requested_by = null
  where item_id = p_item_id
    and (user_a = v_user_id or user_b = v_user_id)
    and matches.status = 'pending_completion'
    and requested_by <> v_user_id -- only the other participant can confirm/decline, not whoever asked
  returning id, matches.conversation_id into v_match_id, v_conversation_id;

  -- Confirmed trades take the item off the market: it drops out of the feed
  -- (which only shows 'available' items) and shows as "Completed" in the
  -- owner's own closet view instead.
  if v_match_id is not null and p_accept then
    update items set status = 'completed' where id = p_item_id;
    -- if other people also had active/pending matches on this same item,
    -- close those out too — the item's gone now
    update matches
    set status = 'closed', requested_by = null
    where item_id = p_item_id and id <> v_match_id and matches.status in ('active', 'pending_completion');
  end if;

  if v_match_id is not null and v_requester_id is not null then
    insert into notifications (user_id, actor_id, type, body, conversation_id)
    values (
      v_requester_id,
      v_user_id,
      'transaction',
      case when p_accept then 'confirmed the trade for "' || coalesce(v_item_title, 'an item') || '"'
           else 'said not yet for "' || coalesce(v_item_title, 'an item') || '"' end,
      v_conversation_id
    );
  end if;

  return query select v_match_id, v_conversation_id, v_new_status;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.respond_transaction_complete(uuid, boolean) to authenticated;

-- =========================================================
-- Message notifications
-- =========================================================
-- Notify the OTHER participant whenever a message is sent — a trigger
-- rather than client-side code, so it fires no matter which screen sent it.
create or replace function public.notify_new_message()
returns trigger as $$
declare
  v_recipient uuid;
begin
  select case when c.user_lo = new.sender_id then c.user_hi else c.user_lo end
  into v_recipient
  from conversations c
  where c.id = new.conversation_id;

  if v_recipient is not null then
    insert into notifications (user_id, actor_id, type, body, conversation_id)
    values (v_recipient, new.sender_id, 'message', 'sent you a message', new.conversation_id);
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists messages_notify_after_insert on messages;
create trigger messages_notify_after_insert
after insert on messages
for each row execute function public.notify_new_message();

-- =========================================================
-- Private circle joining
-- =========================================================
-- Verifies the code server-side (the client can't read circle_codes for a
-- circle it isn't already a member of) and only then adds the membership row.
create or replace function public.join_private_circle(p_circle_id uuid, p_code text)
returns boolean as $$
declare
  v_user_id uuid := auth.uid();
  v_match boolean;
begin
  select exists (
    select 1 from circle_codes cc
    join circles c on c.id = cc.circle_id
    where cc.circle_id = p_circle_id and c.is_private = true and cc.code = p_code
  ) into v_match;

  if v_match then
    insert into circle_members (circle_id, user_id) values (p_circle_id, v_user_id)
    on conflict do nothing;
  end if;

  return v_match;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.join_private_circle(uuid, text) to authenticated;

-- =========================================================
-- Seed the three official campus circles (safe to re-run — skips existing)
-- =========================================================
insert into circles (name, description, is_private, campus, campus_tag) values
  ('UCLA', 'Official UCLA campus circle', false, 'UCLA', 'UCLA'),
  ('UCSD', 'Official UCSD campus circle', false, 'UCSD', 'UCSD'),
  ('UT Austin', 'Official UT Austin campus circle', false, 'UT Austin', 'UT Austin')
on conflict (campus_tag) where campus_tag is not null do nothing;
