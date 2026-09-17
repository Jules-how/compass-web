import type { Assessment, Fit, PipelineCompany, PipelineList, PipelinePage, PipelineStage, StageResult } from './outbound-pipeline';
import { PIPELINE_VERSION } from './outbound-pipeline';
export type MarketLocation = { city: string | null; suburb: string | null; administrative_region: string | null; country_code: string | null };
export type MarketCompany = PipelineCompany & { locations: MarketLocation[]; services: string[]; contacted: boolean; linked_contact_history: boolean; fits: Record<string, Fit> };
export type MarketIndex = { records: MarketCompany[]; updated_at: string; complete: true; list_id: string; progress: Partial<Record<PipelineStage, number>>; total: number };
export type MarketScope = { profile: string; outcome: 'all' | 'matches' | 'unknown' | 'nonmatches'; service: string };
export const EMPTY_MARKET_SCOPE: MarketScope = { profile: '', outcome: 'all', service: '' };
export const MARKET_CITIES = ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide'];
const normal = (value: string | null | undefined) => (value || '').trim().toLocaleLowerCase();
export function currentAssessments(assessments: Pick<Assessment, 'id' | 'company_id' | 'workflow_version_id' | 'input_revision' | 'fit' | 'created_at'>[], revisions: Map<string, number>) {
  const latest = new Map<string, (typeof assessments)[number]>();
  for (const row of assessments) {
    if (row.input_revision !== revisions.get(row.company_id)) continue;
    const key = `${row.company_id}:${row.workflow_version_id}`;
    const existing = latest.get(key);
    if (!existing || row.created_at > existing.created_at || row.created_at === existing.created_at && row.id > existing.id) latest.set(key, row);
  }
  const byCompany = new Map<string, Record<string, Fit>>();
  for (const row of latest.values()) byCompany.set(row.company_id, { ...byCompany.get(row.company_id), [row.workflow_version_id]: row.fit });
  return byCompany;
}
export type ServiceFact = { id: string; company_id: string | null; fact_key: string; value: unknown; source_id: string | null; review_status: string; evidence_type: string; supersedes_ids: string[] };
/** Services are multi-label facts, never inferred from a company name or the campaign it was put in. */
export function recordedServices(facts: ServiceFact[]) {
  const superseded = new Set(facts.filter(fact => fact.review_status === 'reviewed' && ['published', 'operator_report'].includes(fact.evidence_type) && fact.source_id).flatMap(fact => fact.supersedes_ids || []));
  const grouped = new Map<string, ServiceFact[]>();
  for (const fact of facts) {
    if (!fact.company_id || !fact.source_id || superseded.has(fact.id) || fact.review_status !== 'reviewed' || !['published', 'operator_report'].includes(fact.evidence_type)) continue;
    const key = `${fact.company_id}:${fact.fact_key}`;
    grouped.set(key, [...(grouped.get(key) || []), fact]);
  }
  const result = new Map<string, Set<string>>();
  const names: Record<string, string> = { installs_air_conditioning: 'Air conditioning', installs_ducted: 'Ducted air conditioning', installs_multi_split: 'Multi-split systems', installs_single_split: 'Single-split systems' };
  for (const values of grouped.values()) {
    const first = values[0];
    const company = result.get(first.company_id!) || new Set<string>();
    if (first.fact_key in names) {
      if (values.every(value => value.value === true)) { company.add(names[first.fact_key]); company.add('Air conditioning'); }
    } else if (['services', 'business_types'].includes(first.fact_key)) {
      // Conflicting complete service lists are not reconciled by choosing whichever was returned last.
      const lists = values.map(value => Array.isArray(value.value) ? value.value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean) : []);
      for (const service of lists[0]) if (lists.every(list => list.some(value => normal(value) === normal(service)))) company.add(service);
    }
    result.set(first.company_id!, company);
  }
  return new Map([...result].map(([id, values]) => [id, [...values].sort()]));
}
export function filterMarketCompanies(records: MarketCompany[], filters: Record<string, string>, scope: MarketScope): MarketCompany[] {
  return records.filter(row => {
    const fit = scope.profile ? row.fits[scope.profile] || 'unknown' : row.fit;
    if (filters.q && !normal(row.name).includes(normal(filters.q))) return false;
    if (filters.country && normal(row.country) !== normal(filters.country)) return false;
    if (filters.fit && fit !== filters.fit) return false;
    if (scope.profile && scope.outcome === 'matches' && !['likely_fit', 'sure_fit'].includes(fit)) return false;
    if (scope.profile && scope.outcome === 'unknown' && fit !== 'unknown') return false;
    if (scope.profile && scope.outcome === 'nonmatches' && !['anti_icp', 'non_fit'].includes(fit)) return false;
    if (scope.service && !row.services.some(value => normal(value) === normal(scope.service))) return false;
    if (['city', 'suburb', 'administrative_region'].some(key => filters[key])) {
      if (!row.locations.some(location => ['city', 'suburb', 'administrative_region'].every(key => !filters[key] || normal(location[key as keyof MarketLocation]) === normal(filters[key])))) return false;
    }
    // The Companies step has no execution outcome; unsupported status filters must not broaden a view.
    if (filters.status && filters.status !== 'not_started') return false;
    return true;
  }).map(row => {
    const location = row.locations.find(value => (!filters.city || normal(value.city) === normal(filters.city)) && (!filters.suburb || normal(value.suburb) === normal(filters.suburb)) && (!filters.administrative_region || normal(value.administrative_region) === normal(filters.administrative_region))) || row.locations[0];
    return { ...row, ...(location || {}), fit: scope.profile ? row.fits[scope.profile] || 'unknown' : row.fit };
  });
}
export function marketSummary(records: MarketCompany[], profile = '') {
  const unique = [...new Map(records.map(record => [record.id, record])).values()];
  let assessed = 0, matches = 0, contacted = 0, linked = 0;
  for (const row of unique) {
    const fit = profile ? row.fits[profile] || 'unknown' : row.fit;
    if (fit !== 'unknown') assessed++;
    if (fit === 'likely_fit' || fit === 'sure_fit') matches++;
    if (row.contacted) contacted++;
    if (row.linked_contact_history) linked++;
  }
  return { total: unique.length, assessed, matches, unknown: unique.length - assessed, contacted, linked, matchRate: assessed ? Math.round(matches / assessed * 100) : null };
}
export function marketPage(records: MarketCompany[], after: string, limit = 100): PipelinePage<PipelineCompany> {
  const ordered = [...records].sort((a, b) => a.id.localeCompare(b.id));
  const remaining = after ? ordered.filter(row => row.id.localeCompare(after) > 0) : ordered;
  const page = remaining.slice(0, limit);
  return { schema_version: PIPELINE_VERSION, records: page, total_matching: ordered.length, next_after: remaining.length > limit ? page.at(-1)!.id : null };
}
export function completedCompanyStages(stages: StageResult[], list: PipelineList | null, revisions: Map<string, number>) {
  const latest = new Map<string, StageResult>();
  if (!list?.workflow_version_id) return {};
  for (const stage of stages) {
    if (stage.list_id !== list.id || stage.workflow_version_id !== list.workflow_version_id || stage.input_hash !== String(revisions.get(stage.company_id))) continue;
    const key = `${stage.company_id}:${stage.stage}:${stage.recipient_id || ''}`;
    const old = latest.get(key);
    if (!old || stage.created_at > old.created_at || stage.created_at === old.created_at && stage.id > old.id) latest.set(key, stage);
  }
  const result: Partial<Record<PipelineStage, number>> = {};
  for (const name of ['research', 'contacts', 'verify', 'write'] as PipelineStage[]) result[name] = new Set([...latest.values()].filter(stage => stage.stage === name && stage.status === 'completed').map(stage => stage.company_id)).size;
  return result;
}

/** Planned actions, future timestamps, inbound events and ambiguous identities are not outbound contact. */
export function contactedCompanyIds(links: {lead_id: string; company_id: string}[], touches: {contact_id: string; direction: string | null; outcome: string | null; contacted_at: string}[], now: number): Set<string> {
  const touched = new Set(touches.filter(row => row.direction === 'outbound' && row.outcome !== 'next_step' && Date.parse(row.contacted_at) <= now).map(row => row.contact_id));
  const companies = new Map<string, Set<string>>();
  for (const row of links) { const values = companies.get(row.lead_id) || new Set<string>(); values.add(row.company_id); companies.set(row.lead_id, values); }
  return new Set([...companies].filter(([lead, values]) => touched.has(lead) && values.size === 1).flatMap(([, values]) => [...values]));
}
