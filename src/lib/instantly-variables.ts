/**
 * Instantly predefined (base) lead variables.
 * @see https://help.instantly.ai/en/articles/6135930-how-to-add-and-use-variables-in-campaigns
 *
 * Use {{token}} in subject/body so copy pastes cleanly into Instantly.
 */
export const INSTANTLY_BASE_VARIABLES = [
  { key: 'email', label: 'Email', token: '{{email}}' },
  { key: 'firstName', label: 'First name', token: '{{firstName}}' },
  { key: 'lastName', label: 'Last name', token: '{{lastName}}' },
  { key: 'companyName', label: 'Company', token: '{{companyName}}' },
  { key: 'jobTitle', label: 'Job title', token: '{{jobTitle}}' },
  { key: 'personalization', label: 'Personalization', token: '{{personalization}}' },
  { key: 'phone', label: 'Phone', token: '{{phone}}' },
  { key: 'website', label: 'Website', token: '{{website}}' },
  { key: 'location', label: 'Location', token: '{{location}}' },
  { key: 'linkedIn', label: 'LinkedIn', token: '{{linkedIn}}' }
] as const

export type InstantlyBaseVariableKey = (typeof INSTANTLY_BASE_VARIABLES)[number]['key']
