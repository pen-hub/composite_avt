-- Add DELETE and UPDATE policies for badge_images table
-- Run this in Supabase SQL Editor if delete/update is not working

drop policy if exists "allow delete badge_images" on public.badge_images;
create policy "allow delete badge_images"
on public.badge_images
for delete
to anon, authenticated
using (true);

drop policy if exists "allow update badge_images" on public.badge_images;
create policy "allow update badge_images"
on public.badge_images
for update
to anon, authenticated
using (true)
with check (true);
