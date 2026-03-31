-- Add storage zones for inventory grouping (fridge, dry storage, drinks, freezer, other)

begin;

alter table public.pantry_items
  add column if not exists storage_zone text;

update public.pantry_items
set storage_zone = case
  when lower(coalesce(category, '')) like any (array['%drink%', '%beverage%', '%juice%', '%soda%', '%water%', '%tea%', '%coffee%']) then 'drinks'
  when lower(coalesce(category, '')) like any (array['%frozen%', '%freezer%', '%ice cream%']) then 'freezer'
  when lower(coalesce(category, '')) like any (array['%dairy%', '%milk%', '%meat%', '%fish%', '%seafood%', '%egg%', '%vegetable%', '%veggie%', '%fruit%', '%produce%', '%fresh%']) then 'fridge'
  when lower(coalesce(category, '')) like any (array['%pantry%', '%dry%', '%grain%', '%rice%', '%pasta%', '%cereal%', '%spice%', '%flour%', '%sugar%', '%bean%', '%lentil%', '%snack%']) then 'dry_storage'
  else 'other'
end
where storage_zone is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pantry_items_storage_zone_check'
      and conrelid = 'public.pantry_items'::regclass
  ) then
    alter table public.pantry_items
      add constraint pantry_items_storage_zone_check
      check (storage_zone is null or storage_zone in ('fridge', 'dry_storage', 'drinks', 'freezer', 'other'));
  end if;
end $$;

alter table public.pantry_items
  alter column storage_zone set default 'other';

commit;