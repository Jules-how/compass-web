#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs'
import { handleRpc, parseEnvFile, resolveConfig } from './lib.mjs'

const VAULT_ENV = '/Users/Jules/Switchflow-os-v3.5/.env.compass'
const COMPASS_WEB_ENV = '/Users/Jules/Projects/compass-web/.env.local'

function loadFileMap(path) {
  if (!existsSync(path)) return null
  try {
    return parseEnvFile(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

const cfg = resolveConfig(process.env, [loadFileMap(VAULT_ENV), loadFileMap(COMPASS_WEB_ENV)])
// Tools: brief, campaigns, leads.search, leads.commit, plus deprecated leads/mark, copy, land.
if (!cfg.secret) {
  console.error('compass-mcp: missing COMPASS_AGENT_SECRET (.env.compass or compass-web .env.local)')
  process.exit(1)
}

function writeMessage(obj) {
  const json = JSON.stringify(obj)
  const buf = Buffer.from(json, 'utf8')
  process.stdout.write(`Content-Length: ${buf.length}\r\n\r\n`)
  process.stdout.write(buf)
}

let buffer = Buffer.alloc(0)

function consume() {
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n')
    if (headerEnd === -1) return
    const header = buffer.subarray(0, headerEnd).toString('utf8')
    const match = /Content-Length:\s*(\d+)/i.exec(header)
    if (!match) {
      buffer = buffer.subarray(headerEnd + 4)
      continue
    }
    const len = Number(match[1])
    const start = headerEnd + 4
    if (buffer.length < start + len) return
    const body = buffer.subarray(start, start + len).toString('utf8')
    buffer = buffer.subarray(start + len)
    let msg
    try {
      msg = JSON.parse(body)
    } catch {
      continue
    }
    Promise.resolve(handleRpc(msg, { cfg, fetchImpl: fetch }))
      .then((res) => {
        if (res) writeMessage(res)
      })
      .catch((err) => {
        if (msg.id !== undefined && msg.id !== null) {
          writeMessage({
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32603, message: err instanceof Error ? err.message : 'internal' }
          })
        }
      })
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk])
  consume()
})
process.stdin.on('end', () => process.exit(0))
