import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export const DEPT_ROOT = join(here, '..')

function firstExisting(candidates) {
  return candidates.find((file) => existsSync(file)) || candidates[0]
}

/** Next bundles import.meta.url with the build-machine path. Resolve traced assets
 * from the runtime root as well, so standalone/serverless deployments can find them. */
export function deliveryPaths(moduleDirectory, runtimeDirectory = process.cwd()) {
  const departmentRoot = join(moduleDirectory, '..')
  return {
    pipeline: firstExisting([
      join(departmentRoot, 'pipeline.json'),
      join(moduleDirectory, 'pipeline.json'),
      join(runtimeDirectory, 'src/lib/delivery-dept/pipeline.json'),
      join(runtimeDirectory, 'delivery-dept/pipeline.json'),
      join(runtimeDirectory, '../delivery-dept/pipeline.json')
    ]),
    demo: firstExisting([
      join(departmentRoot, 'data/demo-installs.json'),
      join(moduleDirectory, 'demo-installs.json'),
      join(runtimeDirectory, 'src/lib/delivery-dept/demo-installs.json'),
      join(runtimeDirectory, 'delivery-dept/data/demo-installs.json'),
      join(runtimeDirectory, '../delivery-dept/data/demo-installs.json')
    ])
  }
}

const paths = deliveryPaths(here)
export const PIPELINE_PATH = paths.pipeline
export const DEMO_PATH = paths.demo
