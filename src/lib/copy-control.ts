/** Copy Control: shared, deterministic planning for the editor, API and agent.
 * Evidence enters through an explicit, conflict-aware boundary. Rendering never researches.
 */
import type { Copy, SignalDefinition, SignalObservation, TemplatePolicy } from './outbound-pipeline';

export const COPY_CONTROL_VERSION = 1 as const;
export const COPY_PARTS = ['subject', 'opener', 'body', 'cta', 'unsubscribe'] as const;
export type CopyPart = typeof COPY_PARTS[number];
export type CopyKind = CopyPart | 'custom';
export const COPY_LABELS: Record<CopyKind, string> = {
  subject: 'Subject', opener: 'Opener', body: 'Body', cta: 'Call to action', unsubscribe: 'Unsubscribe', custom: 'Extra line',
};
export type CopySlot = {
  signal_ids: string[];
  selection: 'priority' | 'strongest';
  required: boolean;
  fallback: string;
};
export type CopyVariant = {
  id: string;
  name: string;
  enabled: boolean;
  mode: 'template' | 'ai';
  text: string;
  instructions: string;
  slots: Record<string, CopySlot>;
  when: { signal_id: string; operator: 'present' | 'equals' | 'contains'; value: string }[];
  match: 'all' | 'any';
};
export type CopyComponent = {
  id: string;
  kind: CopyKind;
  name: string;
  enabled: boolean;
  position: 'after_opener' | 'after_body' | 'after_cta';
  selection: 'priority' | 'auto';
  pinned_variant_id: string | null;
  variants: CopyVariant[];
};
export type CopyExperiment = {
  id: string;
  name: string;
  enabled: boolean;
  component_id: string;
  variant_ids: [string, string];
  salt: string;
};
export type CopyControlConfig = {
  version: typeof COPY_CONTROL_VERSION;
  components: CopyComponent[];
  experiment: CopyExperiment | null;
};
export type CopySignal = {
  id: string;
  category: string;
  value: string;
  evidence_ids: string[];
  source_ids: string[];
  strength: number;
  usefulness: number;
  observed_at: string;
};
export type UsedCopySignal = CopySignal & { slot: string; selection: 'priority' | 'strongest' | 'override' };
export type CopyComponentTrace = {
  component_id: string;
  kind: CopyKind;
  variant_id: string;
  variant_name: string;
  mode: 'template' | 'ai';
  text: string;
  signals: UsedCopySignal[];
  fallback_slots: string[];
};
export type CopyControlTrace = {
  version: typeof COPY_CONTROL_VERSION;
  algorithm: 'copy-control.v1';
  template_version_id: string | null;
  workflow_version_id: string | null;
  list_id: string | null;
  recipient_id: string | null;
  company_id: string | null;
  campaign_id: string | null;
  synthetic: boolean;
  available_signal_ids: string[];
  signal_combination: string[];
  components: CopyComponentTrace[];
  experiment: { id: string; eligible: boolean; arm: string | null; reason: string | null } | null;
  human_edited?: boolean;
};
export type CopyRenderContext = {
  template_version_id?: string;
  workflow_version_id?: string;
  list_id?: string;
  recipient_id?: string;
  company_id?: string;
  campaign_id?: string;
  synthetic?: boolean;
  evidence?: Record<string, CopySignal>;
  /** Keys are component-id/variant-id/slot-name. Overrides select facts, never invent values. */
  overrides?: Record<string, string>;
  generated?: Record<string, string>;
};
export type PendingCopyAI = { component_id: string; variant_id: string; instructions: string; scaffold: string; signals: UsedCopySignal[] };
export type CopyPlan = { copy: Copy; missing: string[]; pending_ai: PendingCopyAI[]; trace: CopyControlTrace };
const strength: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3 };
const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function signalText(value: unknown): string {
  if (['string', 'number', 'boolean'].includes(typeof value)) return String(value);
  if (Array.isArray(value) && value.every(v => ['string', 'number', 'boolean'].includes(typeof v))) return value.map(String).join(', ');
  return '';
}
/** Scope before supersession. An observation from another company/workflow cannot hide a fact. */
export function copySignalInputs(observations: SignalObservation[], definitions: SignalDefinition[], scope?: { company_id: string; workflow_version_id: string }) {
  const scoped = scope ? observations.filter(o => o.company_id === scope.company_id && o.workflow_version_id === scope.workflow_version_id) : observations;
  const superseded = new Set(scoped.map(o => o.supersedes_id).filter(Boolean));
  const allowed = new Map(definitions.filter(d => d.writing_eligible).map(d => [d.id, d]));
  const groups = new Map<string, SignalObservation[]>();
  for (const o of scoped) {
    if (superseded.has(o.id) || !allowed.has(o.signal_id) || !o.source_id || !o.quote?.trim() || !strength[o.evidence_strength] || !strength[o.usefulness] || !signalText(o.value).trim()) continue;
    groups.set(o.signal_id, [...(groups.get(o.signal_id) || []), o]);
  }
  const signals: Record<string, CopySignal> = Object.create(null);
  const conflicts: string[] = [];
  for (const [id, entries] of groups) {
    if (new Set(entries.map(o => signalText(o.value))).size !== 1) { conflicts.push(id); continue; }
    const ranked = [...entries].sort((a, b) => strength[b.evidence_strength] - strength[a.evidence_strength] || strength[b.usefulness] - strength[a.usefulness] || compareText(b.observed_at, a.observed_at) || compareText(a.id, b.id));
    const best = ranked[0];
    signals[id] = {
      id, category: allowed.get(id)?.category?.trim() || `uncategorised:${id}`, value: signalText(best.value),
      evidence_ids: entries.map(o => o.id).sort(compareText), source_ids: [...new Set(entries.map(o => o.source_id))].sort(compareText),
      strength: strength[best.evidence_strength], usefulness: strength[best.usefulness], observed_at: best.observed_at,
    };
  }
  return { signals, conflicts: conflicts.sort(compareText), values: Object.fromEntries(Object.entries(signals).map(([id, s]) => [id, s.value])) };
}
/** FNV-1a over UTF-16: stable in browser, server and tests; not used for security. */
export function copyAssignment(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return hash >>> 0;
}
export function newCopyVariant(id: string, name = 'New variant', text = ''): CopyVariant {
  return { id, name, text, enabled: true, mode: 'template', instructions: '', slots: {}, when: [], match: 'all' };
}
/** Import on an explicit new version. Existing policy and saved drafts are never mutated. */
export function copyControlFromTemplate(policy: TemplatePolicy): CopyControlConfig {
  const slots: Record<string, CopySlot> = Object.fromEntries(Object.entries(policy.slots).map(([key, slot]) => [key, { ...slot, signal_ids: [...slot.signal_ids], selection: 'priority' as const, required: slot.required && !slot.fallback }]));
  return {
    version: COPY_CONTROL_VERSION, experiment: null,
    components: COPY_PARTS.map(kind => ({
      id: kind, kind, name: COPY_LABELS[kind], enabled: true, position: 'after_body', selection: 'priority', pinned_variant_id: null,
      variants: [
        ...(policy.variations || []).map(v => ({ ...newCopyVariant(`${v.id}_${kind}`, v.name, v.copy[kind]), enabled: v.enabled, slots: structuredClone(slots), when: structuredClone(v.when), match: v.match })),
        { ...newCopyVariant(`default_${kind}`, 'Default', policy[kind]), slots: structuredClone(slots), mode: policy.mode === 'ai' && kind !== 'unsubscribe' ? 'ai' : 'template', instructions: policy.ai?.prompt || '' },
      ],
    })),
  };
}
function matches(variant: CopyVariant, signals: Record<string, CopySignal>) {
  if (!variant.when.length) return true;
  const outcomes = variant.when.map(rule => {
    const actual = signals[rule.signal_id]?.value.trim();
    if (!actual) return false;
    if (rule.operator === 'present') return true;
    const expected = rule.value.trim().toLowerCase();
    return Boolean(expected) && (rule.operator === 'equals' ? actual.toLowerCase() === expected : actual.toLowerCase().includes(expected));
  });
  return variant.match === 'all' ? outcomes.every(Boolean) : outcomes.some(Boolean);
}
function evaluate(component: CopyComponent, variant: CopyVariant, signals: Record<string, CopySignal>, context: CopyRenderContext) {
  const missing = new Set<string>();
  const used: UsedCopySignal[] = [];
  const fallbacks: string[] = [];
  const keys = variant.mode === 'ai' ? Object.keys(variant.slots) : [...variant.text.matchAll(/\[\[([a-zA-Z0-9_]+)\]\]/g)].map(m => m[1]);
  const replacements = new Map<string, string>();
  for (const key of new Set(keys)) {
    const slot = variant.slots[key];
    if (!slot) { missing.add(key); continue; }
    const override = context.overrides?.[`${component.id}/${variant.id}/${key}`];
    let candidates = slot.signal_ids.map(id => signals[id]).filter((s): s is CopySignal => Boolean(s?.value.trim()));
    if (override) {
      candidates = candidates.filter(s => s.id === override);
      if (!candidates.length) missing.add(`${key} (invalid override)`);
    } else if (slot.selection === 'strongest') {
      candidates = [...candidates].sort((a, b) => b.strength - a.strength || b.usefulness - a.usefulness || compareText(b.observed_at, a.observed_at) || compareText(a.id, b.id));
    }
    const selected = candidates[0];
    if (selected) {
      if (selected.value.includes('[[') || selected.value.includes(']]')) missing.add(`${key} (variable syntax in source value)`);
      replacements.set(key, selected.value);
      used.push({ ...selected, slot: key, selection: override ? 'override' : slot.selection });
    } else {
      replacements.set(key, slot.required ? '' : slot.fallback);
      if (slot.required) missing.add(key); else fallbacks.push(key);
    }
  }
  const text = variant.text.replace(/\[\[([a-zA-Z0-9_]+)\]\]/g, (_, key: string) => replacements.get(key) || '');
  // A misspelled token must not escape into a send-ready draft.
  const sourceWithoutTokens = variant.text.replace(/\[\[(?:[a-zA-Z0-9_]+|part:[a-zA-Z0-9_-]+)\]\]/g, '');
  if (sourceWithoutTokens.includes('[[') || sourceWithoutTokens.includes(']]')) missing.add('Malformed variable');
  return { variant, text, used, fallbacks, missing: [...missing], condition: matches(variant, signals) };
}
export function renderCopyControl(config: CopyControlConfig, values: Record<string, string>, followups: Copy['followups'], context: CopyRenderContext = {}): CopyPlan {
  const inputs: Record<string, CopySignal> = Object.create(null);
  for (const [id, value] of Object.entries(values)) if (typeof value === 'string' && value.trim()) {
    // Never let metadata change the frozen value of a job or a reviewed preview.
    const evidence = context.evidence?.[id];
    inputs[id] = evidence && evidence.value === value ? evidence : { id, category: `uncategorised:${id}`, value, evidence_ids: [], source_ids: [], strength: 0, usefulness: 0, observed_at: '' };
  }
  const trace: CopyControlTrace = {
    version: COPY_CONTROL_VERSION, algorithm: 'copy-control.v1',
    template_version_id: context.template_version_id || null, workflow_version_id: context.workflow_version_id || null,
    list_id: context.list_id || null, recipient_id: context.recipient_id || null, company_id: context.company_id || null, campaign_id: context.campaign_id || null,
    synthetic: Boolean(context.synthetic), available_signal_ids: Object.keys(inputs).sort(compareText), signal_combination: [], components: [], experiment: null,
  };
  const missing: string[] = [], pending: PendingCopyAI[] = [];
  const rendered = new Map<string, string>();
  const experiment = config.experiment?.enabled ? config.experiment : null;
  for (const component of config.components.filter(c => c.enabled)) {
    const evaluated = component.variants.filter(v => v.enabled).map(v => evaluate(component, v, inputs, context));
    const eligible = evaluated.filter(v => v.condition && !v.missing.length);
    let selected: typeof evaluated[number] | undefined;
    if (experiment?.component_id === component.id) {
      const arms = experiment.variant_ids.map(id => eligible.find(v => v.variant.id === id));
      const unit = context.company_id || context.recipient_id;
      if (arms.every(Boolean) && unit && (context.campaign_id || context.list_id)) {
        const assignment = copyAssignment(JSON.stringify([experiment.id, experiment.salt, context.campaign_id || context.list_id, unit])) % 2;
        selected = arms[assignment];
        trace.experiment = { id: experiment.id, eligible: true, arm: selected!.variant.id, reason: null };
      } else {
        trace.experiment = { id: experiment.id, eligible: false, arm: null, reason: !unit || !(context.campaign_id || context.list_id) ? 'Recipient and campaign/list context required' : 'Both arms must be eligible for a comparable test' };
      }
    }
    if (!selected && component.pinned_variant_id) {
      selected = eligible.find(v => v.variant.id === component.pinned_variant_id);
      if (!selected) { missing.push(`${component.name}: pinned variant unavailable`); continue; }
    }
    if (!selected) {
      const ranked = component.selection === 'auto' ? [...eligible].sort((a, b) => new Set(b.used.map(s => s.id)).size - new Set(a.used.map(s => s.id)).size || b.used.reduce((n, s) => n + s.strength, 0) - a.used.reduce((n, s) => n + s.strength, 0) || compareText(a.variant.id, b.variant.id)) : eligible;
      selected = ranked[0];
    }
    if (!selected) {
      const reasons = evaluated.filter(v => v.condition).flatMap(v => v.missing);
      missing.push(`${component.name}: ${reasons.length ? [...new Set(reasons)].join(', ') : 'no enabled matching variant'}`);
      continue;
    }
    const { variant, used, fallbacks } = selected;
    let text = selected.text;
    if (variant.mode === 'ai') {
      if (Object.hasOwn(context.generated || {}, component.id)) {
        text = context.generated![component.id].trim();
        if (!text || text.includes('[[') || text.includes(']]')) missing.push(`${component.name}: AI output is empty or contains unresolved variables`);
      } else {
        pending.push({ component_id: component.id, variant_id: variant.id, instructions: variant.instructions, scaffold: text, signals: used });
        text = '';
      }
    }
    trace.components.push({ component_id: component.id, kind: component.kind, variant_id: variant.id, variant_name: variant.name, mode: variant.mode, text, signals: used, fallback_slots: fallbacks });
    rendered.set(component.id, text);
  }
  // Body references insert a complete component once; cycles/unknown references hold the draft.
  const consumed = new Set<string>();
  const resolved = new Map<string, string>();
  const expand = (id: string, trail: string[] = []): string => {
    if (trail.includes(id)) { missing.push(`Circular component reference: ${[...trail, id].join(' → ')}`); return ''; }
    if (!rendered.has(id)) { missing.push(`Unknown or disabled component: ${id}`); return ''; }
    if (resolved.has(id)) return resolved.get(id)!;
    const text = rendered.get(id)!.replace(/\[\[part:([a-zA-Z0-9_-]+)\]\]/g, (_, target: string) => {
      const targetComponent = config.components.find(c => c.id === target);
      if (id !== 'body' || !targetComponent || ['subject', 'body', 'unsubscribe'].includes(targetComponent.kind)) { missing.push(`Unsupported component reference: ${id} → ${target}`); return ''; }
      consumed.add(target);
      return expand(target, [...trail, id]);
    });
    resolved.set(id, text);
    return text;
  };
  // Expand body first so top-level blocks do not duplicate its embedded components.
  if (rendered.has('body')) expand('body');
  for (const id of rendered.keys()) expand(id);
  const block = (kind: CopyPart) => config.components.find(c => c.kind === kind)?.id || kind;
  const copy: Copy = { subject: resolved.get(block('subject')) || '', opener: '', body: '', cta: '', unsubscribe: resolved.get(block('unsubscribe')) || '', followups: structuredClone(followups), copy_control: trace };
  for (const kind of ['opener', 'body', 'cta'] as const) copy[kind] = consumed.has(block(kind)) ? '' : resolved.get(block(kind)) || '';
  for (const component of config.components.filter(c => c.kind === 'custom' && c.enabled && !consumed.has(c.id))) {
    const target = component.position === 'after_opener' ? 'opener' : component.position === 'after_cta' ? 'cta' : 'body';
    copy[target] = [copy[target], resolved.get(component.id)].filter(Boolean).join('\n\n');
  }
  if (/[\r\n]/.test(copy.subject) || copy.subject.length > 500) missing.push('Subject must be one line, at most 500 characters');
  if ([copy.subject, copy.opener, copy.body, copy.cta, copy.unsubscribe].some(text => text.includes('[[') || text.includes(']]'))) missing.push('Unresolved variables in rendered copy');
  if (!copy.unsubscribe.trim() && !pending.some(p => p.component_id === block('unsubscribe'))) missing.push('Unsubscribe text is required');
  if (!copy.subject.trim() && !pending.some(p => p.component_id === block('subject'))) missing.push('Subject text is required');
  trace.signal_combination = [...new Set(trace.components.flatMap(c => c.signals.map(s => s.category)))].sort(compareText);
  return { copy, trace, missing: [...new Set(missing)], pending_ai: pending };
}
export function copyControlNeedsAI(config?: CopyControlConfig): boolean {
  return Boolean(config?.components.some(c => c.enabled && c.variants.some(v => v.enabled && v.mode === 'ai')));
}
export function copyControlIssues(config: CopyControlConfig): string[] {
  const issues: string[] = [];
  const componentIds = config.components.map(c => c.id);
  if (new Set(componentIds).size !== componentIds.length) issues.push('Component IDs must be unique.');
  for (const kind of COPY_PARTS) {
    const components = config.components.filter(c => c.kind === kind);
    if (components.length !== 1 || components[0].id !== kind) issues.push(`Exactly one ${COPY_LABELS[kind]} component is required, with its standard ID.`);
    if (['subject', 'unsubscribe'].includes(kind) && !components[0]?.enabled) issues.push(`${COPY_LABELS[kind]} cannot be disabled.`);
  }
  const variantIds = config.components.flatMap(c => c.variants.map(v => v.id));
  if (new Set(variantIds).size !== variantIds.length) issues.push('Variant IDs must be unique across components.');
  for (const component of config.components) {
    if (!component.name.trim()) issues.push('Name every component.');
    if (component.enabled && !component.variants.some(v => v.enabled)) issues.push(`${component.name} needs an enabled variant.`);
    if (component.pinned_variant_id && !component.variants.some(v => v.id === component.pinned_variant_id && v.enabled)) issues.push(`${component.name}: the pinned variant is missing or disabled.`);
    for (const variant of component.variants) {
      if (!variant.name.trim()) issues.push(`${component.name}: name every variant.`);
      if (variant.enabled && variant.mode === 'ai' && !variant.instructions.trim()) issues.push(`${component.name} / ${variant.name}: add AI instructions.`);
      for (const [key, slot] of Object.entries(variant.slots)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) issues.push('Choose a different variable name.');
        if (slot.required && slot.fallback) issues.push(`${variant.name}: required variable ${key} cannot use fallback text.`);
        if (new Set(slot.signal_ids).size !== slot.signal_ids.length) issues.push(`${variant.name}: ${key} has duplicate signal choices.`);
      }
    }
  }
  if (config.experiment?.enabled) {
    const experiment = config.experiment, component = config.components.find(c => c.id === experiment.component_id && c.enabled);
    if (!experiment.id.trim() || !experiment.name.trim() || !experiment.salt.trim()) issues.push('Give the experiment a name and stable identity.');
    if (!component || experiment.variant_ids[0] === experiment.variant_ids[1] || experiment.variant_ids.some(id => !component.variants.some(v => v.id === id && v.enabled))) issues.push('A/B testing needs two different enabled variants in the same enabled component.');
    if (component?.pinned_variant_id) issues.push('Unpin the tested component before enabling A/B assignment.');
  }
  return [...new Set(issues)];
}

export type CopyOutcome = {
  source_event_id: string;
  message_id: string;
  campaign_id: string;
  draft_id: string;
  type: 'sent' | 'delivered' | 'bounced' | 'reply' | 'positive_reply' | 'booking';
  occurred_at: string;
  provider: string;
  automatic: boolean;
};
export type AttributedCopyOutcome = CopyOutcome & { trace: CopyControlTrace };
export type CopyMetricRow = { key: string; signals: string[]; sent: number; delivered: number; bounced: number; replies: number; positive_replies: number; bookings: number; response_rate: number | null; positive_rate: number | null; unmatched: number };
/** Event counts are unique initial messages, not regenerations, opens or exported rows.
 * Delivery is explicit only. Replies are not used to fabricate missing delivery events.
 */
export function copyControlMetrics(events: AttributedCopyOutcome[], group: 'signals' | 'variant' | 'mode' | 'experiment' = 'signals'): CopyMetricRow[] {
  const messages = new Map<string, { trace: CopyControlTrace; campaign: string; events: Set<string> }>();
  for (const event of events) {
    if (event.trace.synthetic || event.trace.human_edited || (group === 'experiment' && !event.trace.experiment?.eligible) || event.automatic && ['reply', 'positive_reply', 'booking'].includes(event.type)) continue;
    const key = JSON.stringify([event.provider, event.campaign_id, event.message_id, event.draft_id]);
    const message = messages.get(key) || { trace: event.trace, campaign: event.campaign_id, events: new Set<string>() };
    message.events.add(event.type); messages.set(key, message);
  }
  const rows = new Map<string, CopyMetricRow>();
  for (const message of messages.values()) {
    const signals = [...message.trace.signal_combination].sort(compareText);
    const key = group === 'experiment' ? JSON.stringify([message.campaign, message.trace.list_id, message.trace.experiment?.id, message.trace.template_version_id, message.trace.experiment?.arm]) : group === 'signals' ? JSON.stringify(signals) : group === 'variant' ? JSON.stringify(message.trace.components.map(c => [c.component_id, c.variant_id])) : JSON.stringify(message.trace.components.map(c => [c.component_id, c.mode]));
    const row = rows.get(key) || { key, signals, sent: 0, delivered: 0, bounced: 0, replies: 0, positive_replies: 0, bookings: 0, response_rate: null, positive_rate: null, unmatched: 0 };
    const delivered = message.events.has('delivered') && !message.events.has('bounced');
    const replied = message.events.has('reply') || message.events.has('positive_reply');
    if (message.events.has('sent')) row.sent++;
    if (delivered) row.delivered++;
    if (message.events.has('bounced')) row.bounced++;
    if (replied) row.replies++;
    if (message.events.has('positive_reply')) row.positive_replies++;
    if (message.events.has('booking')) row.bookings++;
    if (!delivered && (replied || message.events.has('booking'))) row.unmatched++;
    rows.set(key, row);
  }
  // A missing denominator is unknown, not zero; incomplete imported events are not a valid rate.
  for (const row of rows.values()) if (row.delivered > 0 && !row.unmatched) {
    row.response_rate = row.replies / row.delivered;
    row.positive_rate = row.positive_replies / row.delivered;
  }
  return [...rows.values()].sort((a, b) => b.delivered - a.delivered || compareText(a.key, b.key));
}
/** Keep the legacy envelope readable while the versioned component policy is authoritative. */
export function studioTemplate(policy: TemplatePolicy, config: CopyControlConfig): TemplatePolicy {
  const defaults = Object.fromEntries(COPY_PARTS.map(kind => {
    const variants = config.components.find(c => c.kind === kind)?.variants || [];
    const defaultVariant = [...variants].reverse().find(v => v.enabled && !v.when.length) || variants.find(v => v.enabled);
    return [kind, defaultVariant?.text || policy[kind]];
  })) as Record<CopyPart, string>;
  return { ...policy, ...defaults, mode: 'deterministic', variations: [], copy_control: config };
}
