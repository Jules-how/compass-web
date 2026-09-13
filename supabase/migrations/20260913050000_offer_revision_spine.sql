-- Versioned offer/ICP lineage from market test through client delivery.
-- Historical links are backfilled only from frozen preparation evidence.
begin;

create table public.compass_offer_revisions (
  id text primary key,
  offer_id text not null references public.compass_outbound_offers(id) on delete restrict,
  version_no integer not null check (version_no > 0),
  version_label text not null,
  snapshot_scope text not null default 'full'
    check (snapshot_scope in ('full','preparation_context')),
  snapshot jsonb not null,
  content_hash text not null,
  change_reason text not null,
  source text not null default 'compass',
  supersedes_revision_id text references public.compass_offer_revisions(id) on delete restrict,
  created_by text not null default 'operator',
  created_at timestamptz not null default now(),
  unique (offer_id, version_no),
  unique (offer_id, content_hash)
);

alter table public.compass_outbound_offers
  add column if not exists active_revision_id text;

create or replace function public.compass_offer_snapshot(p_offer public.compass_outbound_offers)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'offer_key', p_offer.offer_key,
    'name', p_offer.name,
    'pack_summary', p_offer.pack_summary,
    'positioning_line', p_offer.positioning_line,
    'vertical_tags', to_jsonb(p_offer.vertical_tags),
    'location_tags', to_jsonb(p_offer.location_tags),
    'one_sentence', p_offer.one_sentence,
    'dream_outcome', p_offer.dream_outcome,
    'install_aud', p_offer.install_aud,
    'retainer_low_aud', p_offer.retainer_low_aud,
    'retainer_high_aud', p_offer.retainer_high_aud,
    'term_days', p_offer.term_days,
    'guarantee', p_offer.guarantee,
    'lock', p_offer.lock,
    'snapshot_scope', 'full'
  )
$$;

-- Frozen preparation contexts are the only safe source for historical revision
-- attribution. Their snapshot is intentionally partial and never promoted to active.
with frozen as (
  select
    o.id as offer_id,
    jsonb_build_object(
      'offer_key', p.bundle->'context'->'offer'->>'offer_key',
      'lock', p.bundle->'context'->'offer'->'lock',
      'snapshot_scope', 'preparation_context'
    ) as snapshot,
    min(p.created_at) as first_seen_at
  from public.compass_outbound_preparations p
  join public.compass_outbound_runs r on r.id = p.run_id
  join public.compass_pipeline_campaigns c on c.id = r.campaign_id
  join public.compass_outbound_offers o
    on o.offer_key = p.bundle->'context'->'offer'->>'offer_key'
  where p.bundle->'context'->'offer'->>'offer_key' is not null
    and p.bundle->'context'->'offer'->'lock' is not null
  group by o.id, p.bundle->'context'->'offer'
), numbered as (
  select
    offer_id,
    snapshot,
    first_seen_at,
    row_number() over (partition by offer_id order by first_seen_at, md5(snapshot::text))::integer as version_no
  from frozen
)
insert into public.compass_offer_revisions (
  id, offer_id, version_no, version_label, snapshot_scope, snapshot,
  content_hash, change_reason, source, created_by, created_at
)
select
  'offer-revision-' || md5(offer_id || ':' || snapshot::text),
  offer_id,
  version_no,
  'v' || version_no::text || ' (recovered)',
  'preparation_context',
  snapshot,
  md5(snapshot::text),
  'Recovered from an immutable outbound preparation. Unrecorded fields remain unknown.',
  'outbound-preparation-backfill',
  'migration',
  first_seen_at
from numbered
on conflict (offer_id, content_hash) do nothing;

-- The current full record becomes the active baseline after recovered history.
with current_rows as (
  select
    o.*,
    public.compass_offer_snapshot(o) as snapshot,
    coalesce((select max(r.version_no) from public.compass_offer_revisions r where r.offer_id=o.id),0)+1 as version_no,
    (select r.id from public.compass_offer_revisions r where r.offer_id=o.id order by r.version_no desc limit 1) as prior_id
  from public.compass_outbound_offers o
), inserted as (
  insert into public.compass_offer_revisions (
    id, offer_id, version_no, version_label, snapshot_scope, snapshot,
    content_hash, change_reason, source, supersedes_revision_id, created_by, created_at
  )
  select
    'offer-revision-' || md5(id || ':current:' || snapshot::text),
    id,
    version_no,
    'v' || version_no::text,
    'full',
    snapshot,
    md5(snapshot::text),
    'Baseline captured when immutable offer revisions were introduced.',
    'offer-revision-migration',
    prior_id,
    'migration',
    now()
  from current_rows
  on conflict (offer_id, content_hash) do update set content_hash=excluded.content_hash
  returning id, offer_id
)
update public.compass_outbound_offers o
set active_revision_id = i.id
from inserted i
where i.offer_id=o.id;

alter table public.compass_outbound_offers
  add constraint compass_outbound_offers_active_revision_fk
  foreign key (active_revision_id) references public.compass_offer_revisions(id) on delete restrict;

create table public.compass_market_tests (
  id text primary key,
  offer_revision_id text not null references public.compass_offer_revisions(id) on delete restrict,
  name text not null,
  hypothesis text not null,
  vertical text not null,
  geography text not null,
  channel text not null,
  status text not null default 'planned'
    check (status in ('planned','running','paused','won','lost','inconclusive','cancelled')),
  sample_size_target integer check (sample_size_target is null or sample_size_target > 0),
  budget_aud numeric check (budget_aud is null or budget_aud >= 0),
  stop_conditions jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  closed_at timestamptz,
  closeout jsonb,
  created_by text not null default 'operator',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.compass_lead_assessments (
  id text primary key,
  assessment_key text not null unique,
  lead_id text not null references public.lead_contacts(id) on delete cascade,
  offer_revision_id text not null references public.compass_offer_revisions(id) on delete restrict,
  market_test_id text references public.compass_market_tests(id) on delete set null,
  preparation_id text references public.compass_outbound_preparations(id) on delete set null,
  verdict text not null check (verdict in ('pass','hold','exclude')),
  reasons text[] not null default '{}',
  evidence jsonb not null default '[]'::jsonb,
  assessed_by text not null default 'preparation',
  assessed_at timestamptz not null default now()
);

create table public.compass_opportunities (
  id text primary key,
  lead_id text references public.lead_contacts(id) on delete set null,
  client_id text references public.compass_clients(id) on delete set null,
  offer_revision_id text not null references public.compass_offer_revisions(id) on delete restrict,
  market_test_id text references public.compass_market_tests(id) on delete set null,
  source_campaign_id text references public.compass_pipeline_campaigns(id) on delete set null,
  stage text not null default 'open'
    check (stage in ('open','qualified','proposal','verbal_yes','won','lost','paused')),
  value_aud numeric check (value_aud is null or value_aud >= 0),
  next_action text,
  next_action_at timestamptz,
  loss_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.compass_client_engagements (
  id text primary key,
  client_id text not null references public.compass_clients(id) on delete cascade,
  opportunity_id text references public.compass_opportunities(id) on delete set null,
  offer_revision_id text not null references public.compass_offer_revisions(id) on delete restrict,
  offer_key text not null,
  agreement_id text not null unique,
  agreement_document_hash text not null,
  accepted_terms jsonb not null,
  onboarding_snapshot jsonb,
  status text not null default 'signed'
    check (status in ('signed','paid','onboarding','active','paused','ended')),
  signed_at timestamptz not null,
  paid_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.compass_pipeline_campaigns
  add column if not exists offer_revision_id text references public.compass_offer_revisions(id) on delete restrict,
  add column if not exists market_test_id text references public.compass_market_tests(id) on delete set null;

alter table public.compass_outbound_runs
  add column if not exists offer_revision_id text references public.compass_offer_revisions(id) on delete restrict,
  add column if not exists market_test_id text references public.compass_market_tests(id) on delete set null;

alter table public.compass_outbound_preparations
  add column if not exists offer_revision_id text references public.compass_offer_revisions(id) on delete restrict,
  add column if not exists market_test_id text references public.compass_market_tests(id) on delete set null;

alter table public.compass_evidence_events
  add column if not exists offer_revision_id text references public.compass_offer_revisions(id) on delete set null,
  add column if not exists market_test_id text references public.compass_market_tests(id) on delete set null,
  add column if not exists opportunity_id text references public.compass_opportunities(id) on delete set null,
  add column if not exists engagement_id text references public.compass_client_engagements(id) on delete set null;

alter table public.compass_onboarding_forms
  add column if not exists offer_revision_id text references public.compass_offer_revisions(id) on delete restrict,
  add column if not exists engagement_id text references public.compass_client_engagements(id) on delete restrict,
  add column if not exists agreement_id text;

alter table public.compass_meta_attach
  add column if not exists offer_revision_id text references public.compass_offer_revisions(id) on delete restrict,
  add column if not exists engagement_id text references public.compass_client_engagements(id) on delete restrict,
  add column if not exists source_snapshot jsonb;

alter table public.compass_google_attach
  add column if not exists offer_revision_id text references public.compass_offer_revisions(id) on delete restrict,
  add column if not exists engagement_id text references public.compass_client_engagements(id) on delete restrict,
  add column if not exists source_snapshot jsonb;

alter table public.compass_client_offers
  add column if not exists offer_revision_id text references public.compass_offer_revisions(id) on delete set null,
  add column if not exists engagement_id text references public.compass_client_engagements(id) on delete set null;

alter table public.compass_client_ad_spend
  add column if not exists offer_revision_id text references public.compass_offer_revisions(id) on delete set null,
  add column if not exists engagement_id text references public.compass_client_engagements(id) on delete set null;

alter table public.delivery_accounts
  add column if not exists offer_revision_id text references public.compass_offer_revisions(id) on delete restrict,
  add column if not exists engagement_id text references public.compass_client_engagements(id) on delete restrict;

-- Attribute runs and campaigns only when frozen preparation evidence is exact and unanimous.
update public.compass_outbound_runs r
set offer_revision_id = rev.id
from public.compass_pipeline_campaigns c,
     public.compass_outbound_offers o,
     public.compass_offer_revisions rev
where c.id=r.campaign_id
  and o.offer_key=r.context->'offer'->>'offer_key'
  and rev.offer_id=o.id
  and rev.snapshot_scope='preparation_context'
  and rev.content_hash=md5(jsonb_build_object(
    'offer_key', r.context->'offer'->>'offer_key',
    'lock', r.context->'offer'->'lock',
    'snapshot_scope', 'preparation_context'
  )::text)
  and r.offer_revision_id is null;

update public.compass_outbound_preparations p
set offer_revision_id=r.offer_revision_id,
    market_test_id=r.market_test_id
from public.compass_outbound_runs r
where r.id=p.run_id
  and p.offer_revision_id is null
  and r.offer_revision_id is not null;

with attribution as (
  select
    c.id,
    count(r.id) as run_count,
    count(r.offer_revision_id) as attributed_count,
    count(distinct r.offer_revision_id) as revision_count,
    min(r.offer_revision_id) as revision_id
  from public.compass_pipeline_campaigns c
  join public.compass_outbound_runs r on r.campaign_id=c.id
  group by c.id
)
update public.compass_pipeline_campaigns c
set offer_revision_id=a.revision_id
from attribution a
where a.id=c.id
  and a.run_count=a.attributed_count
  and a.revision_count=1
  and c.offer_revision_id is null;

create index compass_offer_revisions_offer_idx
  on public.compass_offer_revisions(offer_id,version_no desc);
create index compass_market_tests_revision_idx
  on public.compass_market_tests(offer_revision_id,status,updated_at desc);
create index compass_lead_assessments_lead_idx
  on public.compass_lead_assessments(lead_id,assessed_at desc);
create index compass_lead_assessments_revision_idx
  on public.compass_lead_assessments(offer_revision_id,market_test_id,verdict);
create index compass_opportunities_revision_idx
  on public.compass_opportunities(offer_revision_id,stage,updated_at desc);
create index compass_client_engagements_client_idx
  on public.compass_client_engagements(client_id,updated_at desc);
create index compass_evidence_events_revision_idx
  on public.compass_evidence_events(offer_revision_id,ts desc)
  where offer_revision_id is not null;

comment on table public.compass_offer_revisions is
  'Immutable snapshots of an offer and its ICP. The offer row points to the one active full revision.';
comment on table public.compass_market_tests is
  'Bounded market/offer tests. Closing one records a decision; it never rewrites historical cohorts.';
comment on table public.compass_lead_assessments is
  'Revision-specific ICP decisions. lead_contacts.icp_status remains legacy global state only.';
comment on table public.compass_client_engagements is
  'Signed client scope pinned to the accepted agreement and exact offer revision.';
comment on column public.compass_pipeline_campaigns.offer_revision_id is
  'Exact offer/ICP revision used by this cohort. NULL means historical attribution is unknown.';
comment on column public.compass_onboarding_forms.engagement_id is
  'Required for new onboarding. Legacy NULL rows are preserved but fail closed on submission.';

create or replace function public.compass_offer_revision_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'offer_revision_immutable';
end
$$;

create trigger compass_offer_revision_no_update
before update or delete on public.compass_offer_revisions
for each row execute function public.compass_offer_revision_immutable();

create or replace function public.compass_offer_requires_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare pinned public.compass_offer_revisions;
begin
  if public.compass_offer_snapshot(new) is not distinct from public.compass_offer_snapshot(old) then
    return new;
  end if;
  if new.active_revision_id is null or new.active_revision_id is not distinct from old.active_revision_id then
    raise exception 'offer_revision_required';
  end if;
  select * into pinned
  from public.compass_offer_revisions
  where id=new.active_revision_id and offer_id=new.id and snapshot_scope='full';
  if not found or pinned.snapshot is distinct from public.compass_offer_snapshot(new) then
    raise exception 'offer_revision_snapshot_mismatch';
  end if;
  return new;
end
$$;

create trigger compass_offer_requires_revision
before update on public.compass_outbound_offers
for each row execute function public.compass_offer_requires_revision();

create or replace function public.compass_offer_after_insert_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare snap jsonb; rid text;
begin
  if new.active_revision_id is not null then return new; end if;
  snap := public.compass_offer_snapshot(new);
  rid := 'offer-revision-' || md5(new.id || ':1:' || snap::text);
  insert into public.compass_offer_revisions(
    id,offer_id,version_no,version_label,snapshot_scope,snapshot,content_hash,
    change_reason,source,created_by
  ) values (
    rid,new.id,1,'v1','full',snap,md5(snap::text),
    'Initial offer revision.','offer-create','operator'
  );
  update public.compass_outbound_offers set active_revision_id=rid where id=new.id;
  return new;
end
$$;

create trigger compass_offer_after_insert_revision
after insert on public.compass_outbound_offers
for each row execute function public.compass_offer_after_insert_revision();

create or replace function public.compass_revise_offer(
  p_offer_id text,
  p_patch jsonb,
  p_expected_active_revision_id text,
  p_change_reason text,
  p_created_by text default 'operator'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_row public.compass_outbound_offers;
  next_row public.compass_outbound_offers;
  snap jsonb;
  rid text;
  next_version integer;
  changed boolean;
begin
  if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'invalid_offer_patch'; end if;
  if exists (
    select 1 from jsonb_object_keys(p_patch) k
    where k not in (
      'offer_key','name','pack_summary','positioning_line','vertical_tags','location_tags',
      'one_sentence','dream_outcome','install_aud','retainer_low_aud','retainer_high_aud',
      'term_days','guarantee','lock','gtm_status','archived','sort_order','updated_at'
    )
  ) then raise exception 'unsupported_offer_patch'; end if;

  select * into old_row from public.compass_outbound_offers where id=p_offer_id for update;
  if not found then raise exception 'offer_not_found'; end if;
  if old_row.active_revision_id is distinct from p_expected_active_revision_id then
    raise exception 'offer_revision_conflict';
  end if;
  next_row := old_row;

  if p_patch ? 'offer_key' then next_row.offer_key := nullif(trim(p_patch->>'offer_key'),''); end if;
  if p_patch ? 'name' then next_row.name := nullif(trim(p_patch->>'name'),''); end if;
  if p_patch ? 'pack_summary' then next_row.pack_summary := nullif(trim(p_patch->>'pack_summary'),''); end if;
  if p_patch ? 'positioning_line' then next_row.positioning_line := nullif(trim(p_patch->>'positioning_line'),''); end if;
  if p_patch ? 'vertical_tags' then
    select coalesce(array_agg(value),'{}'::text[]) into next_row.vertical_tags from jsonb_array_elements_text(p_patch->'vertical_tags');
  end if;
  if p_patch ? 'location_tags' then
    select coalesce(array_agg(value),'{}'::text[]) into next_row.location_tags from jsonb_array_elements_text(p_patch->'location_tags');
  end if;
  if p_patch ? 'one_sentence' then next_row.one_sentence := nullif(trim(p_patch->>'one_sentence'),''); end if;
  if p_patch ? 'dream_outcome' then next_row.dream_outcome := nullif(trim(p_patch->>'dream_outcome'),''); end if;
  if p_patch ? 'install_aud' then next_row.install_aud := nullif(p_patch->>'install_aud','')::numeric; end if;
  if p_patch ? 'retainer_low_aud' then next_row.retainer_low_aud := nullif(p_patch->>'retainer_low_aud','')::numeric; end if;
  if p_patch ? 'retainer_high_aud' then next_row.retainer_high_aud := nullif(p_patch->>'retainer_high_aud','')::numeric; end if;
  if p_patch ? 'term_days' then next_row.term_days := nullif(p_patch->>'term_days','')::integer; end if;
  if p_patch ? 'guarantee' then next_row.guarantee := nullif(trim(p_patch->>'guarantee'),''); end if;
  if p_patch ? 'lock' then
    if jsonb_typeof(p_patch->'lock')<>'object' then raise exception 'invalid_offer_lock'; end if;
    next_row.lock := p_patch->'lock';
  end if;
  if p_patch ? 'gtm_status' then next_row.gtm_status := p_patch->>'gtm_status'; end if;
  if p_patch ? 'archived' then next_row.archived := (p_patch->>'archived')::boolean; end if;
  if p_patch ? 'sort_order' then next_row.sort_order := (p_patch->>'sort_order')::integer; end if;
  next_row.updated_at := coalesce((p_patch->>'updated_at')::timestamptz,now());

  changed := public.compass_offer_snapshot(next_row) is distinct from public.compass_offer_snapshot(old_row);
  if changed then
    if length(trim(coalesce(p_change_reason,'')))<4 then raise exception 'offer_revision_reason_required'; end if;
    select coalesce(max(version_no),0)+1 into next_version
      from public.compass_offer_revisions where offer_id=p_offer_id;
    snap := public.compass_offer_snapshot(next_row);
    rid := 'offer-revision-' || md5(p_offer_id || ':' || next_version::text || ':' || snap::text);
    insert into public.compass_offer_revisions(
      id,offer_id,version_no,version_label,snapshot_scope,snapshot,content_hash,
      change_reason,source,supersedes_revision_id,created_by
    ) values (
      rid,p_offer_id,next_version,'v'||next_version::text,'full',snap,md5(snap::text),
      trim(p_change_reason),'compass',old_row.active_revision_id,coalesce(nullif(trim(p_created_by),''),'operator')
    );
    next_row.active_revision_id := rid;
  end if;

  update public.compass_outbound_offers set
    offer_key=next_row.offer_key,
    name=next_row.name,
    pack_summary=next_row.pack_summary,
    positioning_line=next_row.positioning_line,
    vertical_tags=next_row.vertical_tags,
    location_tags=next_row.location_tags,
    one_sentence=next_row.one_sentence,
    dream_outcome=next_row.dream_outcome,
    install_aud=next_row.install_aud,
    retainer_low_aud=next_row.retainer_low_aud,
    retainer_high_aud=next_row.retainer_high_aud,
    term_days=next_row.term_days,
    guarantee=next_row.guarantee,
    lock=next_row.lock,
    gtm_status=next_row.gtm_status,
    archived=next_row.archived,
    sort_order=next_row.sort_order,
    active_revision_id=next_row.active_revision_id,
    updated_at=next_row.updated_at
  where id=p_offer_id
  returning * into next_row;
  return to_jsonb(next_row);
end
$$;

create or replace function public.compass_campaign_revision_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare oid text; active_id text; revision_offer text; test_revision text;
begin
  if new.offer_key is null then return new; end if;
  select id,active_revision_id into oid,active_id
    from public.compass_outbound_offers where offer_key=new.offer_key;
  if oid is null then raise exception 'campaign_offer_not_found'; end if;
  if tg_op='INSERT' and new.offer_revision_id is null then new.offer_revision_id:=active_id; end if;
  if tg_op='UPDATE' and new.offer_key is distinct from old.offer_key
    and (new.offer_revision_id is null or new.offer_revision_id is not distinct from old.offer_revision_id)
  then new.offer_revision_id:=active_id; end if;
  if new.offer_revision_id is null then return new; end if;
  select offer_id into revision_offer from public.compass_offer_revisions where id=new.offer_revision_id;
  if revision_offer is distinct from oid then raise exception 'campaign_offer_revision_mismatch'; end if;
  if new.market_test_id is not null then
    select offer_revision_id into test_revision from public.compass_market_tests where id=new.market_test_id;
    if test_revision is distinct from new.offer_revision_id then raise exception 'campaign_market_test_mismatch'; end if;
  end if;
  return new;
end
$$;

create trigger compass_campaign_revision_guard
before insert or update of offer_key,offer_revision_id,market_test_id
on public.compass_pipeline_campaigns
for each row execute function public.compass_campaign_revision_guard();

create or replace function public.compass_outbound_run_revision_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare campaign public.compass_pipeline_campaigns;
begin
  select * into campaign from public.compass_pipeline_campaigns where id=new.campaign_id;
  if not found then raise exception 'campaign_not_found'; end if;
  new.offer_revision_id := coalesce(new.offer_revision_id,campaign.offer_revision_id);
  new.market_test_id := coalesce(new.market_test_id,campaign.market_test_id);
  if new.offer_revision_id is null then raise exception 'campaign_offer_revision_required'; end if;
  if new.offer_revision_id is distinct from campaign.offer_revision_id
    or new.market_test_id is distinct from campaign.market_test_id
  then raise exception 'outbound_run_lineage_mismatch'; end if;
  return new;
end
$$;

create trigger compass_outbound_run_revision_guard
before insert on public.compass_outbound_runs
for each row execute function public.compass_outbound_run_revision_guard();

create or replace function public.compass_outbound_preparation_revision_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare run public.compass_outbound_runs;
begin
  select * into run from public.compass_outbound_runs where id=new.run_id;
  if not found then raise exception 'outbound_run_not_found'; end if;
  new.offer_revision_id := coalesce(new.offer_revision_id,run.offer_revision_id);
  new.market_test_id := coalesce(new.market_test_id,run.market_test_id);
  if new.offer_revision_id is null then raise exception 'outbound_run_revision_required'; end if;
  if new.offer_revision_id is distinct from run.offer_revision_id
    or new.market_test_id is distinct from run.market_test_id
  then raise exception 'outbound_preparation_lineage_mismatch'; end if;
  return new;
end
$$;

create trigger compass_outbound_preparation_revision_guard
before insert on public.compass_outbound_preparations
for each row execute function public.compass_outbound_preparation_revision_guard();

create or replace function public.compass_market_test_definition_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare revision_scope text;
begin
  select snapshot_scope into revision_scope
    from public.compass_offer_revisions where id=new.offer_revision_id;
  if revision_scope is distinct from 'full' then
    raise exception 'market_test_requires_full_offer_revision';
  end if;
  if tg_op='UPDATE' and
    (new.offer_revision_id,new.name,new.hypothesis,new.vertical,new.geography,new.channel,
     new.sample_size_target,new.budget_aud,new.stop_conditions,new.created_by,new.created_at)
    is distinct from
    (old.offer_revision_id,old.name,old.hypothesis,old.vertical,old.geography,old.channel,
     old.sample_size_target,old.budget_aud,old.stop_conditions,old.created_by,old.created_at)
  then raise exception 'market_test_definition_immutable'; end if;
  return new;
end
$$;

create trigger compass_market_test_definition_guard
before insert or update on public.compass_market_tests
for each row execute function public.compass_market_test_definition_guard();

create or replace function public.compass_opportunity_lineage_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare test_revision text; campaign_revision text; campaign_test text;
begin
  if new.market_test_id is not null then
    select offer_revision_id into test_revision
      from public.compass_market_tests where id=new.market_test_id;
    if test_revision is distinct from new.offer_revision_id then
      raise exception 'opportunity_market_test_mismatch';
    end if;
  end if;
  if new.source_campaign_id is not null then
    select offer_revision_id,market_test_id into campaign_revision,campaign_test
      from public.compass_pipeline_campaigns where id=new.source_campaign_id;
    if campaign_revision is null then raise exception 'source_campaign_revision_unknown'; end if;
    if campaign_revision is distinct from new.offer_revision_id
      or campaign_test is distinct from new.market_test_id
    then raise exception 'opportunity_campaign_lineage_mismatch'; end if;
  end if;
  return new;
end
$$;

create trigger compass_opportunity_lineage_guard
before insert or update of offer_revision_id,market_test_id,source_campaign_id
on public.compass_opportunities
for each row execute function public.compass_opportunity_lineage_guard();

create or replace function public.compass_engagement_lineage_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare revision_key text; opportunity_revision text;
begin
  select snapshot->>'offer_key' into revision_key
    from public.compass_offer_revisions where id=new.offer_revision_id;
  if revision_key is distinct from new.offer_key then
    raise exception 'engagement_offer_revision_mismatch';
  end if;
  if new.opportunity_id is not null then
    select offer_revision_id into opportunity_revision
      from public.compass_opportunities where id=new.opportunity_id;
    if opportunity_revision is distinct from new.offer_revision_id then
      raise exception 'engagement_opportunity_revision_mismatch';
    end if;
  end if;
  return new;
end
$$;

create trigger compass_engagement_lineage_guard
before insert or update of opportunity_id,offer_revision_id,offer_key
on public.compass_client_engagements
for each row execute function public.compass_engagement_lineage_guard();

create or replace function public.compass_delivery_artifact_lineage_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare engagement_revision text; engagement_client text;
begin
  if new.engagement_id is null and new.offer_revision_id is null then return new; end if;
  if new.engagement_id is null or new.offer_revision_id is null then
    raise exception 'delivery_artifact_lineage_incomplete';
  end if;
  select offer_revision_id,client_id into engagement_revision,engagement_client
    from public.compass_client_engagements where id=new.engagement_id;
  if engagement_revision is distinct from new.offer_revision_id
    or engagement_client is distinct from new.client_id
  then raise exception 'delivery_artifact_lineage_mismatch'; end if;
  return new;
end
$$;

create trigger compass_onboarding_lineage_guard
before insert or update
on public.compass_onboarding_forms
for each row execute function public.compass_delivery_artifact_lineage_guard();

create trigger compass_meta_attach_lineage_guard
before insert or update
on public.compass_meta_attach
for each row execute function public.compass_delivery_artifact_lineage_guard();

create trigger compass_google_attach_lineage_guard
before insert or update
on public.compass_google_attach
for each row execute function public.compass_delivery_artifact_lineage_guard();

create or replace function public.compass_engagement_accepted_terms_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.client_id,new.offer_revision_id,new.offer_key,new.agreement_id,new.agreement_document_hash,new.accepted_terms,new.signed_at)
    is distinct from
    (old.client_id,old.offer_revision_id,old.offer_key,old.agreement_id,old.agreement_document_hash,old.accepted_terms,old.signed_at)
  then raise exception 'engagement_accepted_terms_immutable'; end if;
  return new;
end
$$;

create trigger compass_engagement_accepted_terms_immutable
before update on public.compass_client_engagements
for each row execute function public.compass_engagement_accepted_terms_immutable();

do $$ declare tab text; begin
  foreach tab in array array[
    'compass_offer_revisions','compass_market_tests','compass_lead_assessments',
    'compass_opportunities','compass_client_engagements'
  ] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('alter table public.%I force row level security',tab);
    execute format('revoke all on public.%I from public,anon,authenticated',tab);
    execute format('create policy operator_all on public.%I for all to authenticated using (public.portal_is_operator()) with check (public.portal_is_operator())',tab);
    execute format('grant select,insert,update,delete on public.%I to authenticated',tab);
    execute format('grant all on public.%I to service_role',tab);
  end loop;
end $$;

revoke all on function public.compass_revise_offer(text,jsonb,text,text,text) from public,anon;
grant execute on function public.compass_revise_offer(text,jsonb,text,text,text) to authenticated,service_role;

-- Preparation checks now read the campaign's pinned revision. A later active
-- offer edit does not rewrite or stale a campaign that intentionally remains on
-- its earlier revision.
create or replace function public.outbound_check_preparation(
  p_id text,
  p_allow_loaded boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  p compass_outbound_preparations;
  r compass_outbound_runs;
  rec jsonb;
  l public.lead_contacts;
  c compass_pipeline_campaigns;
  o compass_outbound_offers;
  rev compass_offer_revisions;
  cfg compass_outbound_configs;
  current_policy boolean;
  reviewed_uncontacted boolean;
  expected_offer jsonb;
begin
  select * into p from compass_outbound_preparations where id=p_id;
  if not found then raise exception 'preparation_not_found'; end if;
  select * into r from compass_outbound_runs where id=p.run_id for update;
  select * into c from compass_pipeline_campaigns where id=r.campaign_id for update;
  select * into o from compass_outbound_offers where offer_key=c.offer_key for share;
  select * into rev from compass_offer_revisions where id=c.offer_revision_id for share;
  select * into cfg from compass_outbound_configs where campaign_id=c.id for share;
  expected_offer := jsonb_build_object(
    'offer_key',rev.snapshot->>'offer_key',
    'lock',rev.snapshot->'lock',
    'gtm_status',o.gtm_status,
    'archived',o.archived,
    'revision_id',rev.id,
    'version_no',rev.version_no,
    'content_hash',rev.content_hash
  );
  if c.offer_revision_id is null
    or rev.id is null
    or p.offer_revision_id is distinct from c.offer_revision_id
    or r.offer_revision_id is distinct from c.offer_revision_id
    or p.market_test_id is distinct from c.market_test_id
    or r.market_test_id is distinct from c.market_test_id
    or p.bundle->'context'->>'offer_revision_id' is distinct from c.offer_revision_id
    or nullif(p.bundle->'context'->>'market_test_id','') is distinct from c.market_test_id
    or c.sequence_draft is distinct from p.bundle->'context'->'sequence'
    or to_jsonb(c.vertical_tags) is distinct from jsonb_build_array(p.bundle->'context'->>'vertical')
    or to_jsonb(c.location_tags) is distinct from jsonb_build_array(p.bundle->'context'->>'city')
    or cfg.recipe is distinct from p.bundle->'context'->'recipe'
    or cfg.settings is distinct from p.bundle->'context'->'settings'
    or expected_offer is distinct from p.bundle->'context'->'offer'
    or c.status in ('cancelled','completed','archived')
  then raise exception 'preparation_stale'; end if;
  if r.status<>'ready' or r.candidates_hash<>p.input_hash or r.context_hash<>p.context_hash then
    raise exception 'preparation_stale';
  end if;
  if exists(
    select 1 from compass_outbound_loads ld
    where ld.preparation_id=p_id and ld.instantly_campaign_id is distinct from c.instantly_campaign_id
  ) then raise exception 'load_binding_conflict'; end if;
  if (p.bundle->'counts'->>'pass')::int<1 then raise exception 'no_eligible_recipients'; end if;
  current_policy := coalesce(p.bundle->'context'->'recipe'->>'mode','template')='evidence_draft';
  for rec in
    select value from jsonb_array_elements(p.bundle->'records')
    where value->>'status'='pass' order by value->'candidate'->>'lead_id'
  loop
    select * into l from lead_contacts where id=rec->'candidate'->>'lead_id' for update;
    if not found
      or lower(l.email) is distinct from lower(rec->'candidate'->>'email')
      or lower(l.company) is distinct from lower(rec->'candidate'->>'company')
      or l.is_archived or l.recontact_ok=0 or coalesce(l.suppression_reason,'')<>'' or l.icp_status='skip'
    then raise exception 'lead_eligibility_changed'; end if;
    reviewed_uncontacted := current_policy
      and rec->'candidate'->'outreach_review'->>'status'='uncontacted'
      and length(coalesce(rec->'candidate'->'outreach_review'->>'source',''))>0
      and (rec->'candidate'->'outreach_review'->>'checked_at')::timestamptz
        between now()-interval '1 day' and now()+interval '1 minute';
    if l.outbound_status is distinct from 'uncontacted'
      and not (coalesce(reviewed_uncontacted,false) and l.outbound_status in ('in_instantly','ready','none'))
      and not (p_allow_loaded and l.outbound_status='in_instantly' and exists(
        select 1 from compass_outbound_loads ld
        where ld.preparation_id=p_id and ld.instantly_campaign_id=l.instantly_campaign_id
      ))
    then raise exception 'outreach_state_changed'; end if;
    if not coalesce(reviewed_uncontacted,false)
      and l.pipeline_campaign_id is not null and l.pipeline_campaign_id<>r.campaign_id
    then raise exception 'cohort_changed'; end if;
    if exists(
      select 1 from lead_contacts other where other.id<>l.id and (
        lower(other.email)=lower(l.email)
        or (not current_policy and coalesce(l.company_domain,'')<>'' and lower(other.company_domain)=lower(l.company_domain))
      )
    ) then raise exception 'company_overlap_requires_review'; end if;
  end loop;
  return p.bundle;
end
$$;

commit;
