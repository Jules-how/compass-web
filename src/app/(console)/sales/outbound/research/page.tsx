import { OperatorShell } from "@/components/OperatorShell";
import { OutboundResearch } from "@/components/outbound/OutboundResearch";
import sources from "@/lib/outbound-research.json";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <OperatorShell title="Outbound research" width="full">
      <OutboundResearch sources={sources} />
    </OperatorShell>
  );
}
