"use client";

import { OutboundOverview } from "@/components/outbound/OutboundOverview";
import { useConsoleNav } from "@/components/ConsoleNav";
import { loadOutboundRhythm } from "@/lib/console-destinations";
import { ActivePane } from "@/components/ActivePane";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CampaignPlanner } from "@/components/campaigns/CampaignPlanner";
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
  readOutboundDesk,
  writeOutboundDesk,
  type OutboundDeskId,
} from "@/lib/outbound-desk";
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
  const [plannerViews, setPlannerViews] = useState<{ calendar: "calendar" | "timeline" | "list" | "board"; timeline: "calendar" | "timeline" | "list" | "board" }>({ calendar: "calendar", timeline: "timeline" });
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

  useEffect(() => {
    const saved = new URLSearchParams(window.location.search).has("campaign") ? "overview" : readOutboundDesk();
    setDeskState(saved);
    setVisited(new Set([saved]));
    setReady(true);
  }, []);

  const setDesk = useCallback((next: OutboundDeskId) => {
    setDeskState(writeOutboundDesk(next));
    setVisited(previous => new Set([...previous, next]));
  }, []);

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

  const switcher = <div className="flex flex-wrap items-center gap-3"><OutboundDeskSwitch value={desk} onChange={setDesk} /><Link className="compass-btn-primary" href="/sales/outbound/rhythm" onMouseEnter={() => { void loadOutboundRhythm(); }} onFocus={() => { void loadOutboundRhythm(); }} onClick={event => { if (!navigation || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); void loadOutboundRhythm(); navigation.navigate("/sales/outbound/rhythm"); }}>Today & follow-ups</Link></div>;

  if (!ready) {
    return (
      <OperatorShell title="Outbound" width="full">
        {null}
      </OperatorShell>
    );
  }

  return (
    <OperatorShell title="Outbound" width="full" actions={<div className="flex flex-wrap items-end gap-3">{switcher}<details className="folio-pace"><summary>Weekly pace</summary><div><CadenceControl slots={slots} prefs={prefs} onChange={setPrefs} /></div></details></div>}>
      {campaignsQuery.error && <p role="alert">Could not refresh campaigns. Previously loaded campaigns remain visible.</p>}
      {(["overview", "notebook", "waves", "calendar", "timeline"] as const).map(tab => visited.has(tab) ? (
        <div key={tab} hidden={desk !== tab} inert={desk !== tab ? true : undefined}>
          <ActivePane active={desk === tab}>
            {tab === "overview" ? <OutboundOverview /> : tab === "notebook" ? <OutboundNotebook campaigns={campaignsQuery.data?.campaigns ?? []} /> : tab === "waves" ? <OfferWavesBoard /> : <CampaignPlanner initialView={tab} view={plannerViews[tab]} onViewChange={view => setPlannerViews(previous => ({ ...previous, [tab]: view }))} />}
          </ActivePane>
        </div>
      ) : null)}
    </OperatorShell>
  );
}
