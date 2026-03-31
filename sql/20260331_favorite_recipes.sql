-- Create user-scoped favorite recipes with RLS

begin;

create table if not exists public.favorite_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  instructions text not null default '',
  image_url text,
  created_at timestamptz not null default now(),
  constraint favorite_recipes_user_title_key unique (user_id, title)
);

create index if not exists favorite_recipes_user_id_idx on public.favorite_recipes(user_id);
create index if not exists favorite_recipes_created_at_idx on public.favorite_recipes(created_at desc);

alter table public.favorite_recipes enable row level security;

drop policy if exists "Users manage own favorite recipes" on public.favorite_recipes;
create policy "Users manage own favorite recipes"
on public.favorite_recipes
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

commit;
