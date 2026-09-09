export function fixture() {
  const at = '2026-09-01T00:00:00Z'
  const context = {
    campaign_id: 'test-cell',
    offer: {
      offer_key: 'installation-booking',
      lock: {
        relevance: [
          'Published ducted residential installation service in Sydney'
        ]
      },
      gtm_status: 'testing',
      archived: false
    },
    vertical: 'hvac',
    city: 'sydney',
    recipe: {
      subject: '{service} in {service_area}',
      opener: 'Saw {company} offers {service} in {service_area}.'
    },
    settings: {
      timezone: 'Australia/Sydney',
      email_list: ['sender@example.test'],
      from: '09:00',
      to: '17:00',
      daily_limit: 20
    },
    sequence: {
      structure_id: 'test',
      offer_key: 'installation-booking',
      steps: [
        {
          id: 'first',
          kind: 'email',
          label: 'Email 1',
          subject: '{{subject}}',
          slots: [
            {
              key: 'opener',
              label: 'Opener',
              required: true,
              body: '{{personalization}}'
            },
            {
              key: 'custom',
              label: 'Body',
              required: true,
              body: 'Would this be relevant to your installation team?'
            },
            {
              key: 'accountSignature',
              label: 'Signature',
              body: 'Jules, Switchflow'
            },
            {
              key: 'spam_act_opt_out',
              label: 'Unsubscribe',
              body: '<a href="{{unsubscribe}}">Unsubscribe</a>'
            }
          ]
        },
        {
          id: 'second',
          kind: 'followup',
          label: 'Follow-up',
          delay_days: 2,
          subject: '',
          slots: [
            {
              key: 'custom',
              label: 'Body',
              required: true,
              body: 'Following up on the note below.'
            },
            {
              key: 'spam_act_opt_out',
              label: 'Unsubscribe',
              body: '<a href="{{unsubscribe}}">Unsubscribe</a>'
            }
          ]
        }
      ]
    }
  }
  const candidate = {
    id: 'test-candidate',
    company_id: 'test-company',
    lead_id: 'test-lead',
    company: 'Example Air',
    website: 'https://example.test',
    email: 'work@example.test',
    identity_reviewed: true,
    evidence: Object.entries({
      service: 'ducted installation',
      service_area: 'Sydney',
      residential: 'residential',
      quote_journey: 'Request a quote',
      independent: 'independently owned',
      email: 'work@example.test'
    }).map(([kind, value]) => ({
      kind,
      value,
      quote: value,
      url: 'https://example.test/contact',
      observed_at: at
    })),
    contact_basis: {
      kind: 'published_role_relevant',
      rationale: 'Published work address for installation enquiries',
      url: 'https://example.test/contact',
      checked_at: at
    },
    verification: {
      status: 'valid',
      provider: 'synthetic-test-provider',
      checked_at: at
    }
  }
  const ledger = [
    {
      id: 'test-lead',
      email: candidate.email,
      company: candidate.company,
      company_domain: 'example.test',
      outbound_status: 'uncontacted',
      pipeline_campaign_id: null,
      is_archived: false,
      recontact_ok: 1
    }
  ]
  return { context, candidate, ledger }
}
