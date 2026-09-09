-- Bring the older CRM-list branch into canonical, paginated lead search.
-- EXISTS preserves one row per lead even when a campaign attaches overlapping lists.
create or replace function public.compass_list_cohort_leads(p_list_ids text[])
returns setof public.lead_contacts language sql stable security invoker
set search_path = public as $$
  select lead.* from public.lead_contacts lead
  where exists (
    select 1 from public.compass_lead_list_members member
    where member.lead_id = lead.id::text and member.list_id = any(p_list_ids)
  );
$$;
revoke all on function public.compass_list_cohort_leads(text[]) from public, anon, authenticated;
grant execute on function public.compass_list_cohort_leads(text[]) to authenticated, service_role;

-- RLS does not govern TRUNCATE; remove inherited broad Supabase grants explicitly.
revoke all on public.compass_lead_lists, public.compass_lead_list_members, public.compass_campaign_lists from anon, authenticated;
grant select, insert, update, delete on public.compass_lead_lists, public.compass_lead_list_members, public.compass_campaign_lists to authenticated;
grant all on public.compass_lead_lists, public.compass_lead_list_members, public.compass_campaign_lists to service_role;

-- Replace attachments atomically, so a bad list reference cannot erase the old cohort.
create or replace function public.compass_replace_campaign_lists(p_campaign_id text, p_list_ids text[])
returns text[] language plpgsql security invoker set search_path = public as $$
declare result text[];
begin
  if not public.portal_is_operator() then raise exception 'operator_required'; end if;
  perform 1 from public.compass_pipeline_campaigns where id = p_campaign_id for update;
  if not found then raise exception 'campaign_not_found'; end if;
  select coalesce(array_agg(distinct btrim(value)), '{}'::text[]) into result
  from unnest(p_list_ids) value where btrim(value) <> '';
  delete from public.compass_campaign_lists where campaign_id = p_campaign_id;
  insert into public.compass_campaign_lists(campaign_id, list_id)
  select p_campaign_id, unnest(result);
  return result;
end;
$$;
revoke all on function public.compass_replace_campaign_lists(text,text[]) from public, anon, authenticated;
grant execute on function public.compass_replace_campaign_lists(text,text[]) to authenticated;
