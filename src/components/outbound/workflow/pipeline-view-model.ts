import type { PipelineCompany, PipelineStage } from '@/lib/outbound-pipeline';

export const PIPELINE_STAGE_INFO: Record<PipelineStage, { label: string; title: string; description: string; action: string }> = {
  list: { label: 'Companies', title: 'Build your working list', description: 'Filter existing companies, then add the ones you need to a list.', action: 'Select for research' },
  research: { label: 'Research', title: 'Find the right companies', description: 'Review ICP fit, supporting evidence and the signals available for personalisation.', action: 'Queue research' },
  contacts: { label: 'Find people', title: 'Find the right people', description: 'Open a company to inspect names, work emails, phone numbers and social profiles.', action: 'Queue contact sourcing' },
  verify: { label: 'Check emails', title: 'Check email addresses', description: 'Open a company to review each email’s verification result. Phone-only leads stay available.', action: 'Queue verification' },
  write: { label: 'Write', title: 'Prepare personalised emails', description: 'Choose a template, inspect each recipient’s copy, then export or prepare a paused campaign.', action: 'Queue writing' },
};

export function formatCompanyLocation(company: Pick<PipelineCompany, 'suburb' | 'city' | 'administrative_region' | 'country'>): string {
  const values = [company.suburb, company.city, company.administrative_region, company.country];
  const seen = new Set<string>();
  return values.filter((value): value is string => {
    if (!value?.trim() || value.trim().toUpperCase() === 'ZZ') return false;
    const key = value.trim().toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(value => value.trim()).join(', ') || 'Location not recorded';
}

/** This presentation never upgrades qualification or changes a persisted outcome. */
export function companyStagePresentation(company: Pick<PipelineCompany, 'stage_status' | 'reason'>, stage: PipelineStage) {
  const reason = company.reason?.trim() || '';
  const hasResult = Boolean(company.stage_status) && !(['held', 'ready'].includes(company.stage_status || '') && reason.toLowerCase() === 'not started');
  if (!hasResult) {
    const task = stage === 'list' || stage === 'research' ? 'Research' : stage === 'contacts' ? 'Contact sourcing' : stage === 'verify' ? 'Verification' : 'Writing';
    return { status: 'not_started', reason: reason && reason.toLowerCase() !== 'not started' ? reason : `${task} has not run for this view.` };
  }
  return { status: company.stage_status!, reason: reason || 'Open the company to inspect its recorded outcome.' };
}

export function pipelineRunBlocker(input: {
  writable: boolean; busy: boolean; uncertain: boolean; loading: boolean; error: string;
  stage: PipelineStage; listId: string; workflowId: string; templateId: string;
  selectedCount: number; allMatching: boolean; total: number;
  requiresVerificationRun: boolean; verificationRunId: string;
}): string {
  if (!input.writable) return 'This workspace is read-only.';
  if (input.uncertain) return 'Confirm the previous save before starting more work.';
  if (input.busy) return 'Wait for the current change to finish.';
  if (!input.listId) return 'Choose or create a working list first.';
  if (!input.workflowId) return 'Choose or create a research workflow above.';
  if (input.stage === 'list') return 'Open Research to start qualifying this list.';
  if (input.loading || input.error) return 'Wait for this view to load successfully before starting work.';
  if (input.allMatching ? input.total === 0 : input.selectedCount === 0) return 'Select the companies or recipients to process.';
  if (input.stage === 'write' && !input.templateId) return 'Choose or save a writing template above.';
  if (input.stage === 'write' && input.requiresVerificationRun && !input.verificationRunId) return 'Choose a completed verification run before writing.';
  return '';
}
