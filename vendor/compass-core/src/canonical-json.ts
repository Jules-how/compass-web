function serialize(value: unknown, stack: Set<object>, arrayMember: boolean): string | undefined {
  if (value === null) return 'null'

  switch (typeof value) {
    case 'string':
      return JSON.stringify(value)
    case 'boolean':
      return value ? 'true' : 'false'
    case 'number':
      return Number.isFinite(value) ? JSON.stringify(value) : 'null'
    case 'undefined':
    case 'function':
    case 'symbol':
      return arrayMember ? 'null' : undefined
    case 'bigint':
      throw new TypeError('BigInt values are not JSON serializable')
  }

  if (stack.has(value)) throw new TypeError('Converting circular structure to JSON')
  stack.add(value)

  try {
    if (Array.isArray(value)) {
      const members: string[] = []
      for (let index = 0; index < value.length; index += 1) {
        members.push(serialize(value[index], stack, true) ?? 'null')
      }
      return `[${members.join(',')}]`
    }

    const toJson = (value as { toJSON?: () => unknown }).toJSON
    if (typeof toJson === 'function') {
      return serialize(toJson.call(value), stack, arrayMember)
    }

    const members: string[] = []
    for (const key of Object.keys(value).sort()) {
      const serialized = serialize((value as Record<string, unknown>)[key], stack, false)
      if (serialized !== undefined) members.push(`${JSON.stringify(key)}:${serialized}`)
    }
    return `{${members.join(',')}}`
  } finally {
    stack.delete(value)
  }
}

export function canonicalizeJson(value: unknown): string {
  const serialized = serialize(value, new Set(), false)
  if (serialized === undefined) throw new TypeError('Value is not JSON serializable')
  return serialized
}
