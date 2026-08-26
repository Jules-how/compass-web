import { NextResponse } from 'next/server'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { handleReactivationInboundSms } from '@/lib/reactivation-runtime'
import { formBodyToRecord, verifyTwilioSignature } from '@/lib/voice-webhook-auth'
import { normalizePhone } from '@/lib/voice-client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function twiml(message?: string): NextResponse {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`
    : '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
  return new NextResponse(body, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' }
  })
}

export async function POST(request: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim()
  const signature = request.headers.get('x-twilio-signature')
  const form = await request.formData()
  const params = formBodyToRecord(form)

  const url = process.env.COMPASS_PUBLIC_URL
    ? `https://${process.env.COMPASS_PUBLIC_URL.replace(/^https?:\/\//, '')}/api/reactivation/sms`
    : request.url

  if (authToken && !verifyTwilioSignature(authToken, signature, url, params)) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const from = normalizePhone(params.From) ?? params.From
    const to = normalizePhone(params.To) ?? params.To
    const body = String(params.Body ?? '').trim()
    const sid = String(params.MessageSid ?? '').trim() || undefined

    if (!from || !to || !body) {
      return twiml()
    }

    const supabase = getPortalAdminClient()
    const result = await handleReactivationInboundSms(supabase, {
      from,
      to,
      body,
      twilioSid: sid
    })

    if (!result.handled) {
      return twiml()
    }

    return twiml()
  } catch (err) {
    console.error('[reactivation/sms]', err)
    return twiml()
  }
}
