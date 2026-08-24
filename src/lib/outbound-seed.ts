import {
  deriveCopyArchiveComponents,
  emptyFollowUpStep,
  scaffoldSequence,
  type CopyArchiveEntry,
  type OutboundCta,
  type OutboundExpression,
  type OutboundOpener,
  type OutboundOffer,
  type OutboundSequence,
  type OutboundStructure,
  type OutboundSubject,
  type OutboundTemplate,
  yoursProvenance
} from '@/lib/outbound-copy'
import {
  sourceCtas,
  sourceExpressions,
  sourceOpeners,
  sourceStructures,
  sourceSubjects,
  sourceTemplates,
  sourceInventoryCounts
} from '@/lib/outbound-source-seed'

const STAMP = '2026-08-07T00:00:00.000Z'

function mergeById<T extends { id: string }>(yours: T[], source: T[]): T[] {
  const map = new Map<string, T>()
  for (const row of source) map.set(row.id, row)
  for (const row of yours) map.set(row.id, row) // yours wins on id collision
  return Array.from(map.values())
}



export function seedOffers(): OutboundOffer[] {
  return [
    {
      id: 'offer-growth-system',
      offer_key: 'growth-system',
      name: 'Switchflow Growth System',
      pack_summary:
        'Qualified booked appointments from paid ads — hybrid signup + retainer + performance',
      positioning_line: null,
      vertical_tags: ['mortgage-brokers'],
      location_tags: ['au-national'],
      sort_order: 10,
      archived: true,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    },
    {
      id: 'offer-ai-enablement',
      offer_key: 'ai-enablement',
      name: 'AI Enablement',
      pack_summary:
        'Install marketing, quote follow-up, and review tools in-house; install fee refund path',
      positioning_line: null,
      vertical_tags: ['tradies', 'electricians'],
      location_tags: ['nsw', 'qld', 'au-national'],
      sort_order: 20,
      archived: true,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    },
    {
      id: 'offer-ai-receptionist-system',
      offer_key: 'ai-receptionist-system',
      name: 'After-hours booking',
      pack_summary:
        'Overflow voice + SMS so a job that already called books while they are on the tools',
      positioning_line:
        'Missed-call and after-hours booking for established local trades that already get inbound',
      vertical_tags: ['tradies', 'plumber', 'hvac'],
      location_tags: ['au-national'],
      sort_order: 30,
      archived: false,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    },
    {
      id: 'offer-agency-ai-reporting',
      offer_key: 'agency-ai-reporting',
      name: 'Agency AI Reporting System',
      pack_summary: 'Client reporting automation for marketing agencies',
      positioning_line: null,
      vertical_tags: ['agencies'],
      location_tags: ['au-national'],
      sort_order: 40,
      archived: true,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    }
  ]
}

function yoursExpressions(): OutboundExpression[] {
  return [
    {
      id: 'expr-ai-enablement-tradies',
      offer_key: 'ai-enablement',
      label: '[Yours] AI Enablement · AU tradies',
      body: 'Within 30 days of access, your marketing, quote follow-up, and review tools are set up and someone on your side can run them, or you get the install fee back.',
      vertical_tags: ['tradies', 'electricians'],
      location_tags: ['au-national', 'nsw'],
      status: 'approved',
      notes: null,
      archived: true,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    },
    {
      id: 'expr-growth-mortgage',
      offer_key: 'growth-system',
      label: '[Yours] Growth System · AU mortgage brokers',
      body: "I'll get you {{bookedN}} booked borrower chats in the first 30 days after access and budget are live, or I refund the setup fee in full.",
      vertical_tags: ['mortgage-brokers'],
      location_tags: ['au-national'],
      status: 'campaign_gated',
      notes: 'No standing volume guarantee; N locked per campaign.',
      archived: true,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    },
    {
      id: 'expr-proof-receptionist',
      offer_key: 'ai-receptionist-system',
      label: '[Yours] Proof · after-hours booking',
      body: 'After-hours calls on a comparable shop still hit voicemail; [peer] now answers and offers a booking path. Swap [peer] for a named like-for-like before send. Do not promise lead volume.',
      vertical_tags: ['tradies', 'electricians'],
      location_tags: ['nsw', 'qld'],
      status: 'draft',
      notes: 'slot:proof_block. Campaign-gated; no named peer metric yet.',
      archived: false,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    },
    {
      id: 'expr-proof-growth',
      offer_key: 'growth-system',
      label: '[Yours] Proof · booked appointments',
      body: '[N] booked borrower chats in the first 30 days after access and budget were live, on a comparable broker list. Lock N per campaign; no standing volume guarantee.',
      vertical_tags: ['mortgage-brokers'],
      location_tags: ['nsw', 'qld'],
      status: 'campaign_gated',
      notes: 'slot:proof_block. N locked per campaign.',
      archived: true,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    },
    {
      id: 'expr-proof-enablement',
      offer_key: 'ai-enablement',
      label: '[Yours] Proof · in-house after install',
      body: '[Peer shop] now runs the three starter agents in-house after install. Name the peer before send. Refund path is the install fee if they cannot run it.',
      vertical_tags: ['tradies', 'electricians'],
      location_tags: ['nsw', 'qld'],
      status: 'draft',
      notes: 'slot:proof_block. Campaign-gated; no named peer metric yet.',
      archived: true,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    },
    {
      id: 'expr-proof-agency-reporting',
      offer_key: 'agency-ai-reporting',
      label: '[Yours] Proof · reporting commentary pass',
      body: 'Monthly client reporting goes from hours of collection and formatting to a short commentary pass. From $2,500. Name a like-for-like agency before send.',
      vertical_tags: ['agencies'],
      location_tags: ['nsw', 'qld'],
      status: 'draft',
      notes: 'slot:proof_block. Campaign-gated; no named peer metric yet.',
      archived: true,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    }
  ]
}

export function seedExpressions(): OutboundExpression[] {
  return mergeById(yoursExpressions(), sourceExpressions())
}

export function seedStructures(): OutboundStructure[] {
  // Creator skeletons (Nick / Platten / Connor) — source of truth
  return sourceStructures()
}

function yoursCtas(): OutboundCta[] {
  return [
    {
      id: 'cta-permission-default',
      label: '[Yours] Permission',
      body: 'Mind if I send over {{asset}}?',
      cta_type: 'permission',
      vertical_tags: [],
      location_tags: [],
      is_default: false,
      archived: false,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    },
    {
      id: 'cta-enablement-dream',
      label: '[Yours] Enablement dream ask',
      body: 'If I trained you up so you could use AI for ads, the website, invoices, follow-ups, and a chunk of the office work, would that actually help {{companyName}}?',
      cta_type: 'give_first',
      vertical_tags: ['tradies'],
      location_tags: [],
      is_default: false,
      archived: false,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    },
    {
      id: 'cta-outline-permission',
      label: '[Yours] Outline permission',
      body: "Mind if I send a short outline of how I'd run it for you?",
      cta_type: 'permission',
      vertical_tags: [],
      location_tags: [],
      is_default: false,
      archived: false,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    },
    {
      id: 'cta-right-person',
      label: '[Yours] Right person',
      body: 'Is the public number still landing on you, or whoever runs the office?',
      cta_type: 'interest_check',
      vertical_tags: ['tradies', 'electricians', 'agencies', 'mortgage-brokers'],
      location_tags: ['nsw', 'qld'],
      is_default: false,
      archived: false,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    },
    {
      id: 'cta-consultative',
      label: '[Yours] Consultative after-hours',
      body: 'Worth a look at how after-hours calls run on your number?',
      cta_type: 'permission',
      vertical_tags: ['tradies', 'electricians'],
      location_tags: ['nsw', 'qld'],
      is_default: false,
      archived: false,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    }
  ]
}

export function seedCtas(): OutboundCta[] {
  return mergeById(yoursCtas(), sourceCtas())
}

function yoursSubjects(): OutboundSubject[] {
  return [
    {
      id: 'subj-colleague-register',
      label: '[Yours] Colleague register',
      pattern: '{{companyName}} / {{firstName}}',
      notes: 'family:internal-note. Plausible deniability — looks like an internal forward subject.',
      vertical_tags: ['electricians', 'tradies', 'family:internal-note'],
      archived: false,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    },
    {
      id: 'subj-outcome-stem',
      label: '[Yours] Outcome stem',
      pattern: '{{outcome}} for {{companyName}}',
      notes: 'family:outcome. Outcome-led without “quick” stems.',
      vertical_tags: ['electricians', 'tradies', 'family:outcome'],
      archived: false,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    },
    {
      id: 'subj-passthrough',
      label: '[Yours] Instantly per-lead passthrough',
      pattern: '{{subject}}',
      notes: 'Use when Instantly supplies per-lead subjects.',
      vertical_tags: [],
      archived: false,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    },
    {
      id: 'subj-trigger-hiring',
      label: '[Yours] Trigger · hiring',
      pattern: '{{companyName}} hiring',
      notes: 'family:trigger. Lowercase 4–7 words. Fill per campaign; skip if no hire.',
      vertical_tags: ['electricians', 'tradies', 'agencies', 'family:trigger'],
      archived: false,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    }
  ]
}

export function seedSubjects(): OutboundSubject[] {
  return mergeById(yoursSubjects(), sourceSubjects())
}

function yoursOpeners(): OutboundOpener[] {
  return [
    {
      id: 'opener-none',
      label: 'Skip if no unique fact',
      opener_mode: 'none',
      body: '',
      notes: 'Empty beats a scrape tell. Greeting + geo only when there is nothing unique.',
      vertical_tags: ['electricians', 'tradies'],
      archived: false,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    },
    {
      id: 'opener-signal-hire',
      label: 'Signal · hire',
      opener_mode: 'nick-tier',
      body: 'They just posted for a [role], which is usually when the public number starts leaking jobs.',
      notes: 'Pattern only. Fill per campaign; skip if no hire.',
      vertical_tags: ['electricians', 'tradies', 'agencies', 'mortgage-brokers'],
      archived: false,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    },
    {
      id: 'opener-signal-specialty',
      label: 'Signal · named specialty',
      opener_mode: 'nick-tier',
      body: 'Most shops on this list run general callouts; you still lead with [named specialty].',
      notes: 'One shop-specific job type. No site, homepage, phone, or licence.',
      vertical_tags: ['electricians', 'tradies'],
      archived: false,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    },
    {
      id: 'opener-signal-content',
      label: 'Signal · content they made',
      opener_mode: 'custom',
      body: 'That line in your [post/talk] about [specific claim] is the bit I actually wanted to ask about.',
      notes: 'Skip if they do not publish. Stronger for agencies and enablement than tradies.',
      vertical_tags: ['agencies', 'mortgage-brokers'],
      archived: false,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    }
  ]
}

export function seedOpeners(): OutboundOpener[] {
  return mergeById(yoursOpeners(), sourceOpeners())
}

function yoursTemplates(): OutboundTemplate[] {
  const thin = scaffoldSequence('nick-3step', { withFollowUp: true })
  const emailThin = thin.steps[0]
  const ctaPermission = emailThin.slots.find((s) => s.key === 'cta')
  if (ctaPermission) ctaPermission.body = 'Mind if I send over {{asset}}?'
  const exprThin = emailThin.slots.find((s) => s.key === 'cold_expression')
  if (exprThin) exprThin.body = '{{cold_expression}}'

  const withProof = scaffoldSequence('nick-4step', { withFollowUp: true })
  const emailProof = withProof.steps[0]
  const ctaProof = emailProof.slots.find((s) => s.key === 'cta')
  if (ctaProof) ctaProof.body = 'Mind if I send over {{asset}}?'
  const exprProof = emailProof.slots.find((s) => s.key === 'cold_expression')
  if (exprProof) exprProof.body = '{{cold_expression}}'
  const proof = emailProof.slots.find((s) => s.key === 'proof_block')
  if (proof) proof.body = '{{proof}}'

  const enablement = scaffoldSequence('nick-3step', {
    offerKey: 'ai-enablement',
    withFollowUp: true
  })
  const emailEn = enablement.steps[0]
  const exprEn = emailEn.slots.find((s) => s.key === 'cold_expression')
  if (exprEn) {
    exprEn.body =
      'Within 30 days of access, your marketing, quote follow-up, and review tools are set up and someone on your side can run them, or you get the install fee back.'
  }
  const ctaEn = emailEn.slots.find((s) => s.key === 'cta')
  if (ctaEn) {
    ctaEn.body =
      'If I trained you up so you could use AI for ads, the website, invoices, follow-ups, and a chunk of the office work, would that actually help {{companyName}}?'
  }

  const fourTouch = scaffoldSequence('nick-3step', { withFollowUp: false })
  const emailFour = fourTouch.steps[0]
  const openerFour = emailFour.slots.find((s) => s.key === 'opener')
  if (openerFour) openerFour.body = '{{personalization}}'
  const exprFour = emailFour.slots.find((s) => s.key === 'cold_expression')
  if (exprFour) exprFour.body = '{{cold_expression}}'
  const ctaFour = emailFour.slots.find((s) => s.key === 'cta')
  if (ctaFour) ctaFour.body = 'Worth a look at how after-hours calls run on your number?'
  const fuAngle = emptyFollowUpStep(1, 3)
  const bumpAngle = fuAngle.slots.find((s) => s.key === 'opener')
  if (bumpAngle) {
    bumpAngle.label = 'New angle'
    bumpAngle.body =
      "Different angle: the missed calls aren't the ads, it's the number after 5pm. That's the bit I'd show you."
  }
  const ctaAngle = fuAngle.slots.find((s) => s.key === 'cta')
  if (ctaAngle) ctaAngle.body = 'Mind if I send a short outline of how I would run it for you?'
  const fuProof = emptyFollowUpStep(2, 4)
  const bumpProof = fuProof.slots.find((s) => s.key === 'opener')
  if (bumpProof) {
    bumpProof.label = 'Proof'
    bumpProof.body =
      'One-line proof when you have it: [peer] answers after hours and texts the owner inside a minute.'
  }
  const ctaProof2 = fuProof.slots.find((s) => s.key === 'cta')
  if (ctaProof2) ctaProof2.body = 'If you want the outline, say yes.'
  const fuBreak = emptyFollowUpStep(3, 4)
  const bumpBreak = fuBreak.slots.find((s) => s.key === 'opener')
  if (bumpBreak) {
    bumpBreak.label = 'Breakup'
    bumpBreak.body =
      "I'll close this thread so it doesn't sit in your inbox. If after-hours calls become a problem later, reply and I'll send the short outline."
  }
  const ctaBreak = fuBreak.slots.find((s) => s.key === 'cta')
  if (ctaBreak) ctaBreak.body = ''
  fourTouch.steps.push(fuAngle, fuProof, fuBreak)

  const reengage = scaffoldSequence('nick-3step', { withFollowUp: false })
  const emailRe = reengage.steps[0]
  const openerRe = emailRe.slots.find((s) => s.key === 'opener')
  if (openerRe) openerRe.body = 'Last time you said later.'
  const exprRe = emailRe.slots.find((s) => s.key === 'cold_expression')
  if (exprRe) {
    exprRe.body =
      'One new proof if you have it: [peer] now answers after hours and texts the owner inside a minute.'
  }
  const ctaRe = emailRe.slots.find((s) => s.key === 'cta')
  if (ctaRe) ctaRe.body = 'Worth a look now, or still later?'

  return [
    {
      id: 'tmpl-thin-proof-nick-3',
      name: '[Yours] Thin proof · nick-3step',
      offer_key: null,
      structure_id: 'nick-3step',
      vertical_tags: [],
      location_tags: [],
      sequence: thin,
      archived: false,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    },
    {
      id: 'tmpl-with-proof-nick-4',
      name: '[Yours] With proof · nick-4step',
      offer_key: null,
      structure_id: 'nick-4step',
      vertical_tags: [],
      location_tags: [],
      sequence: withProof,
      archived: false,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    },
    {
      id: 'tmpl-ai-enablement-tradies',
      name: '[Yours] AI Enablement tradies · nick-3step',
      offer_key: 'ai-enablement',
      structure_id: 'nick-3step',
      vertical_tags: ['tradies', 'electricians'],
      location_tags: ['nsw', 'au-national'],
      sequence: enablement,
      archived: false,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    },
    {
      id: 'tmpl-four-touch-breakup',
      name: '[Yours] Four-touch breakup · nick-3step',
      offer_key: 'ai-receptionist-system',
      structure_id: 'nick-3step',
      vertical_tags: ['tradies', 'electricians'],
      location_tags: ['nsw', 'qld'],
      sequence: fourTouch,
      archived: false,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    },
    {
      id: 'tmpl-not-now-reengage',
      name: '[Yours] Not now re-engage · nick-3step',
      offer_key: null,
      structure_id: 'nick-3step',
      vertical_tags: ['tradies', 'electricians', 'agencies', 'mortgage-brokers'],
      location_tags: ['nsw', 'qld'],
      sequence: reengage,
      archived: false,
      created_at: STAMP,
      updated_at: STAMP,
      ...yoursProvenance()
    }
  ]
}

export function seedTemplates(): OutboundTemplate[] {
  return mergeById(yoursTemplates(), sourceTemplates())
}

function fillSequence(
  structureId: string,
  offerKey: string | null,
  fields: {
    subject: string
    opener?: string
    proof?: string
    expression: string
    cta: string
    followUp?: { subject?: string; bump: string; cta: string }
  }
): OutboundSequence {
  const seq = scaffoldSequence(structureId, { offerKey, withFollowUp: Boolean(fields.followUp) })
  const email = seq.steps[0]
  if (!email) return seq
  email.subject = fields.subject
  const set = (key: string, body?: string) => {
    if (body === undefined) return
    const slot = email.slots.find((s) => s.key === key)
    if (slot) slot.body = body
  }
  set('opener', fields.opener)
  set('proof_block', fields.proof)
  set('cold_expression', fields.expression)
  set('cta', fields.cta)
  set('availability_ask', fields.cta)
  if (fields.followUp) {
    const fu = seq.steps[1] ?? emptyFollowUpStep(1, 3)
    if (!seq.steps[1]) seq.steps.push(fu)
    fu.subject = fields.followUp.subject ?? ''
    const bump = fu.slots.find((s) => s.key === 'opener')
    if (bump) bump.body = fields.followUp.bump
    const cta = fu.slots.find((s) => s.key === 'cta')
    if (cta) cta.body = fields.followUp.cta
  }
  return seq
}

function archiveEntry(
  partial: Omit<CopyArchiveEntry, 'components' | 'archived'> & { archived?: boolean }
): CopyArchiveEntry {
  const offer = seedOffers().find((o) => o.offer_key === partial.offer_key)
  return {
    ...partial,
    archived: partial.archived ?? false,
    components: deriveCopyArchiveComponents(partial.sequence, {
      offer_key: partial.offer_key,
      offer_label: offer?.name ?? null,
      opener_mode: partial.opener_mode
    })
  }
}

/** Seeded Archive rows — full sequences with demo Instantly-style performance. */
export function seedCopyArchive(): CopyArchiveEntry[] {
  const nswElectricians = fillSequence('nick-3step', 'growth-system', {
    subject: '{{companyName}} / {{firstName}}',
    opener: '{{opener}}',
    expression:
      "I'll get you {{bookedN}} booked chats with homeowners in the first 30 days after access and budget are live, or I refund the setup fee in full.",
    cta: 'Mind if I send over {{asset}}?',
    followUp: {
      bump: 'Circling back in case this landed under the pile — happy to send the short outline if useful.',
      cta: 'Mind if I send over {{asset}}?'
    }
  })

  const qldTradies = fillSequence('platten-aida', 'ai-receptionist-system', {
    subject: '{{outcome}} for {{companyName}}',
    opener: '{{hook}}',
    proof: 'Teams like yours keep the phone line covered after hours without hiring another receptionist.',
    expression:
      'Missed calls after 5pm turn into booked jobs the next morning — answered, qualified, and SMS’d on your number.',
    cta: 'Would you be open to 15 minutes? If so, I can ring at {{t1}} or {{t2}}.',
    followUp: {
      bump: 'Quick bump — still happy to walk through a missed-call example for {{companyName}}.',
      cta: 'Would {{t1}} or {{t2}} work for a short call?'
    }
  })

  const brokersEnablement = fillSequence('connor-3para', 'ai-enablement', {
    subject: '{{companyName}} / {{firstName}}',
    opener: '',
    expression:
      'Within 30 days of access, your marketing, quote follow-up, and review tools are set up and someone on your side can run them, or you get the install fee back.',
    cta: 'If I trained you up so you could use AI for ads, the website, invoices, follow-ups, and a chunk of the office work, would that actually help {{companyName}}?',
    followUp: {
      bump: 'Still relevant if you’re looking to pull more of the marketing stack in-house this quarter.',
      cta: 'Worth a quick look for {{companyName}}?'
    }
  })
  // Connor uses who_line / why / availability_ask — remap for realism
  {
    const email = brokersEnablement.steps[0]
    if (email) {
      const who = email.slots.find((s) => s.key === 'who_line')
      if (who) {
        who.body =
          'I help mortgage brokers install marketing and follow-up tools in-house so the team can run them without another agency retainer.'
      }
      const why = email.slots.find((s) => s.key === 'why_priorities_and_outcomes')
      if (why) {
        why.body =
          'Most brokerages we work with want more borrower chats without adding headcount — we set up the stack and train someone on your side in under 30 days.'
      }
      const ask = email.slots.find((s) => s.key === 'availability_ask')
      if (ask) {
        ask.body =
          'If that sounds useful for {{companyName}}, I can show a short walkthrough — does {{t1}} or {{t2}} work?'
      }
    }
  }

  const agenciesReporting = fillSequence('nick-4step', 'agency-ai-reporting', {
    subject: '{{outcome}} for {{companyName}}',
    opener: '{{opener}}',
    proof: 'Agencies using the reporting pack cut client-report build time from hours to minutes.',
    expression:
      'Client reporting packs assemble themselves from the sources you already use — ready to send without a late-night scramble.',
    cta: "Mind if I send a short outline of how I'd run it for you?",
    followUp: {
      bump: 'Sharing in case reporting still eats evenings before client check-ins.',
      cta: "Mind if I send a short outline of how I'd run it for you?"
    }
  })

  const juneClosed = fillSequence('nick-3step', 'growth-system', {
    subject: '{{companyName}} / {{firstName}}',
    opener: '{{opener}}',
    expression:
      "I'll get you {{bookedN}} booked chats with homeowners in the first 30 days after access and budget are live, or I refund the setup fee in full.",
    cta: 'Mind if I send over {{asset}}?',
    followUp: {
      bump: 'Last note from me — happy to send the outline if the timing is better now.',
      cta: 'Mind if I send over {{asset}}?'
    }
  })

  const aprilTradies = fillSequence('platten-aida', 'ai-receptionist-system', {
    subject: '{{outcome}} for {{companyName}}',
    opener: '{{hook}}',
    proof: 'QLD trade teams keep after-hours coverage without a second hire.',
    expression:
      'Missed calls after hours become booked jobs overnight — answered and qualified on your number.',
    cta: 'Would you be open to 15 minutes? If so, I can ring at {{t1}} or {{t2}}.',
    followUp: {
      bump: 'Seasonal bump — still relevant if after-hours calls are slipping.',
      cta: 'Would {{t1}} or {{t2}} work?'
    }
  })

  return [
    archiveEntry({
      id: 'archive-nsw-elec-growth',
      name: 'NSW Electricians — Growth System',
      source: 'saved',
      source_id: 'ob-live-1',
      vertical_tags: ['electricians'],
      location_tags: ['nsw'],
      offer_key: 'growth-system',
      structure_id: 'nick-3step',
      opener_mode: 'nick-tier',
      sequence: nswElectricians,
      performance: {
        sendCount: 1680,
        replyCount: 64,
        replyRate: 3.8,
        positiveReplies: 42,
        meetings: 11,
        leadCount: 2400,
        campaignCount: 2
      },
      last_used_at: '2026-08-07T04:12:00.000Z',
      first_used_at: '2026-07-28T00:00:00.000Z',
      notes: 'Nick 3-step · permission CTA · au-national opener tier',
      created_at: '2026-07-28T00:00:00.000Z',
      updated_at: '2026-08-07T04:12:00.000Z'
    }),
    archiveEntry({
      id: 'archive-qld-tradies-receptionist',
      name: 'QLD Tradies — AI Receptionist',
      source: 'saved',
      source_id: 'ob-live-2',
      vertical_tags: ['tradies'],
      location_tags: ['qld'],
      offer_key: 'ai-receptionist-system',
      structure_id: 'platten-aida',
      opener_mode: 'platten-hook',
      sequence: qldTradies,
      performance: {
        sendCount: 980,
        replyCount: 40,
        replyRate: 4.1,
        positiveReplies: 31,
        meetings: 8,
        leadCount: 1850,
        campaignCount: 1
      },
      last_used_at: '2026-08-07T03:40:00.000Z',
      first_used_at: '2026-07-30T00:00:00.000Z',
      notes: 'Platten AIDA · missed-call hook · timed call CTA',
      created_at: '2026-07-30T00:00:00.000Z',
      updated_at: '2026-08-07T03:40:00.000Z'
    }),
    archiveEntry({
      id: 'archive-brokers-enablement',
      name: 'Mortgage Brokers AU — Enablement',
      source: 'saved',
      source_id: 'ob-live-3',
      vertical_tags: ['mortgage-brokers'],
      location_tags: ['au-national'],
      offer_key: 'ai-enablement',
      structure_id: 'connor-3para',
      opener_mode: 'connor-intel',
      sequence: brokersEnablement,
      performance: {
        sendCount: 2100,
        replyCount: 61,
        replyRate: 2.9,
        positiveReplies: 38,
        meetings: 9,
        leadCount: 3200,
        campaignCount: 2
      },
      last_used_at: '2026-08-06T22:10:00.000Z',
      first_used_at: '2026-07-22T00:00:00.000Z',
      notes: 'Connor 3-para · interest-check / availability ask',
      created_at: '2026-07-22T00:00:00.000Z',
      updated_at: '2026-08-06T22:10:00.000Z'
    }),
    archiveEntry({
      id: 'archive-agencies-reporting',
      name: 'Agency Owners — Reporting Pack',
      source: 'saved',
      source_id: 'ob-live-4',
      vertical_tags: ['agencies'],
      location_tags: ['au-national'],
      offer_key: 'agency-ai-reporting',
      structure_id: 'nick-4step',
      opener_mode: 'nick-tier',
      sequence: agenciesReporting,
      performance: {
        sendCount: 420,
        replyCount: 22,
        replyRate: 5.2,
        positiveReplies: 18,
        meetings: 5,
        leadCount: 1100,
        campaignCount: 1
      },
      last_used_at: '2026-08-06T18:00:00.000Z',
      first_used_at: '2026-08-01T00:00:00.000Z',
      notes: 'Nick 4-step · give-first outline CTA · soft proof',
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-06T18:00:00.000Z'
    }),
    archiveEntry({
      id: 'archive-june-elec-closed',
      name: 'June Electricians Closed',
      source: 'saved',
      source_id: 'ob-hist-1',
      vertical_tags: ['electricians'],
      location_tags: ['nsw'],
      offer_key: 'growth-system',
      structure_id: 'nick-3step',
      opener_mode: 'nick-tier',
      sequence: juneClosed,
      performance: {
        sendCount: 2000,
        replyCount: 72,
        replyRate: 3.6,
        positiveReplies: 51,
        meetings: 14,
        leadCount: 2000,
        campaignCount: 1
      },
      last_used_at: '2026-06-28T00:00:00.000Z',
      first_used_at: '2026-06-01T00:00:00.000Z',
      notes: 'Completed · archived sequence fork',
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-28T00:00:00.000Z'
    }),
    archiveEntry({
      id: 'archive-april-tradies-qld',
      name: 'April Tradies QLD',
      source: 'saved',
      source_id: 'ob-hist-3',
      vertical_tags: ['tradies'],
      location_tags: ['qld'],
      offer_key: 'ai-receptionist-system',
      structure_id: 'platten-aida',
      opener_mode: 'platten-hook',
      sequence: aprilTradies,
      performance: {
        sendCount: 1200,
        replyCount: 48,
        replyRate: 4.0,
        positiveReplies: 33,
        meetings: 7,
        leadCount: 1200,
        campaignCount: 1
      },
      last_used_at: '2026-04-26T00:00:00.000Z',
      first_used_at: '2026-04-02T00:00:00.000Z',
      notes: 'Completed · AIDA · seasonal list exhaust',
      created_at: '2026-04-02T00:00:00.000Z',
      updated_at: '2026-04-26T00:00:00.000Z'
    })
  ]
}

/** Guard used in tests — seed inventory must stay scoped. */
export function seedInventoryCounts() {
  const source = sourceInventoryCounts()
  return {
    offers: seedOffers().length,
    expressions: seedExpressions().length,
    structures: seedStructures().length,
    ctas: seedCtas().length,
    subjects: seedSubjects().length,
    openers: seedOpeners().length,
    templates: seedTemplates().length,
    copyArchive: seedCopyArchive().length,
    source
  }
}
