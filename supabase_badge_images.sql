create table if not exists public.badge_images (
  id bigint generated always as identity primary key,
  image_data text not null,
  text2_value text,
  frame_asset text,
  created_at timestamptz not null default now()
);

alter table public.badge_images enable row level security;

drop policy if exists "allow insert badge_images" on public.badge_images;
create policy "allow insert badge_images"
on public.badge_images
for insert
to anon, authenticated
with check (true);

drop policy if exists "allow select badge_images" on public.badge_images;
create policy "allow select badge_images"
on public.badge_images
for select
to anon, authenticated
using (true);

create or replace view public.v_badge_images_saved as
select
  id,
  image_data,
  text2_value,
  frame_asset,
  created_at
from public.badge_images
order by created_at desc;
