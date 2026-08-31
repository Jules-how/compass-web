import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export const DEPT_ROOT = join(here, '..')

function firstExisting(candidates) {
  return candidates.find((file) => existsSync(file)) || candidates[0]
}

export const PIPELINE_PATH = firstExisting([
  join(DEPT_ROOT, 'pipeline.json'),
  join(here, 'pipeline.json'),
  join(process.cwd(), 'delivery-dept/pipeline.json'),
  join(process.cwd(), '../delivery-dept/pipeline.json')
])

export const DEMO_PATH = firstExisting([
  join(DEPT_ROOT, 'data/demo-installs.json'),
  join(here, 'demo-installs.json'),
  join(process.cwd(), 'delivery-dept/data/demo-installs.json'),
  join(process.cwd(), '../delivery-dept/data/demo-installs.json')
])
