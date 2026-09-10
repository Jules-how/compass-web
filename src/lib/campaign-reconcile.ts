import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildCampaignInsert } from '@/lib/campaigns-server'
import { instantlyFetch, resolveInstantlyApiKey } from '@/lib/instantly'

export const campaignReconcileInput = z.object({
  provider_id: z.string().uuid(),
  offer_key: z.string().trim().min(1).max(100),
  vertical_tags: z.array(z.string().trim().min(1).max(80)).min(1).max(10),
  location_tags: z.array(z.string().trim().min(1).max(80)).min(1).max(10),
  source: z.string().trim().min(8).max(2000),
}).strict()

export function resolveCampaignIdentity(existing: Array<{id:string;offer_key:string|null}>, providerId:string, offerKey:string) {
  if(existing.length>1) throw new Error('campaign_binding_conflict')
  if(existing[0] && existing[0].offer_key!==offerKey) throw new Error('campaign_offer_conflict')
  return {id:existing[0]?.id || `campaign-instantly-${providerId}`,existing:Boolean(existing[0])}
}

/** Register an observed provider campaign. Never create, change or activate anything in Instantly. */
export async function reconcileProviderCampaign(db:SupabaseClient, raw:unknown) {
  const p=campaignReconcileInput.parse(raw)
  const [offer,bound]=await Promise.all([
    db.from('compass_outbound_offers').select('offer_key').eq('offer_key',p.offer_key).maybeSingle(),
    db.from('compass_pipeline_campaigns').select('id,offer_key').eq('instantly_campaign_id',p.provider_id).limit(2),
  ])
  if(offer.error || bound.error) throw new Error('campaign_read_failed')
  if(!offer.data) throw new Error('offer_not_found')
  const identity=resolveCampaignIdentity(bound.data||[],p.provider_id,p.offer_key)
  const key=await resolveInstantlyApiKey(db)
  if(!key) throw new Error('Instantly connection is missing')
  const provider=await instantlyFetch<{id:string;name:string;status:number}>(`/campaigns/${encodeURIComponent(p.provider_id)}`,key,{signal:AbortSignal.timeout(15000)})
  if(provider.id!==p.provider_id || !provider.name) throw new Error('provider_identity_mismatch')
  if(!identity.existing) {
    const row=buildCampaignInsert({id:identity.id,name:provider.name,offer_key:p.offer_key,instantly_campaign_id:p.provider_id,vertical_tags:p.vertical_tags,location_tags:p.location_tags,status:'planned',wave_lane:'later',summary:`Provider campaign reconciled from ${p.source}. Read current provider evidence for execution status; no launch or copy change is performed by reconciliation.`})
    // Deterministic identity and insert-only conflict handling make retries/concurrent runs safe.
    const saved=await db.from('compass_pipeline_campaigns').upsert(row,{onConflict:'id',ignoreDuplicates:true})
    if(saved.error) throw new Error(saved.error.message)
  }
  const check=await db.from('compass_pipeline_campaigns').select('id,name,offer_key,instantly_campaign_id').eq('id',identity.id).single()
  if(check.error || check.data.instantly_campaign_id!==p.provider_id || check.data.offer_key!==p.offer_key) throw new Error('campaign_binding_conflict')
  return {campaign:check.data,provider:{id:provider.id,name:provider.name,status:provider.status},reused:identity.existing,checked_at:new Date().toISOString()}
}
