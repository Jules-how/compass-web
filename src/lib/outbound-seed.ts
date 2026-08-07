import {
  COMPLIANCE_FOOTER_SLOTS,
  STRUCTURE_DESCRIPTIONS,
  scaffoldSequence,
  structureSlots,
  type OutboundCta,
  type OutboundExpression,
  type OutboundOpener,
  type OutboundOffer,
  type OutboundStructure,
  type OutboundSubject,
  type OutboundTemplate
} from '@/lib/outbound-copy'

const STAMP = '2026-08-07T00:00:00.000Z'

function withFooter(slots: ReturnType<typeof structureSlots>) {
  // structureSlots already appends compliance footers
  return slots
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
      archived: false,
      created_at: STAMP,
      updated_at: STAMP
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
      archived: false,
      created_at: STAMP,
      updated_at: STAMP
    },
    {
      id: 'offer-ai-receptionist-system',
      offer_key: 'ai-receptionist-system',
      name: 'AI Receptionist System',
      pack_summary: 'Answer → qualify → book/SMS on their number 24/7',
      positioning_line: null,
      vertical_tags: ['tradies'],
      location_tags: ['au-national'],
      sort_order: 30,
      archived: false,
      created_at: STAMP,
      updated_at: STAMP
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
      archived: false,
      created_at: STAMP,
      updated_at: STAMP
    }
  ]
}

export function seedExpressions(): OutboundExpression[] {
  return [
    {
      id: 'expr-ai-enablement-tradies',
      offer_key: 'ai-enablement',
      label: 'AI Enablement · AU tradies',
      body: 'Within 30 days of access, your marketing, quote follow-up, and review tools are set up and someone on your side can run them, or you get the install fee back.',
      vertical_tags: ['tradies', 'electricians'],
      location_tags: ['au-national', 'nsw'],
      status: 'approved',
      notes: null,
      archived: false,
      created_at: STAMP,
      updated_at: STAMP
    },
    {
      id: 'expr-growth-mortgage',
      offer_key: 'growth-system',
      label: 'Growth System · AU mortgage brokers',
      body: "I'll get you {{bookedN}} booked borrower chats in the first 30 days after access and budget are live, or I refund the setup fee in full.",
      vertical_tags: ['mortgage-brokers'],
      location_tags: ['au-national'],
      status: 'campaign_gated',
      notes: 'No standing volume guarantee; N locked per campaign.',
      archived: false,
      created_at: STAMP,
      updated_at: STAMP
    }
  ]
}

export function seedStructures(): OutboundStructure[] {
  return [
    {
      id: 'struct-nick-4step',
      structure_id: 'nick-4step',
      name: 'Nick 4-step',
      description: STRUCTURE_DESCRIPTIONS['nick-4step'],
      slots: withFooter(structureSlots('nick-4step')),
      is_default_candidate: true,
      archived: false,
      created_at: STAMP,
      updated_at: STAMP
    },
    {
      id: 'struct-nick-3step',
      structure_id: 'nick-3step',
      name: 'Nick 3-step',
      description: STRUCTURE_DESCRIPTIONS['nick-3step'],
      slots: withFooter(structureSlots('nick-3step')),
      is_default_candidate: true,
      archived: false,
      created_at: STAMP,
      updated_at: STAMP
    },
    {
      id: 'struct-platten-aida',
      structure_id: 'platten-aida',
      name: 'Platten AIDA',
      description: STRUCTURE_DESCRIPTIONS['platten-aida'],
      slots: withFooter(structureSlots('platten-aida')),
      is_default_candidate: false,
      archived: false,
      created_at: STAMP,
      updated_at: STAMP
    },
    {
      id: 'struct-connor-3para',
      structure_id: 'connor-3para',
      name: 'Connor 3-paragraph',
      description: STRUCTURE_DESCRIPTIONS['connor-3para'],
      slots: withFooter(structureSlots('connor-3para')),
      is_default_candidate: false,
      archived: false,
      created_at: STAMP,
      updated_at: STAMP
    }
  ]
}

export function seedCtas(): OutboundCta[] {
  return [
    {
      id: 'cta-permission-default',
      label: 'Permission default',
      body: 'Mind if I send over {{asset}}?',
      cta_type: 'permission',
      vertical_tags: [],
      location_tags: [],
      is_default: true,
      archived: false,
      created_at: STAMP,
      updated_at: STAMP
    },
    {
      id: 'cta-timed-call',
      label: 'Timed call',
      body: 'Would you be open to 15 minutes? If so, I can ring at {{t1}} or {{t2}}.',
      cta_type: 'timed_call',
      vertical_tags: [],
      location_tags: [],
      is_default: false,
      archived: false,
      created_at: STAMP,
      updated_at: STAMP
    },
    {
      id: 'cta-enablement-dream',
      label: 'Enablement dream ask',
      body: 'If I trained you up so you could use AI for ads, the website, invoices, follow-ups, and a chunk of the office work, would that actually help {{companyName}}?',
      cta_type: 'give_first',
      vertical_tags: ['tradies'],
      location_tags: [],
      is_default: false,
      archived: false,
      created_at: STAMP,
      updated_at: STAMP
    },
    {
      id: 'cta-outline-permission',
      label: 'Outline permission',
      body: "Mind if I send a short outline of how I'd run it for you?",
      cta_type: 'permission',
      vertical_tags: [],
      location_tags: [],
      is_default: false,
      archived: false,
      created_at: STAMP,
      updated_at: STAMP
    }
  ]
}

export function seedSubjects(): OutboundSubject[] {
  return [
    {
      id: 'subj-colleague-register',
      label: 'Colleague register',
      pattern: '{{companyName}} / {{firstName}}',
      notes: 'Plausible deniability — looks like an internal forward subject.',
      vertical_tags: [],
      archived: false,
      created_at: STAMP,
      updated_at: STAMP
    },
    {
      id: 'subj-outcome-stem',
      label: 'Outcome stem',
      pattern: '{{outcome}} for {{companyName}}',
      notes: 'Outcome-led without “quick” stems.',
      vertical_tags: [],
      archived: false,
      created_at: STAMP,
      updated_at: STAMP
    },
    {
      id: 'subj-passthrough',
      label: 'Instantly per-lead passthrough',
      pattern: '{{subject}}',
      notes: 'Use when Instantly supplies per-lead subjects.',
      vertical_tags: [],
      archived: false,
      created_at: STAMP,
      updated_at: STAMP
    }
  ]
}

export function seedOpeners(): OutboundOpener[] {
  return [
    {
      id: 'opener-nick-tier',
      label: 'Nick tier (research fact)',
      opener_mode: 'nick-tier',
      body: '{{opener}}',
      notes: 'Research-backed fact; often filled per lead via Instantly vars.',
      vertical_tags: [],
      archived: false,
      created_at: STAMP,
      updated_at: STAMP
    },
    {
      id: 'opener-platten-hook',
      label: 'Platten hook',
      opener_mode: 'platten-hook',
      body: '{{hook}}',
      notes: 'Optional hook-style opener.',
      vertical_tags: [],
      archived: false,
      created_at: STAMP,
      updated_at: STAMP
    },
    {
      id: 'opener-none',
      label: 'None (greeting + geo)',
      opener_mode: 'none',
      body: '',
      notes: 'Empty opener when personalisation is greeting + geo only (e.g. enablement NSW electricians).',
      vertical_tags: ['electricians', 'tradies'],
      archived: false,
      created_at: STAMP,
      updated_at: STAMP
    }
  ]
}

export function seedTemplates(): OutboundTemplate[] {
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

  return [
    {
      id: 'tmpl-thin-proof-nick-3',
      name: 'Thin proof · nick-3step',
      offer_key: null,
      structure_id: 'nick-3step',
      vertical_tags: [],
      location_tags: [],
      sequence: thin,
      archived: false,
      created_at: STAMP,
      updated_at: STAMP
    },
    {
      id: 'tmpl-with-proof-nick-4',
      name: 'With proof · nick-4step',
      offer_key: null,
      structure_id: 'nick-4step',
      vertical_tags: [],
      location_tags: [],
      sequence: withProof,
      archived: false,
      created_at: STAMP,
      updated_at: STAMP
    },
    {
      id: 'tmpl-ai-enablement-tradies',
      name: 'AI Enablement tradies · nick-3step',
      offer_key: 'ai-enablement',
      structure_id: 'nick-3step',
      vertical_tags: ['tradies', 'electricians'],
      location_tags: ['nsw', 'au-national'],
      sequence: enablement,
      archived: false,
      created_at: STAMP,
      updated_at: STAMP
    }
  ]
}

/** Guard used in tests — seed inventory must stay scoped. */
export function seedInventoryCounts() {
  return {
    offers: seedOffers().length,
    expressions: seedExpressions().length,
    structures: seedStructures().length,
    ctas: seedCtas().length,
    subjects: seedSubjects().length,
    openers: seedOpeners().length,
    templates: seedTemplates().length
  }
}
