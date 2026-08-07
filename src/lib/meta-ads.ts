/** Meta Ads Manager planning enums — aligned with Meta Ads Manager upload fields. */

export const META_AD_STATUSES = ['draft', 'active', 'paused', 'archived'] as const
export type MetaAdStatus = (typeof META_AD_STATUSES)[number]

export const META_CAMPAIGN_OBJECTIVES = [
  'OUTCOME_AWARENESS',
  'OUTCOME_TRAFFIC',
  'OUTCOME_ENGAGEMENT',
  'OUTCOME_LEADS',
  'OUTCOME_APP_PROMOTION',
  'OUTCOME_SALES'
] as const
export type MetaCampaignObjective = (typeof META_CAMPAIGN_OBJECTIVES)[number]

export const META_BUYING_TYPES = ['auction', 'reserved'] as const
export type MetaBuyingType = (typeof META_BUYING_TYPES)[number]

export const META_BUDGET_TYPES = ['none', 'daily', 'lifetime'] as const
export type MetaBudgetType = (typeof META_BUDGET_TYPES)[number]

export const META_SPECIAL_AD_CATEGORIES = [
  'HOUSING',
  'EMPLOYMENT',
  'CREDIT',
  'ISSUES_ELECTIONS_POLITICS'
] as const
export type MetaSpecialAdCategory = (typeof META_SPECIAL_AD_CATEGORIES)[number]

export const META_OPTIMIZATION_GOALS = [
  'REACH',
  'IMPRESSIONS',
  'LINK_CLICKS',
  'LANDING_PAGE_VIEWS',
  'LEAD_GENERATION',
  'CONVERSIONS',
  'VALUE',
  'THRUPLAY',
  'POST_ENGAGEMENT'
] as const
export type MetaOptimizationGoal = (typeof META_OPTIMIZATION_GOALS)[number]

export const META_BILLING_EVENTS = ['IMPRESSIONS', 'LINK_CLICKS', 'THRUPLAY'] as const
export type MetaBillingEvent = (typeof META_BILLING_EVENTS)[number]

export const META_BID_STRATEGIES = [
  'LOWEST_COST_WITHOUT_CAP',
  'LOWEST_COST_WITH_BID_CAP',
  'COST_CAP',
  'LOWEST_COST_WITH_MIN_ROAS'
] as const
export type MetaBidStrategy = (typeof META_BID_STRATEGIES)[number]

export const META_GENDERS = ['all', 'men', 'women'] as const
export type MetaGender = (typeof META_GENDERS)[number]

export const META_PLACEMENTS = ['advantage_plus', 'manual'] as const
export type MetaPlacement = (typeof META_PLACEMENTS)[number]

export const META_DESTINATION_TYPES = [
  'WEBSITE',
  'MESSENGER',
  'INSTAGRAM_DIRECT',
  'WHATSAPP',
  'APP',
  'PHONE_CALL',
  'ON_AD'
] as const
export type MetaDestinationType = (typeof META_DESTINATION_TYPES)[number]

export const META_AD_FORMATS = ['single_image', 'carousel', 'video', 'collection'] as const
export type MetaAdFormat = (typeof META_AD_FORMATS)[number]

export const META_CALL_TO_ACTIONS = [
  'LEARN_MORE',
  'SHOP_NOW',
  'SIGN_UP',
  'SUBSCRIBE',
  'BOOK_NOW',
  'CONTACT_US',
  'GET_QUOTE',
  'APPLY_NOW',
  'DOWNLOAD',
  'WATCH_MORE',
  'GET_OFFER',
  'ORDER_NOW',
  'SEND_MESSAGE'
] as const
export type MetaCallToAction = (typeof META_CALL_TO_ACTIONS)[number]

export function metaAdStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'active':
      return 'Active'
    case 'paused':
      return 'Paused'
    case 'archived':
      return 'Archived'
    case 'draft':
    default:
      return 'Draft'
  }
}

export function metaObjectiveLabel(objective: string | null | undefined): string {
  switch (objective) {
    case 'OUTCOME_AWARENESS':
      return 'Awareness'
    case 'OUTCOME_TRAFFIC':
      return 'Traffic'
    case 'OUTCOME_ENGAGEMENT':
      return 'Engagement'
    case 'OUTCOME_LEADS':
      return 'Leads'
    case 'OUTCOME_APP_PROMOTION':
      return 'App promotion'
    case 'OUTCOME_SALES':
      return 'Sales'
    default:
      return objective || '—'
  }
}

export function metaOptimizationGoalLabel(goal: string | null | undefined): string {
  switch (goal) {
    case 'REACH':
      return 'Reach'
    case 'IMPRESSIONS':
      return 'Impressions'
    case 'LINK_CLICKS':
      return 'Link clicks'
    case 'LANDING_PAGE_VIEWS':
      return 'Landing page views'
    case 'LEAD_GENERATION':
      return 'Lead generation'
    case 'CONVERSIONS':
      return 'Conversions'
    case 'VALUE':
      return 'Value'
    case 'THRUPLAY':
      return 'ThruPlay'
    case 'POST_ENGAGEMENT':
      return 'Post engagement'
    default:
      return goal || '—'
  }
}

export function metaBidStrategyLabel(strategy: string | null | undefined): string {
  switch (strategy) {
    case 'LOWEST_COST_WITHOUT_CAP':
      return 'Highest volume'
    case 'LOWEST_COST_WITH_BID_CAP':
      return 'Bid cap'
    case 'COST_CAP':
      return 'Cost per result goal'
    case 'LOWEST_COST_WITH_MIN_ROAS':
      return 'ROAS goal'
    default:
      return strategy || '—'
  }
}

export function metaFormatLabel(format: string | null | undefined): string {
  switch (format) {
    case 'single_image':
      return 'Single image'
    case 'carousel':
      return 'Carousel'
    case 'video':
      return 'Video'
    case 'collection':
      return 'Collection'
    default:
      return format || '—'
  }
}

export function metaCtaLabel(cta: string | null | undefined): string {
  if (!cta) return '—'
  return cta
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ')
}

export function metaPlacementLabel(placement: string | null | undefined): string {
  switch (placement) {
    case 'advantage_plus':
      return 'Advantage+ placements'
    case 'manual':
      return 'Manual placements'
    default:
      return placement || '—'
  }
}

export function metaSpecialCategoryLabel(category: string): string {
  switch (category) {
    case 'HOUSING':
      return 'Housing'
    case 'EMPLOYMENT':
      return 'Employment'
    case 'CREDIT':
      return 'Credit'
    case 'ISSUES_ELECTIONS_POLITICS':
      return 'Social issues, elections or politics'
    default:
      return category
  }
}

export function normalizeMetaStatus(value: string | null | undefined): MetaAdStatus {
  if (value && (META_AD_STATUSES as readonly string[]).includes(value)) {
    return value as MetaAdStatus
  }
  return 'draft'
}

export function normalizeMetaObjective(value: string | null | undefined): MetaCampaignObjective {
  if (value && (META_CAMPAIGN_OBJECTIVES as readonly string[]).includes(value)) {
    return value as MetaCampaignObjective
  }
  return 'OUTCOME_LEADS'
}

export function normalizeMetaBudgetType(
  value: string | null | undefined,
  fallback: MetaBudgetType = 'none'
): MetaBudgetType {
  if (value && (META_BUDGET_TYPES as readonly string[]).includes(value)) {
    return value as MetaBudgetType
  }
  return fallback
}

export function normalizeMetaOptimizationGoal(
  value: string | null | undefined
): MetaOptimizationGoal {
  if (value && (META_OPTIMIZATION_GOALS as readonly string[]).includes(value)) {
    return value as MetaOptimizationGoal
  }
  return 'LEAD_GENERATION'
}

export function normalizeMetaCta(value: string | null | undefined): MetaCallToAction {
  if (value && (META_CALL_TO_ACTIONS as readonly string[]).includes(value)) {
    return value as MetaCallToAction
  }
  return 'LEARN_MORE'
}

export function normalizeMetaFormat(value: string | null | undefined): MetaAdFormat {
  if (value && (META_AD_FORMATS as readonly string[]).includes(value)) {
    return value as MetaAdFormat
  }
  return 'single_image'
}

export function normalizeSpecialCategories(value: unknown): MetaSpecialAdCategory[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is MetaSpecialAdCategory =>
    typeof item === 'string' && (META_SPECIAL_AD_CATEGORIES as readonly string[]).includes(item)
  )
}
