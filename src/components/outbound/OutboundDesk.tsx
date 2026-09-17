"use client";

import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
const WorkflowWorkspace = dynamic(
  () =>
    import("@/components/outbound/workflow/WorkflowWorkspace").then(
      (m) => m.WorkflowWorkspace,
    ),
  { ssr: false },
);

import { OutboundWorkspace } from "@/components/outbound/OutboundWorkspace";
import { OutboundOverview } from "@/components/outbound/OutboundOverview";
import { useConsoleNav } from "@/components/ConsoleNav";
import { loadOutboundRhythm } from "@/lib/console-destinations";
import { ActivePane } from "@/components/ActivePane";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./workflow/pipeline-repair.css";
import { TestPlanner } from "@/components/outbound/TestPlanner";
import { OperatorShell } from "@/components/OperatorShell";
import {
  CadenceControl,
  useCadencePrefs,
} from "@/components/outbound/CadenceControl";
import { OutboundDeskSwitch } from "@/components/outbound/OutboundDeskSwitch";
import { OutboundNotebook } from "@/components/outbound/OutboundNotebook";
import { OfferWavesBoard } from "@/components/outbound/OfferWavesBoard";
import { CAMPAIGNS_QUERY_KEY } from "@/lib/campaigns-client";
import { dateOnlyInZone, type CompassCampaign } from "@/lib/campaigns";
import { mondayOfWeek, mondayWeeksAhead } from "@/lib/campaign-queue";
import {
  DEFAULT_OUTBOUND_DESK,
  resolveOutboundDesk,
  writeOutboundDesk,
  type OutboundDeskId,
} from "@/lib/outbound-desk";
import type { PipelineCapabilities } from "@/lib/outbound-pipeline";
import { useCachedJson } from "@/lib/use-cached-json";

type CampaignsPayload = { campaigns: CompassCampaign[] };

function campaignDateOnly(campaign: CompassCampaign): string | null {
  if (campaign.go_live_at) return dateOnlyInZone(campaign.go_live_at);
  const start = (campaign.start_date || "").trim();
  return start ? start.slice(0, 10) : null;
}

export function OutboundDesk() {
  const navigation = useConsoleNav();
  const [desk, setDeskState] = useState<OutboundDeskId>(DEFAULT_OUTBOUND_DESK);
  const searchParams = useSearchParams();
  const router = useRouter();
  const leadQuery = useRef("desk=workflow");
  useEffect(() => {
    if (searchParams.get("desk") === "workflow" || (!searchParams.get("desk") && desk === "workflow")) leadQuery.current = searchParams.toString();
  }, [desk, searchParams]);
  const [visited, setVisited] = useState<Set<OutboundDeskId>>(new Set());
  const [ready, setReady] = useState(false);
  const [prefs, setPrefs] = useCadencePrefs();
  const campaignsQuery = useCachedJson<CampaignsPayload>(
    CAMPAIGNS_QUERY_KEY,
    "/api/campaigns",
    {
      staleMs: 30_000,
    },
  );

  const capabilities=useCachedJson<PipelineCapabilities>("/api/operator/outbound/pipeline/capabilities","/api/operator/outbound/pipeline/capabilities",{staleMs:30_000});
  const pipelineReady=Boolean(capabilities.data?.enabled&&capabilities.data?.schema_ready&&capabilities.data?.surface_ready);
  useEffect(() => {
    if(capabilities.loading)return;
    const saved = resolveOutboundDesk(searchParams.toString(),pipelineReady);
    setDeskState(saved);
    setVisited(previous => new Set([...previous, saved]));
    setReady(true);
  }, [searchParams,pipelineReady,capabilities.loading]);

  const setDesk = useCallback((next: OutboundDeskId) => {
    setDeskState(writeOutboundDesk(next));
    setVisited((previous) => new Set([...previous, next]));
    const query = next === "workflow" ? new URLSearchParams(leadQuery.current) : new URLSearchParams();
    query.set("desk", next);
    router.push(`/sales/outbound?${query}`, { scroll: false });
  }, [router]);

  const slots = useMemo(() => {
    const today = dateOnlyInZone(new Date().toISOString());
    const thisMonday = mondayOfWeek(today);
    const nextMonday = mondayWeeksAhead(today, 1);
    return (campaignsQuery.data?.campaigns ?? []).filter((campaign) => {
      const dateOnly = campaignDateOnly(campaign);
      return Boolean(
        dateOnly && dateOnly >= thisMonday && dateOnly < nextMonday,
      );
    }).length;
  }, [campaignsQuery.data]);

  const switcher = (
    <div className="flex flex-wrap items-center gap-3">
      <OutboundDeskSwitch value={desk} onChange={setDesk} />
      <Link className="compass-btn-secondary" href="/sales/outbound/calling">Calling</Link>
      <details className="op-desk-menu">
        <summary>More tools ▾</summary>
        <nav aria-label="Other outbound tools">
          <Link href="/sales/outbound/rhythm" onMouseEnter={() => { void loadOutboundRhythm(); }} onFocus={() => { void loadOutboundRhythm(); }} onClick={event => {
            if (!navigation || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault(); void loadOutboundRhythm(); navigation.navigate("/sales/outbound/rhythm");
          }}>Today & follow-ups</Link>
          <Link href="/sales/outbound/craft">Writing library</Link>
          <Link href="/sales/offers">Offers & tests</Link>
          <Link href="/calendar">Calendar</Link>
          <Link href="/sales">Sales overview</Link>
        </nav>
      </details>
    </div>
  );

  if (!ready) {
    return (
      <OperatorShell title="Outbound" width="full" hideRelatedLinks>
        <div role="status" style={{ minHeight: 420 }}>Loading Outbound…</div>
      </OperatorShell>
    );
  }

  return (
    <OperatorShell
      title="Outbound"
      width="full"
      hideRelatedLinks
      actions={
        <div className="flex flex-wrap items-end gap-3">
          {switcher}
          {(
            <details className="folio-pace">
              <summary>Weekly pace</summary>
              <div>
                <CadenceControl
                  slots={slots}
                  prefs={prefs}
                  onChange={setPrefs}
                />
              </div>
            </details>
          )}
        </div>
      }
    >
      {!pipelineReady&&desk==='overview'&&<p className="mb-4 flex flex-wrap items-center gap-3 text-sm" role="status">{capabilities.error?"Lead table readiness could not be confirmed. The operational overview remains available.":"The lead table rollout is not enabled yet. The existing operational overview remains available."} <button className="compass-btn-secondary" onClick={()=>void capabilities.reload(true)}>Check rollout</button></p>}
      {campaignsQuery.error && (
        <p role="alert">
          Could not refresh campaigns. Previously loaded campaigns remain
          visible.
        </p>
      )}
      {(
        [
          "overview",
          "workflow",
          "evidence",
          "notebook",
          "waves",
          "calendar",
        ] as const
      ).map((tab) =>
        visited.has(tab) ? (
          <div
            key={tab}
            hidden={desk !== tab}
            inert={desk !== tab ? true : undefined}
          >
            <ActivePane active={desk === tab}>
              {tab === "workflow" ? (
                <WorkflowWorkspace />
              ) : tab === "overview" ? (
                <OutboundWorkspace onEvidence={() => setDesk("evidence")} />
              ) : tab === "evidence" ? (
                <OutboundOverview />
              ) : tab === "notebook" ? (
                <OutboundNotebook
                  campaigns={campaignsQuery.data?.campaigns ?? []}
                />
              ) : tab === "waves" ? (
                <OfferWavesBoard />
              ) : (
                <TestPlanner />
              )}
            </ActivePane>
          </div>
        ) : null,
      )}
    </OperatorShell>
  );
}
