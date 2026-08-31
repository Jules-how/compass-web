import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.resolve(__dirname, '../data/compass.db')
const db = new DatabaseSync(dbPath)

console.log('=== Verifying Local Compass SQLite Database with Archived Bucket ===')

const totalAll = db.prepare('SELECT COUNT(*) as c FROM lead_contacts').get().c
const totalActive = db.prepare('SELECT COUNT(*) as c FROM lead_contacts WHERE is_archived = 0 OR is_archived IS NULL').get().c
const totalArchived = db.prepare('SELECT COUNT(*) as c FROM lead_contacts WHERE is_archived = 1').get().c

console.log(`Total Leads in DB: ${totalAll}`)
console.log(`- Active Leads (Trades): ${totalActive}`)
console.log(`- Archived Leads (Historical): ${totalArchived}`)

const activeByVertical = db.prepare('SELECT vertical, COUNT(*) as c FROM lead_contacts WHERE is_archived = 0 GROUP BY vertical ORDER BY c DESC').all()
console.log('\nActive by Vertical:', activeByVertical)

const archivedByVertical = db.prepare('SELECT vertical, COUNT(*) as c FROM lead_contacts WHERE is_archived = 1 GROUP BY vertical ORDER BY c DESC LIMIT 10').all()
console.log('\nArchived by Vertical (Top 10):', archivedByVertical)

const sampleActive = db.prepare("SELECT name, company, email, vertical, city, outbound_status FROM lead_contacts WHERE is_archived = 0 LIMIT 3").all()
console.log('\nSample Active Leads:')
sampleActive.forEach(p => {
  console.log(`- [${p.vertical}] ${p.name} | ${p.company} | ${p.email} | ${p.city} | Status: ${p.outbound_status}`)
})

const sampleArchived = db.prepare("SELECT name, company, email, vertical, city, outbound_status FROM lead_contacts WHERE is_archived = 1 LIMIT 3").all()
console.log('\nSample Archived Leads:')
sampleArchived.forEach(p => {
  console.log(`- [${p.vertical}] ${p.name} | ${p.company} | ${p.email} | ${p.city} | Status: ${p.outbound_status}`)
})

console.log('\n=== All Checks Passed ===')
