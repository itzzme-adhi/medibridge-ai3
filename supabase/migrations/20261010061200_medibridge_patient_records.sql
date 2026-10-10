-- Fresh-project baseline. Run once through migrations; do not apply over unrelated tables.
-- Patient-visible rows; all writes pass through the authenticated FastAPI service.
begin;
do $$
declare t text;
begin
 foreach t in array array['medibridge_profiles','medibridge_medical_records','medibridge_document_extractions','medibridge_medical_events','medibridge_medications','medibridge_allergies','medibridge_safety_alerts','medibridge_sharing_grants','medibridge_emergency_profiles','medibridge_emergency_access_grants','medibridge_audit_logs'] loop
  execute format('create table public.%I (
   id uuid primary key,
   owner_id uuid not null references auth.users(id) on delete cascade,
   created_at timestamptz not null default now(),
   data jsonb not null check (jsonb_typeof(data) = ''object''),
   unique(owner_id,id),
   check (data->>''id'' = id::text and data->>''owner_id'' = owner_id::text)
  )',t);
  execute format('alter table public.%I enable row level security',t);
  execute format('create index %I on public.%I(owner_id,created_at desc)',t||'_owner_created',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create policy patient_select on public.%I for select to authenticated using ((select auth.uid()) = owner_id)',t);
 end loop;
 foreach t in array array['medibridge_document_extractions','medibridge_medical_events','medibridge_medications','medibridge_allergies'] loop
  execute format('alter table public.%I add column record_id uuid generated always as ((data->>''record_id'')::uuid) stored not null',t);
  execute format('alter table public.%I add foreign key(owner_id,record_id) references public.medibridge_medical_records(owner_id,id) on delete cascade',t);
  execute format('create index %I on public.%I(record_id)',t||'_record',t);
 end loop;
 foreach t in array array['medibridge_sharing_grants','medibridge_emergency_access_grants'] loop
  execute format('alter table public.%I add column token_hash text generated always as (data->>''token_hash'') stored unique not null check (length(token_hash)=64)',t);
  execute format('alter table public.%I add constraint %I check (jsonb_typeof(data->''revoked'') = ''boolean'' and data->>''expires_at'' is not null)',t,t||'_grant_shape');
 end loop;
end $$;
alter table public.medibridge_profiles add check(id=owner_id);
alter table public.medibridge_emergency_profiles add check(id=owner_id);
-- No patient INSERT, UPDATE or DELETE grants exist, including on audit logs.
-- Immutable original extraction is preserved by the backend review contract.
create function public.medibridge_commit_review(p_record jsonb,p_extraction jsonb,p_derived jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare t text; item jsonb; rid uuid := (p_record->>'id')::uuid; oid uuid := (p_record->>'owner_id')::uuid;
begin
 if (p_extraction->>'owner_id')::uuid <> oid or (p_extraction->>'record_id')::uuid <> rid or (p_extraction->>'id')::uuid <> rid then
  raise exception 'Extraction ownership mismatch';
 end if;
 perform 1 from public.medibridge_medical_records where id=rid and owner_id=oid and coalesce((data->>'deleted')::boolean,false)=false for update;
 if not found then raise exception 'Record missing or deleted'; end if;
 foreach t in array array['medibridge_medical_events','medibridge_medications','medibridge_allergies'] loop
  execute format('delete from public.%I where owner_id=$1 and record_id=$2',t) using oid,rid;
  for item in select value from jsonb_array_elements(p_derived->replace(t,'medibridge_','')) loop
   if (item->>'owner_id')::uuid <> oid or (item->>'record_id')::uuid <> rid then raise exception 'Derived record ownership mismatch'; end if;
   execute format('insert into public.%I(id,owner_id,data) values($1,$2,$3)',t) using (item->>'id')::uuid,oid,item;
  end loop;
 end loop;
 update public.medibridge_medical_records set data=p_record where id=rid and owner_id=oid;
 update public.medibridge_document_extractions set data=p_extraction where id=rid and owner_id=oid;
 if not found then raise exception 'Extraction missing'; end if;
end $$;
revoke execute on function public.medibridge_commit_review(jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.medibridge_commit_review(jsonb,jsonb,jsonb) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('medibridge-medical-documents','medibridge-medical-documents',false,10485760,array['application/pdf','image/png','image/jpeg']);
-- Server-only bucket. The backend checks ownership or a live grant before downloads.
-- Never grant anon access or change the bucket to public.
commit;
