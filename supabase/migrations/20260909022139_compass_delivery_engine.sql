-- Installation delivery v1. Does not migrate/activate legacy voice or outbound leads.
-- Requires the existing compass_clients and portal_is_operator() baseline.
begin;

create table public.delivery_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id text references public.compass_clients(id),
  mode text not null check (mode in ('demo','live')),
  enabled boolean not null default false,
  config jsonb not null,
  ingest_key_hash text unique,
  twilio_number text unique,
  twilio_account_sid text,
  calendar_id text,
  crm_kind text not null default 'manual' check (crm_kind in ('demo','manual')),
  demo_now timestamptz,
  created_at timestamptz not null default now(),
  check (mode = 'demo' or client_id is not null),
  check (mode = 'demo' or crm_kind <> 'demo')
);
create unique index delivery_one_live_account on public.delivery_accounts(client_id) where mode = 'live';

create table public.delivery_contacts (
  id uuid primary key default gen_random_uuid(), account_id uuid not null references public.delivery_accounts(id),
  phone text not null, sms_suppressed boolean not null default false, suppressed_at timestamptz,
  unique(account_id, phone), unique(account_id, id)
);
create table public.delivery_enquiries (
  id uuid primary key default gen_random_uuid(), account_id uuid not null references public.delivery_accounts(id),
  contact_id uuid not null, external_id text not null, name text not null, phone text not null,
  consent jsonb not null, attribution jsonb not null, state jsonb not null,
  control text not null default 'active' check(control in ('active','human','stopped')),
  epoch integer not null default 0, version integer not null default 0,
  lease_token uuid, lease_until timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(account_id, external_id), unique(account_id, id),
  foreign key(account_id,contact_id) references public.delivery_contacts(account_id,id)
);
create table public.delivery_messages (
  id uuid primary key default gen_random_uuid(), seq bigint generated always as identity, account_id uuid not null references public.delivery_accounts(id),
  enquiry_id uuid, phone text not null, provider_id text not null, direction text not null check(direction in ('inbound','outbound')),
  body text not null, status text not null, occurred_at timestamptz not null,
  unique(account_id, direction, provider_id),
  foreign key(account_id,enquiry_id) references public.delivery_enquiries(account_id,id)
);
create table public.delivery_jobs (
  id uuid primary key default gen_random_uuid(), seq bigint generated always as identity,
  account_id uuid not null, enquiry_id uuid not null,
  kind text not null check(kind in ('intake','message','operator','slots','book','cancel','sms','followup','reminder','crm','outcome')),
  payload jsonb not null default '{}', expected_epoch integer, dedupe_key text not null,
  due_at timestamptz not null, status text not null default 'pending' check(status in ('pending','leased','dispatching','succeeded','cancelled','failed','uncertain')),
  attempts integer not null default 0, lease_token uuid, lease_until timestamptz, error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(account_id, dedupe_key), foreign key(account_id,enquiry_id) references public.delivery_enquiries(account_id,id)
);
create index delivery_jobs_due on public.delivery_jobs(due_at,seq) where status in ('pending','leased','dispatching');
create table public.delivery_events (
  id uuid primary key default gen_random_uuid(), seq bigint generated always as identity, account_id uuid not null, enquiry_id uuid not null,
  type text not null, payload jsonb not null default '{}', event_key text not null,
  occurred_at timestamptz not null, unique(account_id,event_key),
  foreign key(account_id,enquiry_id) references public.delivery_enquiries(account_id,id)
);
create table public.delivery_reservations (
  id uuid primary key default gen_random_uuid(), account_id uuid not null, enquiry_id uuid not null,
  job_id uuid not null unique references public.delivery_jobs(id), resource_id text not null,
  starts_at timestamptz not null, ends_at timestamptz not null,
  status text not null default 'held' check(status in ('held','confirmed','released','uncertain')),
  check(ends_at > starts_at), foreign key(account_id,enquiry_id) references public.delivery_enquiries(account_id,id)
);
create table public.delivery_demo_crm (
  enquiry_id uuid primary key, account_id uuid not null, record jsonb not null, updated_at timestamptz not null,
  foreign key(account_id,enquiry_id) references public.delivery_enquiries(account_id,id)
);
create table public.delivery_status_receipts (
  account_id uuid not null references public.delivery_accounts(id), provider_id text not null,
  status text not null, occurred_at timestamptz not null, primary key(account_id,provider_id,status)
);
create table public.delivery_demo_ticks (
  account_id uuid not null references public.delivery_accounts(id), key text not null,
  hours integer not null, created_at timestamptz not null default now(), primary key(account_id,key)
);

-- Operator-only browser access; public webhooks use narrow authenticated server methods.
do $$ declare tab text; begin
  foreach tab in array array['delivery_accounts','delivery_contacts','delivery_enquiries','delivery_messages','delivery_jobs','delivery_events','delivery_reservations','delivery_demo_crm','delivery_status_receipts','delivery_demo_ticks'] loop
    execute format('alter table public.%I enable row level security', tab);
    execute format('alter table public.%I force row level security', tab);
    execute format('create policy operator_read on public.%I for select to authenticated using (public.portal_is_operator())', tab);
    -- Supabase may inherit broad default grants. RLS does not protect TRUNCATE.
    execute format('revoke all on public.%I from public,anon,authenticated', tab);
    execute format('grant select on public.%I to authenticated', tab);
    execute format('grant all on public.%I to service_role', tab);
  end loop;
end $$;
revoke all on sequence public.delivery_jobs_seq_seq,public.delivery_messages_seq_seq,public.delivery_events_seq_seq from public,anon,authenticated;
grant usage,select on sequence public.delivery_jobs_seq_seq to service_role;
grant usage,select on sequence public.delivery_messages_seq_seq,public.delivery_events_seq_seq to service_role;

create function public.delivery_intake(p_data jsonb, p_now timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.delivery_accounts; c public.delivery_contacts; e public.delivery_enquiries;
begin
  select * into a from public.delivery_accounts where id=(p_data->>'accountId')::uuid and enabled;
  if not found then raise exception 'account_unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(a.id::text || ':' || (p_data->>'externalId'),0));
  select * into e from public.delivery_enquiries where account_id=a.id and external_id=p_data->>'externalId';
  if found then return jsonb_build_object('id',e.id,'duplicate',true); end if;
  perform pg_advisory_xact_lock(hashtextextended('contact:'||a.id::text||':'||(p_data->>'phone'),0));
  insert into public.delivery_contacts(account_id,phone) values(a.id,p_data->>'phone')
    on conflict(account_id,phone) do update set phone=excluded.phone returning * into c;
  insert into public.delivery_enquiries(account_id,contact_id,external_id,name,phone,consent,attribution,state,control,created_at,updated_at)
    values(a.id,c.id,p_data->>'externalId',p_data->>'name',c.phone,p_data->'consent',p_data->'attribution',p_data->'state',
      case when c.sms_suppressed then 'stopped' else 'active' end,p_now,p_now) returning * into e;
  insert into public.delivery_jobs(account_id,enquiry_id,kind,payload,dedupe_key,due_at,created_at)
    values(a.id,e.id,'intake','{}','intake:'||e.id,p_now,p_now);
  return jsonb_build_object('id',e.id,'duplicate',false);
end $$;

create function public.delivery_receive(p_account_id uuid,p_provider_id text,p_phone text,p_body text,p_now timestamptz,p_stop boolean default false,p_enquiry_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.delivery_enquiries; mid uuid; ids uuid[];
begin
  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text||':'||p_provider_id,0));
  if exists(select 1 from public.delivery_messages where account_id=p_account_id and direction='inbound' and provider_id=p_provider_id) then
    return jsonb_build_object('duplicate',true);
  end if;
  if not exists(select 1 from public.delivery_accounts where id=p_account_id and enabled) then raise exception 'account_unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended('contact:'||p_account_id::text||':'||p_phone,0));
  if p_enquiry_id is not null then
    select * into e from public.delivery_enquiries where id=p_enquiry_id and account_id=p_account_id and phone=p_phone for update;
    if not found then raise exception 'enquiry_not_found'; end if;
  else
    select array_agg(id) into ids from public.delivery_enquiries where account_id=p_account_id and phone=p_phone
      and state->>'stage' not in ('won','lost','invalid');
    if cardinality(ids)=1 then select * into e from public.delivery_enquiries where id=ids[1] for update; end if;
  end if;
  insert into public.delivery_messages(account_id,enquiry_id,phone,provider_id,direction,body,status,occurred_at)
    values(p_account_id,e.id,p_phone,p_provider_id,'inbound',p_body,'received',p_now) returning id into mid;
  if p_stop then
    insert into public.delivery_contacts(account_id,phone,sms_suppressed,suppressed_at) values(p_account_id,p_phone,true,p_now)
      on conflict(account_id,phone) do update set sms_suppressed=true,suppressed_at=p_now;
    update public.delivery_enquiries set control='stopped',epoch=epoch+1,updated_at=p_now where account_id=p_account_id and phone=p_phone;
    update public.delivery_jobs set status='cancelled',error='opted_out' where account_id=p_account_id and enquiry_id in
      (select id from public.delivery_enquiries where account_id=p_account_id and phone=p_phone) and expected_epoch is not null and status='pending';
  elsif e.id is not null then
    update public.delivery_enquiries set epoch=epoch+1,updated_at=p_now where id=e.id;
    update public.delivery_jobs set status='cancelled',error='new_reply' where enquiry_id=e.id and expected_epoch is not null and status='pending';
  end if;
  if e.id is not null then
    insert into public.delivery_jobs(account_id,enquiry_id,kind,payload,dedupe_key,due_at,created_at)
      values(p_account_id,e.id,'message',jsonb_build_object('body',p_body,'providerId',p_provider_id,'stop',p_stop),'inbound:'||p_provider_id,p_now,p_now);
  end if;
  return jsonb_build_object('id',mid,'enquiryId',e.id,'unassigned',e.id is null,'duplicate',false);
end $$;

create function public.delivery_command(p_account_id uuid,p_enquiry_id uuid,p_key text,p_kind text,p_payload jsonb,p_now timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare e public.delivery_enquiries; jid uuid;
begin
  if p_kind not in ('operator','outcome') then raise exception 'invalid_command'; end if;
  select * into e from public.delivery_enquiries where id=p_enquiry_id and account_id=p_account_id for update;
  if not found then raise exception 'enquiry_not_found'; end if;
  select id into jid from public.delivery_jobs where account_id=p_account_id and dedupe_key='command:'||p_key;
  if found then return jid; end if;
  if p_payload->>'action' in ('resume','send') and exists(select 1 from public.delivery_contacts where id=e.contact_id and sms_suppressed) then
    raise exception 'contact_opted_out';
  end if;
  if p_payload->>'action' in ('resume','send') and not coalesce((e.consent->>'sms')::boolean,false) then raise exception 'sms_permission_missing'; end if;
  if p_payload->>'action'='resume' and (exists(select 1 from public.delivery_jobs where enquiry_id=e.id and status='uncertain') or
      exists(select 1 from public.delivery_reservations where enquiry_id=e.id and status='uncertain')) then
    raise exception 'provider_reconciliation_required';
  end if;
  update public.delivery_enquiries set epoch=epoch+1,updated_at=p_now,
    control=case when control='stopped' then 'stopped' when p_payload->>'action'='resume' then 'active'
      when p_payload->>'action' in ('takeover','send') then 'human' else control end where id=e.id;
  update public.delivery_jobs set status='cancelled',error='operator_change' where enquiry_id=e.id and expected_epoch is not null and status='pending';
  insert into public.delivery_jobs(account_id,enquiry_id,kind,payload,dedupe_key,due_at,created_at)
    values(p_account_id,e.id,p_kind,p_payload,'command:'||p_key,p_now,p_now) returning id into jid;
  return jid;
end $$;

-- Claim serially per enquiry, across processes. Lease ownership fences every completion.
create function public.delivery_claim(p_now timestamptz,p_account_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.delivery_enquiries; j public.delivery_jobs; a public.delivery_accounts; token uuid; expired record;
begin
  -- A process dying after beginning an SMS send leaves an uncertain result: never resend blindly.
  -- Every worker method locks the enquiry before its job to avoid reversed lock ordering.
  for expired in select en.id from public.delivery_enquiries en where en.lease_until<p_now
      and (p_account_id is null or en.account_id=p_account_id) for update skip locked loop
    update public.delivery_jobs set status=case when status='dispatching' then 'uncertain' when attempts>=4 then 'failed' else 'pending' end,
      error=case when status='dispatching' then 'worker_lost_during_send' when attempts>=4 then 'worker_retry_exhausted' else error end,
      lease_token=null,lease_until=null,updated_at=p_now
      where enquiry_id=expired.id and status in ('leased','dispatching') and lease_until<p_now;
    if exists(select 1 from public.delivery_jobs q where q.enquiry_id=expired.id and q.status in ('uncertain','failed') and q.updated_at=p_now) then
      update public.delivery_enquiries en set control=case when en.control='stopped' then 'stopped' else 'human' end,epoch=epoch+1,
        state=jsonb_set(en.state,'{handoff}',jsonb_build_object('reason','Interrupted delivery action; reconcile provider status before resuming','owner',ac.config->>'owner','dueAt',p_now)),updated_at=p_now
        from public.delivery_accounts ac where en.id=expired.id and en.account_id=ac.id;
      update public.delivery_reservations r set status='uncertain' from public.delivery_jobs q
        where r.job_id=q.id and q.enquiry_id=expired.id and q.status in ('uncertain','failed') and r.status='held';
    end if;
    update public.delivery_enquiries set lease_token=null,lease_until=null where id=expired.id;
  end loop;
  select en.* into e from public.delivery_enquiries en join public.delivery_accounts ac on ac.id=en.account_id
    where ac.enabled and (p_account_id is null or en.account_id=p_account_id) and (en.lease_until is null or en.lease_until<p_now)
    and exists(select 1 from public.delivery_jobs q where q.enquiry_id=en.id and q.status='pending' and q.due_at<=p_now)
    order by en.updated_at,en.id for update of en skip locked limit 1;
  if not found then return null; end if;
  select * into j from public.delivery_jobs where enquiry_id=e.id and status='pending' and due_at<=p_now order by due_at,seq limit 1 for update;
  token:=gen_random_uuid();
  update public.delivery_enquiries set lease_token=token,lease_until=p_now+interval '120 seconds' where id=e.id returning * into e;
  update public.delivery_jobs set status='leased',attempts=attempts+1,lease_token=token,lease_until=p_now+interval '120 seconds',updated_at=p_now where id=j.id returning * into j;
  select * into a from public.delivery_accounts where id=e.account_id;
  return jsonb_build_object('enquiry',to_jsonb(e),'job',to_jsonb(j),'account',to_jsonb(a)-'ingest_key_hash');
end $$;

create function public.delivery_gate(p_job_id uuid,p_token uuid,p_now timestamptz,p_dispatch boolean default false)
returns boolean language plpgsql security definer set search_path = '' as $$
declare j public.delivery_jobs; e public.delivery_enquiries; suppressed boolean;
begin
  select * into j from public.delivery_jobs where id=p_job_id;
  if not found then return false; end if;
  select * into e from public.delivery_enquiries where id=j.enquiry_id and lease_token=p_token and lease_until>p_now for update;
  if not found then return false; end if;
  select * into j from public.delivery_jobs where id=p_job_id and lease_token=p_token and status='leased' and lease_until>p_now for update;
  if not found then return false; end if;
  if not exists(select 1 from public.delivery_accounts where id=j.account_id and enabled) then return false; end if;
  if j.expected_epoch is not null then
    if e.epoch<>j.expected_epoch then return false; end if;
    select sms_suppressed into suppressed from public.delivery_contacts where id=e.contact_id and account_id=e.account_id;
    if suppressed is null or suppressed or not coalesce((e.consent->>'sms')::boolean,false) or e.control='stopped' then return false; end if;
    if e.control='human' and not (j.kind='sms' and (coalesce((j.payload->>'handoffAck')::boolean,false) or coalesce((j.payload->>'humanSend')::boolean,false))) then return false; end if;
  end if;
  if p_dispatch then
    if j.kind<>'sms' then raise exception 'dispatch_only_sms'; end if;
    update public.delivery_jobs set status='dispatching' where id=j.id;
  end if;
  return true;
end $$;

create function public.delivery_finish(p_job_id uuid,p_token uuid,p_now timestamptz,p_result jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare j public.delivery_jobs; e public.delivery_enquiries; item jsonb; i integer:=0; next_control text;
begin
  select * into j from public.delivery_jobs where id=p_job_id;
  if not found then return false; end if;
  select * into e from public.delivery_enquiries where id=j.enquiry_id and lease_token=p_token and lease_until>p_now for update;
  if not found then return false; end if;
  select * into j from public.delivery_jobs where id=p_job_id and lease_token=p_token and status in ('leased','dispatching') and lease_until>p_now for update;
  if not found then return false; end if;
  next_control:=e.control;
  if e.control<>'stopped' and e.epoch=(p_result->>'epoch')::integer then next_control:=coalesce(p_result->>'control',e.control); end if;
  update public.delivery_enquiries set state=case when e.epoch<>(p_result->>'epoch')::integer and e.state ? 'handoff' and p_result ? 'state'
      then jsonb_set(p_result->'state','{handoff}',e.state->'handoff') else coalesce(p_result->'state',state) end,control=next_control,
    version=version+1,lease_token=null,lease_until=null,updated_at=p_now where id=e.id;
  update public.delivery_jobs set status=coalesce(p_result->>'status','succeeded'),error=p_result->>'error',
    due_at=coalesce((p_result->>'dueAt')::timestamptz,due_at),lease_token=null,lease_until=null,updated_at=p_now where id=j.id;
  for item in select value from jsonb_array_elements(coalesce(p_result->'jobs','[]')) loop
    insert into public.delivery_jobs(account_id,enquiry_id,kind,payload,dedupe_key,due_at,expected_epoch,status,created_at)
      values(e.account_id,e.id,item->>'kind',item->'payload',item->>'key',(item->>'dueAt')::timestamptz,
        case when (item->>'guarded')::boolean then (p_result->>'epoch')::integer else null end,
        case when (item->>'guarded')::boolean and (e.epoch<>(p_result->>'epoch')::integer or exists(
          select 1 from public.delivery_jobs pending where pending.enquiry_id=e.id and pending.id<>j.id
          and pending.kind in ('message','operator','outcome') and pending.status='pending')) then 'cancelled' else 'pending' end,p_now)
      on conflict(account_id,dedupe_key) do nothing;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_result->'events','[]')) loop
    insert into public.delivery_events(account_id,enquiry_id,type,payload,event_key,occurred_at)
      values(e.account_id,e.id,item->>'type',coalesce(item->'payload','{}'),j.id::text||':'||i,p_now) on conflict do nothing;
    i:=i+1;
  end loop;
  if p_result ? 'message' then
    item:=p_result->'message';
    insert into public.delivery_messages(account_id,enquiry_id,phone,provider_id,direction,body,status,occurred_at)
      values(e.account_id,e.id,e.phone,item->>'id','outbound',item->>'body',item->>'status',p_now) on conflict do nothing;
    -- Provider delivery callbacks may arrive before the create response is persisted.
    for item in select jsonb_build_object('id',provider_id,'status',status) from public.delivery_status_receipts
      where account_id=e.account_id and provider_id=p_result->'message'->>'id' order by occurred_at loop
      perform public.delivery_message_status(e.account_id,item->>'id',item->>'status',p_now);
    end loop;
  end if;
  if p_result ? 'crm' and (p_result->'crm') is not null and exists(select 1 from public.delivery_accounts where id=e.account_id and mode='demo') then
    insert into public.delivery_demo_crm(enquiry_id,account_id,record,updated_at) values(e.id,e.account_id,p_result->'crm',p_now)
      on conflict(enquiry_id) do update set record=excluded.record,updated_at=excluded.updated_at;
  end if;
  if j.kind='book' and p_result->>'status'='succeeded' then
    update public.delivery_reservations set status='released' where enquiry_id=e.id and job_id<>j.id;
    update public.delivery_reservations set status='confirmed' where job_id=j.id;
  elsif j.kind='cancel' and p_result->>'status'='succeeded' then
    update public.delivery_reservations set status='released' where enquiry_id=e.id;
  elsif j.kind='book' and p_result->>'status' in ('failed','cancelled','uncertain') then
    update public.delivery_reservations set status=case when p_result->>'error'='slot_unavailable' then 'released' else 'uncertain' end where job_id=j.id;
  end if;
  return true;
end $$;

create function public.delivery_reserve(p_job_id uuid,p_token uuid,p_resource text,p_start timestamptz,p_end timestamptz,p_now timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare j public.delivery_jobs;
begin
  if p_start<=p_now or p_end<=p_start then return false; end if;
  if not public.delivery_gate(p_job_id,p_token,p_now,false) then return false; end if;
  select * into j from public.delivery_jobs where id=p_job_id;
  if j.kind<>'book' then raise exception 'reservation_requires_booking'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_resource,0));
  if exists(select 1 from public.delivery_reservations where resource_id=p_resource and enquiry_id<>j.enquiry_id and status<>'released'
      and tstzrange(starts_at,ends_at,'[)') && tstzrange(p_start,p_end,'[)')) then return false; end if;
  insert into public.delivery_reservations(account_id,enquiry_id,job_id,resource_id,starts_at,ends_at)
    values(j.account_id,j.enquiry_id,j.id,p_resource,p_start,p_end) on conflict(job_id) do nothing;
  return true;
end $$;

create function public.delivery_message_status(p_account_id uuid,p_provider_id text,p_status text,p_now timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare m public.delivery_messages; ranks jsonb := '{"accepted":0,"queued":1,"sending":2,"sent":3,"delivered":4,"read":5,"failed":6,"undelivered":6}';
begin
  if not ranks ? p_status then return false; end if;
  insert into public.delivery_status_receipts(account_id,provider_id,status,occurred_at)
    values(p_account_id,p_provider_id,p_status,p_now) on conflict do nothing;
  select * into m from public.delivery_messages where account_id=p_account_id and provider_id=p_provider_id and direction='outbound' for update;
  if not found then return true; end if;
  if coalesce((ranks->>m.status)::int,-1) >= (ranks->>p_status)::int then return true; end if;
  update public.delivery_messages set status=p_status where id=m.id;
  insert into public.delivery_events(account_id,enquiry_id,type,payload,event_key,occurred_at)
    values(m.account_id,m.enquiry_id,'sms.'||p_status,jsonb_build_object('providerId',p_provider_id),p_provider_id||':'||p_status,p_now) on conflict do nothing;
  if p_status in ('failed','undelivered') then
    update public.delivery_enquiries e set control=case when control='stopped' then 'stopped' else 'human' end,epoch=epoch+1,
      state=jsonb_set(state,'{handoff}',jsonb_build_object('reason','SMS delivery failed','owner',a.config->>'owner','dueAt',p_now))
      from public.delivery_accounts a where e.id=m.enquiry_id and e.account_id=a.id;
  end if;
  return true;
end $$;

create function public.delivery_demo_account(p_config jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare aid uuid := 'd0000000-0000-4000-8000-000000000001';
begin
  insert into public.delivery_accounts(id,mode,enabled,config,crm_kind) values(aid,'demo',true,p_config,'demo') on conflict(id) do nothing;
  if not exists(select 1 from public.delivery_accounts where id=aid and mode='demo') then raise exception 'demo_account_conflict'; end if;
  return aid;
end $$;

create function public.delivery_snapshot(p_account_id uuid default null,p_enquiry_id uuid default null)
returns jsonb language sql security definer set search_path = '' as $$
  with scoped as (select * from public.delivery_enquiries where (p_account_id is null or account_id=p_account_id) and (p_enquiry_id is null or id=p_enquiry_id)),
  recent as (select * from scoped order by updated_at desc limit 100)
  select jsonb_build_object(
    'accounts',coalesce((select jsonb_agg(to_jsonb(a)-'ingest_key_hash' order by created_at) from public.delivery_accounts a),'[]'),
    'enquiries',coalesce((select jsonb_agg(to_jsonb(r)-'lease_token'-'lease_until' order by updated_at desc) from recent r),'[]'),
    'messages',coalesce((select jsonb_agg(to_jsonb(m) order by occurred_at,seq) from (select * from public.delivery_messages where enquiry_id in(select id from recent) order by occurred_at desc,seq desc limit 500) m),'[]'),
    'jobs',coalesce((select jsonb_agg(to_jsonb(j)-'lease_token' order by due_at) from (select * from public.delivery_jobs where enquiry_id in(select id from recent) order by created_at desc,seq desc limit 300) j),'[]'),
    'events',coalesce((select jsonb_agg(to_jsonb(v) order by occurred_at,seq) from (select * from public.delivery_events where enquiry_id in(select id from recent) order by occurred_at desc,seq desc limit 300) v),'[]'),
    'crm',coalesce((select jsonb_agg(to_jsonb(c)) from public.delivery_demo_crm c where enquiry_id in(select id from recent)),'[]'),
    'unassigned',coalesce((select jsonb_agg(to_jsonb(m)) from (select * from public.delivery_messages where enquiry_id is null and (p_account_id is null or account_id=p_account_id) order by occurred_at desc limit 100) m),'[]'),
    'metrics',(select jsonb_build_object(
      'total',count(*),'contacted',count(*) filter(where state->'milestones' ? 'engaged'),
      'qualified',count(*) filter(where state->'milestones' ? 'qualified'),
      'booked',count(*) filter(where state->'milestones' ? 'booked'),
      'attended',count(*) filter(where state->'milestones' ? 'attended'),
      'quoted',count(*) filter(where state->'milestones' ? 'quoted'),
      'won',count(*) filter(where state->'milestones' ? 'won'),
      'needsHuman',count(*) filter(where control='human' and state->'handoff'->>'resolvedAt' is null),
      'optedOut',count(*) filter(where control='stopped')) from scoped)
  );
$$;

create function public.delivery_demo_advance(p_account_id uuid,p_hours integer,p_key text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare demo_clock timestamptz;
begin
  if p_hours<1 or p_hours>168 or length(p_key)<8 or length(p_key)>200 then raise exception 'invalid_demo_advance'; end if;
  select coalesce(demo_now,now()) into demo_clock from public.delivery_accounts where id=p_account_id and mode='demo' for update;
  if not found then raise exception 'demo_only'; end if;
  insert into public.delivery_demo_ticks(account_id,key,hours) values(p_account_id,p_key,p_hours) on conflict do nothing;
  if not found then return demo_clock; end if;
  demo_clock:=demo_clock+make_interval(hours=>p_hours);
  update public.delivery_accounts set demo_now=demo_clock where id=p_account_id;
  return demo_clock;
end $$;

create function public.delivery_assign_reply(p_message_id uuid,p_enquiry_id uuid,p_now timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare m public.delivery_messages; e public.delivery_enquiries;
begin
  select * into m from public.delivery_messages where id=p_message_id and direction='inbound' and enquiry_id is null for update;
  if not found then return false; end if;
  select * into e from public.delivery_enquiries where id=p_enquiry_id and account_id=m.account_id and phone=m.phone for update;
  if not found then raise exception 'enquiry_not_found'; end if;
  update public.delivery_messages set enquiry_id=e.id where id=m.id;
  update public.delivery_enquiries set epoch=epoch+1,updated_at=p_now where id=e.id;
  insert into public.delivery_jobs(account_id,enquiry_id,kind,payload,dedupe_key,due_at)
    values(e.account_id,e.id,'message',jsonb_build_object('body',m.body,'providerId',m.provider_id),'inbound:'||m.provider_id,p_now) on conflict do nothing;
  return true;
end $$;

create function public.delivery_busy(p_account_id uuid,p_enquiry_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('start',r.starts_at,'end',coalesce(j.payload->'slot'->>'end',r.ends_at::text))),'[]')
    from public.delivery_reservations r join public.delivery_jobs j on j.id=r.job_id
    join public.delivery_accounts a on a.id=p_account_id
    where r.resource_id=case when a.mode='demo' then 'demo:'||a.id::text else 'google:'||a.calendar_id end
    and r.enquiry_id<>p_enquiry_id and r.status<>'released';
$$;

-- PostgreSQL defaults functions to PUBLIC EXECUTE; revoke explicitly before granting worker access.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('delivery_intake','delivery_receive','delivery_command','delivery_claim','delivery_gate','delivery_finish','delivery_reserve','delivery_message_status','delivery_demo_account','delivery_demo_advance','delivery_snapshot','delivery_assign_reply','delivery_busy') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
