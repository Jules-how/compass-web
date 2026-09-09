import { requirePortalAccess } from '@/lib/portal-access'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson, requireSameOrigin } from '@/lib/portal-http'
import { demoConfig, isOptOut } from '@/lib/delivery-engine/config'
import { boundedJson, DeliveryHttpError, operatorCommandSchema } from '@/lib/delivery-engine/http'
import { deliveryAccount, deliveryError, serverStore } from '@/lib/delivery-engine/server'
import { createDeliveryProviders } from '@/lib/delivery-engine/providers'
import { runDeliveryWorker } from '@/lib/delivery-engine/worker'
import { nextContactTime, validateOutcome } from '@/lib/delivery-engine/rules'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  try {
    await requirePortalAccess({ operator: true })
    const query = new URL(request.url).searchParams
    const accountId = z.string().uuid().optional().parse(query.get('account') ?? undefined)
    const enquiryId = z.string().uuid().optional().parse(query.get('enquiry') ?? undefined)
    return portalJson(await serverStore().snapshot(accountId, enquiryId))
  } catch (error) { return deliveryError(error) }
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  try {
    const access = await requirePortalAccess({ operator: true })
    const command = operatorCommandSchema.parse(await boundedJson(request))
    const store = serverStore()
    let accountId: string
    let selectedEnquiry: string | undefined
    if (command.type === 'demo.start') {
      accountId = await store.rpc<string>('delivery_demo_account', { p_config: demoConfig })
      const demoNow = nextContactTime(new Date().toISOString(), demoConfig.timezone, demoConfig.quietHours)
      const { error } = await getPortalAdminClient().from('delivery_accounts').update({ demo_now: demoNow }).eq('id', accountId).eq('mode', 'demo').is('demo_now', null)
      if (error) throw error
      const account = await deliveryAccount(accountId)
      const now = account.demo_now!
      const complete = command.scenario === 'qualified' || command.scenario === 'outside_area'
      const phoneSuffix = parseInt(command.key.replace(/[^a-f0-9]/gi, '').slice(0, 6) || '1', 16) % 10_000
      const input = {
        accountId, externalId: `demo:${command.key}`, name: 'Demo homeowner', phone: `+6140000${String(phoneSuffix).padStart(4, '0')}`,
        facts: complete ? { service: 'ducted_replacement', suburb: command.scenario === 'outside_area' ? 'Outside demo service area' : 'Ryde', homeowner: true, timeframe: 'next month', address: '10 Example Street, Ryde' } : {},
        consent: { sms: command.scenario !== 'no_permission', wording: 'Fictional enquiry for demonstration; no real contact authorised.', source: 'compass_demo', recordedAt: now },
        attribution: { source: 'google_search', campaign: 'Demo ducted replacement', keyword: 'ducted replacement' }
      }
      selectedEnquiry = (await store.intake(input, now)).id
    } else {
      accountId = command.accountId
      const account = await deliveryAccount(accountId)
      const now = account.mode === 'demo' ? account.demo_now ?? new Date().toISOString() : new Date().toISOString()
      if (command.type.startsWith('demo.') && account.mode !== 'demo') throw new DeliveryHttpError(403, 'demo_only')
      if (command.type === 'demo.advance') {
        await store.rpc('delivery_demo_advance', { p_account_id: accountId, p_hours: command.hours, p_key: command.key })
      } else if (command.type === 'demo.reply') {
        const enquiry = (await store.snapshot(accountId, command.enquiryId)).enquiries[0]
        if (!enquiry) throw new DeliveryHttpError(404, 'Enquiry not found')
        selectedEnquiry = enquiry.id
        await store.receive({ accountId, enquiryId: enquiry.id, phone: enquiry.phone, body: command.body, providerId: `demo-${command.key}`, stop: isOptOut(command.body) }, now)
      } else if (command.type === 'operator' || command.type === 'outcome') {
        selectedEnquiry = command.enquiryId
        if (command.type === 'outcome') {
          const enquiry = (await store.snapshot(accountId, command.enquiryId)).enquiries[0]
          if (!enquiry) throw new DeliveryHttpError(404, 'Enquiry not found')
          try { validateOutcome(enquiry.state, command, now) } catch (error) { throw new DeliveryHttpError(400, error instanceof Error ? error.message : 'Invalid outcome') }
        }
        await store.command(accountId, command.enquiryId, command.key, command.type, { ...command, actor: access.user.id }, now)
      } else if (command.type === 'assign') {
        const snapshot = await store.snapshot(accountId, command.enquiryId)
        if (!snapshot.enquiries.length || !snapshot.unassigned.some(m => m.id === command.messageId)) throw new DeliveryHttpError(404, 'Reply or enquiry not found')
        await store.rpc('delivery_assign_reply', { p_message_id: command.messageId, p_enquiry_id: command.enquiryId, p_now: now })
        selectedEnquiry = command.enquiryId
      }
    }
    const account = await deliveryAccount(accountId)
    // Live commands are persisted here; only the separately authenticated scheduler performs live actions.
    const result = account.mode === 'demo' ? await runDeliveryWorker({ store, providers: createDeliveryProviders({ busy: ctx => store.busy(ctx) }), accountId,
      clock: () => account.demo_now ?? new Date().toISOString(), limit: 40 }) : { queued: true }
    return portalJson({ accountId, selectedEnquiry, result, snapshot: await store.snapshot(accountId) })
  } catch (error) { return deliveryError(error) }
}
