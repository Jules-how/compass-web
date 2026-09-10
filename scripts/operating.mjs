#!/usr/bin/env node
// Read the queue or submit a JSON command file. Credentials remain local.
import {readFileSync} from 'node:fs'
import {dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {parseEnvFile,resolveConfig} from '../mcp/lib.mjs'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const config=resolveConfig(process.env,[parseEnvFile(readFileSync(resolve(root,'.env.local'),'utf8'))])
if(!config.secret)throw new Error('Compass agent connection missing')
const file=process.argv[2]
const response=await fetch(`${config.baseUrl||config.base}/api/agent/operating`,{method:file?'POST':'GET',headers:{Authorization:`Bearer ${config.secret}`,'Content-Type':'application/json'},...(file?{body:readFileSync(resolve(file),'utf8')}:{})})
const body=await response.json();if(!response.ok){console.error(JSON.stringify(body));process.exit(1)}
process.stdout.write(JSON.stringify(body,null,2)+'\n')
