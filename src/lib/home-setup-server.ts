import type { SupabaseClient } from '@supabase/supabase-js'

import {
  composeDailySetupNotes,
  DAILY_SETUP_TASK_SOURCE,
  dailySetupNoteMarker,
  notesHaveDailySetupMarker,
  type HomeJulesLedItem
} from '@/lib/home-setup'

const WRITE_BOUND = 20

export async function upsertDailySetupTasks(
  admin: SupabaseClient,
  day: string,
  items: HomeJulesLedItem[]
): Promise<Array<{ id: string; title: string }>> {
  const incoming = items.slice(0, WRITE_BOUND)
  if (incoming.length === 0) return []

  const { data: existingRows, error: existingError } = await admin
    .from('compass_tasks')
    .select('id,title,notes,status')
    .eq('source', DAILY_SETUP_TASK_SOURCE)
    .like('notes', `daily_setup:${day}:%`)
  if (existingError) throw new Error(existingError.message)

  const existing = existingRows ?? []
  const created: Array<{ id: string; title: string }> = []
  const stamp = new Date().toISOString()

  for (const item of incoming) {
    const marker = dailySetupNoteMarker(day, item.title)
    const match = existing.find((row) => notesHaveDailySetupMarker(row.notes, marker))
    const notes = composeDailySetupNotes(day, item.title, item.detail)
    if (match) {
      if (match.status === 'completed' || match.status === 'cancelled') {
        created.push({ id: match.id, title: item.title })
        continue
      }
      const { error } = await admin
        .from('compass_tasks')
        .update({
          title: item.title,
          notes,
          task_type: item.taskType ?? null,
          updated_at: stamp
        })
        .eq('id', match.id)
      if (error) throw new Error(error.message)
      created.push({ id: match.id, title: item.title })
      continue
    }

    const id = `task-${crypto.randomUUID()}`
    const { error } = await admin.from('compass_tasks').insert({
      id,
      title: item.title,
      status: 'not-started',
      priority: 2,
      due: day,
      source: DAILY_SETUP_TASK_SOURCE,
      notes,
      task_type: item.taskType ?? 'THINK',
      created_at: stamp,
      updated_at: stamp,
      mirrored_at: stamp
    })
    if (error) throw new Error(error.message)
    created.push({ id, title: item.title })
  }

  return created
}
