-- Run once in the Supabase SQL Editor for this project.
create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  privacy_consent_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'delivered', 'cancelled')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  delivered_at timestamptz
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_idx on public.orders (status);

create table if not exists public.review_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists review_requests_order_idx on public.review_requests (order_id);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  rating smallint not null check (rating between 1 and 5),
  comment text not null check (char_length(comment) between 8 and 280),
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;
alter table public.review_requests enable row level security;
alter table public.reviews enable row level security;

-- Browser users receive no table grants; only server functions with the
-- service-role key can read or write orders, invitation tokens, and reviews.
revoke all on public.orders from anon, authenticated;
revoke all on public.review_requests from anon, authenticated;
revoke all on public.reviews from anon, authenticated;

grant usage on schema public to service_role;
grant all on public.orders to service_role;
grant all on public.review_requests to service_role;
grant all on public.reviews to service_role;

create or replace function public.review_stats()
returns table (review_count bigint, average_rating numeric)
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint, round(avg(rating)::numeric, 1)
  from public.reviews;
$$;

revoke all on function public.review_stats() from public, anon, authenticated;
grant execute on function public.review_stats() to service_role;
