import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Assessment, PipelineList, StageResult } from './outbound-pipeline';
import { requirePipeline, pipelineDatabaseError } from './outbound-pipeline-server';
import { contactedCompanyIds, completedCompanyStages, currentAssessments, recordedServices, type MarketCompany, type MarketIndex, type MarketLocation, type ServiceFact } from './outbound-market';

type Row = Record<string, unknown>;
/** Paginate explicitly: a PostgREST row cap must never become an apparently complete count. */
async function collect(db: SupabaseClient, table: string, columns: string, scope?: [string, string | boolean], key = 'id'): Promise<Row[]> {
  const rows: Row[] = [];
  let after: string | null = null;
  for (let page = 0; page < 40; page++) {
    let query = db.from(table).select(columns).order(key).limit(1000);
    if (scope) query = query.eq(scope[0], scope[1]);
    if (after !== null) query = query.gt(key, after);
    const result = await query;
    pipelineDatabaseError(result.error);
    const values = (result.data || []) as unknown as Row[];
    if (!values.length) return rows;
    rows.push(...values);
    const cursor = String(values.at(-1)?.[key]);
    if (cursor === after) throw new Error('Market data pagination did not advance. No totals have been estimated.');
    after = cursor;
    // A short page may be a server row cap; continue until an empty page proves completeness.
  }
  throw new Error('Market index exceeds its bounded read limit. No partial totals are shown. Narrow the dataset before retrying.');
}
export async function readMarketIndex(db: SupabaseClient, listId: string): Promise<MarketIndex> {
  requirePipeline();
  if (listId && !/^[a-zA-Z0-9_:.-]{1,160}$/.test(listId)) throw new Error('pipeline_invalid_list_id');
  const [companies, locations, inputs, assessments, observations, links, touches, membership, listResult, stages] = await Promise.all([
    collect(db, 'crm_companies', 'id,name,country,website,revision', ['is_archived', false]),
    collect(db, 'crm_company_locations', 'id,company_id,city,suburb,administrative_region,country_code,status'),
    collect(db, 'outbound_pipeline_input_revisions', 'company_id,evidence_revision', undefined, 'company_id'),
    collect(db, 'outbound_pipeline_assessments', 'id,company_id,workflow_version_id,input_revision,fit,created_at'),
    collect(db, 'crm_research_observations', 'id,company_id,fact_key,value,source_id,review_status,evidence_type,supersedes_ids'),
    collect(db, 'crm_lead_links', 'id,lead_id,company_id', ['match_state', 'confirmed']),
    collect(db, 'lead_outreach_touches', 'id,contact_id,contacted_at,direction,outcome'),
    listId ? collect(db, 'outbound_pipeline_memberships', 'id,company_id,active', ['list_id', listId]) : Promise.resolve([]),
    listId ? db.from('compass_lead_lists').select('*').eq('id', listId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    listId ? collect(db, 'outbound_pipeline_stages', 'id,company_id,list_id,recipient_id,workflow_version_id,stage,status,input_hash,created_at', ['list_id', listId]) : Promise.resolve([]),
  ]);
  pipelineDatabaseError(listResult.error);
  if (listId && !listResult.data) throw new Error('pipeline_list_not_found');
  const list = listResult.data as PipelineList | null;
  const members = new Map(membership.filter(row => row.active).map(row => [String(row.company_id), String(row.id)]));
  const scoped = listId ? companies.filter(row => members.has(String(row.id))) : companies;
  const inputMap = new Map(inputs.map(row => [String(row.company_id), Number(row.evidence_revision)]));
  const revisions = new Map(scoped.map(row => [String(row.id), Number(row.revision) + (inputMap.get(String(row.id)) || 0)]));
  const fits = currentAssessments(assessments as unknown as Assessment[], revisions);
  const services = recordedServices(observations as unknown as ServiceFact[]);
  const locationMap = new Map<string, MarketLocation[]>();
  for (const row of locations) if (row.status !== 'closed') {
    const id = String(row.company_id);
    locationMap.set(id, [...(locationMap.get(id) || []), row as unknown as MarketLocation]);
  }
  const linked = new Set(links.map(row => String(row.company_id)));
  const contacted = contactedCompanyIds(links as unknown as Parameters<typeof contactedCompanyIds>[0], touches as unknown as Parameters<typeof contactedCompanyIds>[1], Date.now());
  const records: MarketCompany[] = scoped.map(row => {
    const id = String(row.id), companyLocations = locationMap.get(id) || [], location = companyLocations[0];
    return { id, name: String(row.name), country: String(row.country), website: row.website as string | null, revision: Number(row.revision), input_revision: revisions.get(id)!, list_id: listId || null, membership_id: members.get(id) || null, fit: list?.workflow_version_id ? fits.get(id)?.[list.workflow_version_id] || 'unknown' : 'unknown', eligibility_override: false, stage: null, stage_status: null, reason: 'Not started', city: location?.city || null, suburb: location?.suburb || null, administrative_region: location?.administrative_region || null, timezone: null, locations: companyLocations, services: services.get(id) || [], fits: fits.get(id) || {}, contacted: contacted.has(id), linked_contact_history: linked.has(id) };
  });
  return { records, complete: true, updated_at: new Date().toISOString(), list_id: listId, total: records.length, progress: completedCompanyStages(stages as unknown as StageResult[], list, revisions) };
}
