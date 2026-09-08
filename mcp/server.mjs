#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleRpc, parseEnvFile, resolveConfig } from './lib.mjs'

const MCP_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_COMPASS_ENV = join(MCP_DIR, '../.env.local')

function loadFileMap(path) {
  if (!existsSync(path)) return null
  try {
    return parseEnvFile(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

const cfg = resolveConfig(process.env, [loadFileMap(REPO_COMPASS_ENV)])
if (!cfg.secret) {
  console.error(
    'compass-mcp: missing COMPASS_AGENT_SECRET (process env or compass-web/.env.local)'
  )
  process.exit(1)
}

function writeMessage(obj, framed) {
  const json = JSON.stringify(obj)
  if (framed) {
    process.stdout.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`)
  } else {
    process.stdout.write(`${json}\n`)
  }
}

let buffer = Buffer.alloc(0)

function consume() {
  while (true) {
    if (!buffer.length) return
    // MCP stdio uses newline-delimited JSON. Retain the previous custom
    // Content-Length transport for clients that already use this bridge.
    const framed = buffer[0] === 67 || buffer[0] === 99
    let body
    if (framed) {
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
      body = buffer.subarray(start, start + len).toString('utf8')
      buffer = buffer.subarray(start + len)
    } else {
      const end = buffer.indexOf('\n')
      if (end === -1) return
      body = buffer.subarray(0, end).toString('utf8')
      buffer = buffer.subarray(end + 1)
    }
    let msg
    try {
      msg = JSON.parse(body)
    } catch {
      continue
    }
    Promise.resolve(handleRpc(msg, { cfg, fetchImpl: fetch }))
      .then((res) => {
        if (res) writeMessage(res, framed)
      })
      .catch((err) => {
        if (msg.id !== undefined && msg.id !== null) {
          writeMessage({
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32603, message: err instanceof Error ? err.message : 'internal' }
          }, framed)
        }
      })
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk])
  consume()
})
// Let pending RPC responses drain naturally when the client closes stdin.
