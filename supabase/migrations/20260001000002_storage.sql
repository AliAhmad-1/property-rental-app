-- ============================================================
-- STORAGE: payment-slips bucket
-- ============================================================

insert into storage.buckets (id, name, public)
values ('payment-slips', 'payment-slips', false)
on conflict (id) do nothing;

-- Only staff/manager of the same org can upload
create policy "staff/manager upload slips" on storage.objects
  for insert with check (
    bucket_id = 'payment-slips'
    and public.user_org_role() in ('manager','staff')
    and (storage.foldername(name))[1] = public.user_org_id()::text
  );

-- Only staff/manager of the same org can read
create policy "staff/manager read slips" on storage.objects
  for select using (
    bucket_id = 'payment-slips'
    and public.user_org_role() in ('manager','staff')
    and (storage.foldername(name))[1] = public.user_org_id()::text
  );

-- Nobody else can delete or update
create policy "no delete slips" on storage.objects
  as restrictive for delete using (
    bucket_id = 'payment-slips' and false
  );
