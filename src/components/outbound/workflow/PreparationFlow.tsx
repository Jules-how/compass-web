"use client";
import { Building2, ScanSearch, Users, ShieldCheck, PenLine } from "lucide-react";
import type { PipelineStage } from "@/lib/outbound-pipeline";
import type { MarketIndex } from "@/lib/outbound-market";
const steps = [
  { id: 'list', label: 'Companies', hint: 'Choose a market and ICP', icon: Building2 },
  { id: 'research', label: 'Research', hint: 'Qualify fit · collect signals', icon: ScanSearch },
  { id: 'contacts', label: 'Find people', hint: 'Names and contact routes', icon: Users },
  { id: 'verify', label: 'Check emails', hint: 'Mailbox results and holds', icon: ShieldCheck },
  { id: 'write', label: 'Write', hint: 'Variations · recipient drafts', icon: PenLine },
] as const;
export function PreparationFlow({ stage, onChange, data, loading }: { stage: PipelineStage; onChange: (stage: PipelineStage) => void; data: MarketIndex | null; loading: boolean }) {
  return <div className="op-preparation-flow">
    <nav aria-label="Outbound preparation steps">{steps.map((step, index) => {
      const Icon = step.icon;
      const count = step.id === 'list' ? data?.total : data?.list_id ? data.progress[step.id] : undefined;
      return <button type="button" key={step.id} aria-current={stage === step.id ? 'step' : undefined} onClick={() => onChange(step.id)}>
        <span className="op-flow-icon"><Icon size={17} aria-hidden="true" /></span><span className="op-flow-copy"><strong>{index + 1}. {step.label}</strong><small>{step.hint}</small><span>{loading ? 'Checking progress…' : count === undefined ? 'Choose a working list' : step.id === 'list' ? `${count.toLocaleString()} accounts` : `${count.toLocaleString()} of ${data?.total || 0} accounts completed`}</span></span>
      </button>;
    })}</nav>
    <p>Move between steps freely. Completion counts use the selected list’s saved workflow and current company inputs; they do not mean an email was sent.</p>
  </div>;
}
export function VerificationGuide() {
  return <section className="op-status-guide" aria-label="What email verification means">
    <h3>Verification checks an email address—not whether the person wants your offer.</h3>
    <div><p><strong>Valid</strong><span>Provider reports a deliverable mailbox. Other eligibility checks still apply.</span></p><p><strong>Unverified</strong><span>No completed check. Queue verification before preparing copy.</span></p><p><strong>Unknown / catch-all / risky</strong><span>A check could not establish a safe mailbox. Held for review, not silently approved.</span></p><p><strong>Invalid</strong><span>Do not use this address. Find another contact route.</span></p></div>
    <p>“Held” is a workflow decision, not a mailbox result. Open a company to see the exact reason, provider and check date.</p>
  </section>;
}
