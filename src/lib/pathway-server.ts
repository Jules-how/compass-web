import type { SupabaseClient } from '@supabase/supabase-js'

import {
  DEFAULT_OPENER_TEMPLATES,
  DEFAULT_PATHWAY_STAGES,
  fillOpenerTemplate,
  mergeRecipeStages,
  normalizeStages,
  shouldRegenerateOpener,
  type OpenerSignalWhen,
  type PathwayStage
} from '@/lib/pathway'

export type PathwayRecipeRow = {
  id: string
  trade: string
  kind: 'default' | 'overlay'
  campaign_id: string | null
  stages: PathwayStage[]
  templates: PathwayTemplateRow[]
}

export type PathwayTemplateRow = {
  id: string
  recipeId: string
  label: string
  signalWhen: OpenerSignalWhen
  structure: string
  subject: string
  style: string | null
  sortOrder: number
  pendingStructure: string | null
  pendingSubject: string | null
}

function parseSignalWhen(raw: unknown): OpenerSignalWhen {
  if (!raw || typeof raw !== 'object') return { field: 'paid_demand', op: 'present' }
  const rec = raw as Record<string, unknown>
  const op = rec.op === 'eq' || rec.op === 'contains' ? rec.op : 'present'
  return {
    field: String(rec.field || 'paid_demand'),
    op,
    value: typeof rec.value === 'string' ? rec.value : undefined
  }
}

function mapTemplate(row: Record<string, unknown>): PathwayTemplateRow {
  return {
    id: String(row.id),
    recipeId: String(row.recipe_id),
    label: String(row.label || ''),
    signalWhen: parseSignalWhen(row.signal_when),
    structure: String(row.structure || ''),
    subject: String(row.subject || ''),
    style: row.style ? String(row.style) : null,
    sortOrder: Number(row.sort_order || 0),
    pendingStructure: row.pending_structure ? String(row.pending_structure) : null,
    pendingSubject: row.pending_subject ? String(row.pending_subject) : null
  }
}

export async function ensureDefaultRecipe(
  supabase: SupabaseClient,
  trade: string
): Promise<string> {
  const slug = trade.trim().toLowerCase() || 'hvac'
  const { data: existing } = await supabase
    .from('compass_pathway_recipes')
    .select('id')
    .eq('kind', 'default')
    .eq('trade', slug)
    .maybeSingle()
  if (existing?.id) {
    const { data: row } = await supabase
      .from('compass_pathway_recipes')
      .select('stages')
      .eq('id', existing.id)
      .maybeSingle()
    const ids = Array.isArray(row?.stages) ? row.stages.map((stage: { id?: string }) => String(stage?.id || '')) : []
    if (!ids.includes('site_extract')) {
      await supabase
        .from('compass_pathway_recipes')
        .update({ stages: DEFAULT_PATHWAY_STAGES, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    }
    return String(existing.id)
  }

  const id = `pathway-default-${slug}`
  const { error } = await supabase.from('compass_pathway_recipes').insert({
    id,
    trade: slug,
    kind: 'default',
    campaign_id: null,
    stages: DEFAULT_PATHWAY_STAGES,
    updated_at: new Date().toISOString()
  })
  if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message)

  const recipeId = existing?.id ? String(existing.id) : id
  const { count } = await supabase
    .from('compass_opener_templates')
    .select('id', { count: 'exact', head: true })
    .eq('recipe_id', recipeId)
  if ((count ?? 0) === 0) {
    const stamp = new Date().toISOString()
    const rows = DEFAULT_OPENER_TEMPLATES.map((draft, index) => ({
      id: `opener-${slug}-${draft.style || index}`,
      recipe_id: recipeId,
      label: draft.label,
      signal_when: draft.signalWhen,
      structure: draft.structure,
      subject: draft.subject,
      style: draft.style ?? null,
      sort_order: draft.sortOrder ?? index,
      created_at: stamp,
      updated_at: stamp
    }))
    const inserted = await supabase.from('compass_opener_templates').insert(rows)
    if (inserted.error && !/duplicate|unique/i.test(inserted.error.message)) {
      throw new Error(inserted.error.message)
    }
  }
  return recipeId
}

export async function loadRecipeBundle(
  supabase: SupabaseClient,
  input: { trade?: string | null; campaignId?: string | null }
): Promise<{ defaultRecipe: PathwayRecipeRow; overlay: PathwayRecipeRow | null; stages: PathwayStage[] }> {
  const trade = (input.trade || 'hvac').trim().toLowerCase() || 'hvac'
  const defaultQuery = supabase
    .from('compass_pathway_recipes')
    .select('id,trade,kind,campaign_id,stages')
    .eq('kind', 'default')
    .eq('trade', trade)
  const overlayQuery = input.campaignId
    ? supabase
        .from('compass_pathway_recipes')
        .select('id,trade,kind,campaign_id,stages')
        .eq('kind', 'overlay')
        .eq('campaign_id', input.campaignId)
    : null
  const [defaultRes, overlayRes] = await Promise.all([
    defaultQuery.maybeSingle(),
    overlayQuery ? overlayQuery.maybeSingle() : Promise.resolve({ data: null, error: null })
  ])
  if (defaultRes.error) throw new Error(defaultRes.error.message)
  if (overlayRes.error) throw new Error(overlayRes.error.message)
  const recipes = [defaultRes.data, overlayRes.data].filter(
    (row): row is NonNullable<typeof defaultRes.data> => Boolean(row)
  )

  const recipeIds = (recipes ?? []).map((row) => String(row.id))
  const { data: templates } = recipeIds.length
    ? await supabase
        .from('compass_opener_templates')
        .select(
          'id,recipe_id,label,signal_when,structure,subject,style,sort_order,pending_structure,pending_subject'
        )
        .in('recipe_id', recipeIds)
        .order('sort_order', { ascending: true })
    : { data: [] as Record<string, unknown>[] }

  const byRecipe = new Map<string, PathwayTemplateRow[]>()
  for (const row of templates ?? []) {
    const mapped = mapTemplate(row as Record<string, unknown>)
    const list = byRecipe.get(mapped.recipeId) ?? []
    list.push(mapped)
    byRecipe.set(mapped.recipeId, list)
  }

  const mappedRecipes: PathwayRecipeRow[] = (recipes ?? []).map((row) => ({
    id: String(row.id),
    trade: String(row.trade),
    kind: row.kind === 'overlay' ? 'overlay' : 'default',
    campaign_id: row.campaign_id ? String(row.campaign_id) : null,
    stages: normalizeStages(row.stages),
    templates: byRecipe.get(String(row.id)) ?? []
  }))

  const defaultRecipe =
    mappedRecipes.find((row) => row.kind === 'default') ??
    ({
      id: `pathway-default-${trade}`,
      trade,
      kind: 'default' as const,
      campaign_id: null,
      stages: DEFAULT_PATHWAY_STAGES,
      templates: []
    } satisfies PathwayRecipeRow)
  const overlay = mappedRecipes.find((row) => row.kind === 'overlay') ?? null
  return {
    defaultRecipe,
    overlay,
    stages: mergeRecipeStages(defaultRecipe.stages, overlay?.stages)
  }
}

export async function upsertOverlay(
  supabase: SupabaseClient,
  campaignId: string,
  trade: string,
  stages: unknown
): Promise<string> {
  const { data: existing } = await supabase
    .from('compass_pathway_recipes')
    .select('id')
    .eq('kind', 'overlay')
    .eq('campaign_id', campaignId)
    .maybeSingle()
  const id = existing?.id ? String(existing.id) : `pathway-overlay-${campaignId}`
  const row = {
    id,
    trade: trade.trim().toLowerCase() || 'hvac',
    kind: 'overlay',
    campaign_id: campaignId,
    stages: normalizeStages(stages),
    updated_at: new Date().toISOString()
  }
  const { error } = await supabase.from('compass_pathway_recipes').upsert(row)
  if (error) throw new Error(error.message)
  return id
}

export async function acceptTemplateProposal(
  supabase: SupabaseClient,
  templateId: string
): Promise<{ updated: number }> {
  const { data: template, error } = await supabase
    .from('compass_opener_templates')
    .select('id,structure,subject,pending_structure,pending_subject')
    .eq('id', templateId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!template) throw new Error('not_found')
  const structure = String(template.pending_structure || template.structure || '')
  const subject = String(template.pending_subject || template.subject || '')
  const stamp = new Date().toISOString()
  const saved = await supabase
    .from('compass_opener_templates')
    .update({
      structure,
      subject,
      pending_structure: null,
      pending_subject: null,
      updated_at: stamp
    })
    .eq('id', templateId)
  if (saved.error) throw new Error(saved.error.message)

  const { data: leads, error: leadErr } = await supabase
    .from('lead_contacts')
    .select('id,opener_override,name,company,city,opener')
    .eq('opener_template_id', templateId)
    .limit(5000)
  if (leadErr) throw new Error(leadErr.message)

  let updated = 0
  for (const lead of leads ?? []) {
    if (!shouldRegenerateOpener(lead)) continue
    const firstName = String(lead.name || '').trim().split(/\s+/)[0] || ''
    const opener = fillOpenerTemplate(structure, {
      firstName,
      company: lead.company,
      suburb: lead.city,
      specialty: null
    })
    const patch = await supabase.from('lead_contacts').update({ opener }).eq('id', lead.id)
    if (patch.error) throw new Error(patch.error.message)
    updated += 1
  }
  return { updated }
}
