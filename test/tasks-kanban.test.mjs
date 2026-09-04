import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

test('tasks page is a four-lane kanban', () => {
  const panel = read('src/components/TasksPanel.tsx')
  const page = read('src/app/(console)/tasks/page.tsx')
  const board = read('src/components/ui/kanban-board.tsx')
  assert.match(panel, /KanbanBoard/)
  assert.match(panel, /not-started/)
  assert.match(panel, /in-progress/)
  assert.match(panel, /blocked/)
  assert.match(panel, /completed/)
  assert.match(page, /width="full"/)
  assert.match(board, /emptyText/)
  assert.doesNotMatch(panel, /TaskList/)
})
