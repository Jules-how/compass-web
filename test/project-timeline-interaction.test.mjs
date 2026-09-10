import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../src/lib/project-timeline-interaction.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } })
const { projectTimelineX, projectTimelineLabelWidth, projectTimelineTodayScroll } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)

test('date selection follows the scrolled time grid rather than double-counting scroll', () => {
  // At 600px scroll, a point 120px into the visible grid is date-grid x=720.
  assert.equal(projectTimelineX(700, 260, 600, 320), 720)
  // Scrolling the grid another 200px exposes a date 200px further ahead.
  assert.equal(projectTimelineX(700, 260, 800, 320), 920)
  // Moving the entire app on screen does not change the selected date.
  assert.equal(projectTimelineX(1040, 600, 600, 320), 720)
})

test('pinned label widths leave a usable grid on mobile and desktop', () => {
  assert.equal(projectTimelineLabelWidth(350), 200)
  assert.equal(projectTimelineLabelWidth(639), 200)
  assert.equal(projectTimelineLabelWidth(640), 320)
  assert.equal(projectTimelineLabelWidth(1120), 320)
  assert.equal(projectTimelineX(265, 20, 500, projectTimelineLabelWidth(350)), 545)
})

test('Today is positioned in the visible time area after the pinned labels', () => {
  assert.equal(projectTimelineTodayScroll(900, 1120, 320), 620)
  assert.equal(projectTimelineTodayScroll(900, 360, 200), 844)
  assert.equal(projectTimelineTodayScroll(0, 1120, 320), 0)
})
