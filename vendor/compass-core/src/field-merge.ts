export interface FieldMergeInput {
  currentValues: Record<string, unknown>
  fieldVersions: Record<string, number>
  baseVersion: number
  patch: Record<string, unknown>
}

export interface FieldMergeConflict {
  fieldName: string
  baseVersion: number
  currentVersion: number
  currentValue: unknown
  incomingValue: unknown
}

export interface FieldMergeResult {
  values: Record<string, unknown>
  appliedFields: string[]
  conflicts: FieldMergeConflict[]
}

function hasOwn(record: Record<string, unknown>, fieldName: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, fieldName)
}

function defineValue(record: Record<string, unknown>, fieldName: string, value: unknown): void {
  Object.defineProperty(record, fieldName, {
    value,
    enumerable: true,
    configurable: true,
    writable: true
  })
}

export function mergeFields({
  currentValues,
  fieldVersions,
  baseVersion,
  patch
}: FieldMergeInput): FieldMergeResult {
  const values = { ...currentValues }
  const appliedFields: string[] = []
  const conflicts: FieldMergeConflict[] = []

  for (const [fieldName, incomingValue] of Object.entries(patch)) {
    const currentVersion = hasOwn(fieldVersions, fieldName) ? fieldVersions[fieldName] : 0
    if (currentVersion <= baseVersion) {
      defineValue(values, fieldName, incomingValue)
      appliedFields.push(fieldName)
      continue
    }

    conflicts.push({
      fieldName,
      baseVersion,
      currentVersion,
      currentValue: hasOwn(currentValues, fieldName) ? currentValues[fieldName] : undefined,
      incomingValue
    })
  }

  return { values, appliedFields, conflicts }
}
