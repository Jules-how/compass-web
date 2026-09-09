"use client";

import { use } from "react";
import { OperatorShell } from "@/components/OperatorShell";
import { SequenceEditor } from "@/components/outbound/SequenceEditor";

export default function OutboundEditorCampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { campaignId } = use(params);
  const requestedTab = use(searchParams).tab;
  return (
    <OperatorShell flush width="full">
      <SequenceEditor
        campaignId={campaignId}
        variant="overlay"
        initialTab={requestedTab === "prepare" ? "prepare" : "editor"}
      />
    </OperatorShell>
  );
}
