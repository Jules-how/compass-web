import type { SupabaseClient } from '@supabase/supabase-js'
import { createDefaultSopPlan, normalizeSopPlan, type SopPlan } from './sop-template'

export const DELIVERY_SOP_TEMPLATE_SETTING_ID = 'delivery_sop_template'

function storedValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export async function loadSopTemplate(supabase: SupabaseClient): Promise<SopPlan> {
  const { data, error } = await supabase
    .from('compass_settings')
    .select('value')
    .eq('id', DELIVERY_SOP_TEMPLATE_SETTING_ID)
    .maybeSingle()

  if (error || !data) return createDefaultSopPlan()

  try {
    return normalizeSopPlan(storedValue(data.value))
  } catch {
    return createDefaultSopPlan()
  }
}

export async function saveSopTemplate(supabase: SupabaseClient, input: unknown): Promise<SopPlan> {
  const plan = normalizeSopPlan(input)
  const stamp = new Date().toISOString()
  const { error } = await supabase.from('compass_settings').upsert({
    id: DELIVERY_SOP_TEMPLATE_SETTING_ID,
    value: JSON.stringify(plan),
    is_secret: 0,
    scope: 'delivery',
    updated_at: stamp,
    mirrored_at: stamp
  })
  if (error) throw new Error(error.message)
  return plan
}
