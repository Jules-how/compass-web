"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw, ArrowUpRight } from "lucide-react";
import { useActivePane } from "@/components/ActivePane";
import { onWorkChanged } from "@/lib/workspace-change";
import { safeLink } from "@/lib/operating-core";
import type { OutboundOverview as Snapshot } from "@/lib/outbound-overview-core";
import styles from "./OutboundOverview.module.css";
const number = (n: number | null | undefined) => n == null ? "Unknown" : n.toLocaleString();
const time = (v: string | null | undefined) => v && Number.isFinite(Date.parse(v)) ? new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", ...(/^\d{4}-\d{2}-\d{2}$/.test(v) ? {} : { timeStyle: "short" as const }) }).format(new Date(v)) : "Not checked";
export function OutboundOverview({ compact = false }: { compact?: boolean }) {
  const active = useActivePane();
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  const load = useCallback(async (force = false) => {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try {
      const response = await fetch("/api/outbound/overview", { method: force ? "POST" : "GET", cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Outbound could not be read.");
      if (mounted.current) { setData(body); setError(""); }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Refresh failed."); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!active) return;
    const update = () => { if (document.visibilityState === "visible") void load(); };
    update();
    const timer = setInterval(update, 60000);
    const unsubscribe = onWorkChanged(update);
    window.addEventListener("focus", update);
    window.addEventListener("outbound-rhythm-changed", update);
    document.addEventListener("visibilitychange", update);
    return () => { clearInterval(timer); unsubscribe(); window.removeEventListener("focus", update); window.removeEventListener("outbound-rhythm-changed", update); document.removeEventListener("visibilitychange", update); };
  }, [load, active]);
  const actions = data?.recommendations.filter(a => a.state !== "blocked" && a.state !== "scheduled") || [];
  return <section className={`${styles.overview} ${compact ? styles.compact : ""}`} aria-label={compact ? "Outbound activity" : "Outbound overview"} aria-busy={busy}>
    <header className={styles.header}>
      <div><h2>{compact ? "Outbound" : "What’s happening, and what’s next"}</h2>{!compact ? <p>Shared campaign evidence and recorded next actions.</p> : null}</div>
      <div className={styles.controls}>
        {compact ? <Link href="/sales/outbound">Open Outbound <ArrowUpRight size={14} aria-hidden="true" /></Link> : <Link href="/sales/outbound/rhythm">Calls & follow-ups</Link>}
        <button type="button" className="compass-btn-secondary" disabled={busy} onClick={() => void load(true)}><RefreshCw size={14} aria-hidden="true" />{busy ? "Checking…" : "Refresh"}</button>
      </div>
    </header>
    {error ? <p className={styles.warning} role="alert">{error} {data ? "Previous view retained; it may be out of date." : ""} <button type="button" onClick={() => void load()} disabled={busy}>Retry</button></p> : null}
    {!data ? <p role="status">{busy ? "Reading campaign and activity records…" : "No snapshot available."}</p> : <>
      <p className={styles.meta}>{compact ? `Checked ${time(data.checked_at)} · Sydney` : `Read ${time(data.checked_at)} · Sydney time. Provider observations refresh after five minutes; each campaign shows its own check time.`}</p>
      {data.coverage.calls_error || data.coverage.activity_error ? <p role="alert" className={styles.warning}>{data.coverage.calls_error} {data.coverage.activity_error}</p> : null}
      <div className={styles.activity}>
        {data.activity.map(a => <section key={a.day}><h3>{a.day === data.day ? "Today" : "Yesterday"} <small>{a.day}</small></h3><p><strong>{number(a.email_sends)}</strong> recorded email sends · <strong>{number(a.calls)}</strong> calls · <strong>{number(a.replies)}</strong> replies · <strong>{number(a.meetings)}</strong> meetings booked</p></section>)}
      </div>
      <p className={styles.meta}>{compact ? "Recorded activity. Open Outbound for source coverage." : data.coverage.message}{data.coverage.activity === "partial" ? " The activity limit was reached; counts are incomplete." : ""}{data.coverage.undated_events ? ` ${data.coverage.undated_events} events have unverified dates and are excluded.` : ""}</p>
      {!compact ? <section className={styles.section}>
        <h3>Recommended next actions</h3>
        <p className={styles.meta}>{data.accepted_order_preserved ? "Your reviewed task order is preserved. Other recommendations remain proposals." : "Suggested from current records. Your accepted day and campaign permissions stay in force."}</p>
        <ol className={styles.actions}>
          {(compact ? actions.slice(0, 3) : actions).map((a, i) => <li key={a.id}>
            <span className={styles.index} aria-hidden="true">{i + 1}</span><div><Link href={a.href}>{a.title}</Link><p>{a.reason}</p><small>{a.state === "accepted" ? "Recorded commitment" : "Proposed"}{a.due ? ` · Due ${time(a.due)}` : ""}</small>
              {!compact && a.lead_ids.length ? <details><summary>{a.lead_ids.length} source contacts</summary><ul>{a.lead_ids.map(id => <li key={id}><Link href={`/sales/outbound/rhythm?lead=${encodeURIComponent(id)}`}>Open contact {id}</Link></li>)}</ul></details> : null}
            </div>
          </li>)}
        </ol>
        {!actions.length ? <p>No actionable recommendation is established by the current records. Review missing sources and capture outstanding promises.</p> : null}
      </section> : null}
      {!compact ? <>
        <section className={styles.section}><h3>Campaigns</h3><p className={styles.meta}>Provider activity and preparation receipts are separate. Loaded receipts are not added to the provider’s recipient total.</p>
          {!data.campaigns.length ? <p>No current-offer campaign records found.</p> : null}
          {data.campaigns.map(c => <article className={styles.campaign} id={`outbound-campaign-${c.id}`} key={c.id}>
            <header><h4>{c.name}</h4><span className={styles.badge}>{c.freshness === "current" && !c.refresh_error ? "" : "Last observed: "}{c.provider_status}</span></header>
            <p className={styles.meta}>Provider checked {time(c.provider?.observed_at)} · {c.freshness} · Compass plan: {c.status}</p>
            {c.refresh_error ? <p className={styles.warning}>{c.refresh_error}</p> : null}
            <dl className={styles.metrics}>
              {[["Prepared for review", c.prepared_count], ["Loaded (receipts)", c.loaded_receipt_count], ["Loaded (provider)", c.provider?.loaded], ["People contacted", c.provider?.contacted], ["Emails sent", c.provider?.sent], ["Replies", c.provider?.replies]].map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{number(value as number | null | undefined)}</dd></div>)}
            </dl>
            {c.overlapping_stage_count ? <p className={styles.meta}>{c.overlapping_stage_count} contacts moved from preparation to loaded receipts and are counted once in preparation status.</p> : null}
            {c.instantly_campaign_id ? <a className="compass-btn-secondary" href={c.href} target="_blank" rel="noreferrer">Open in Instantly <ArrowUpRight size={14} aria-hidden="true" /></a> : <p>Not connected to an Instantly campaign.</p>}
            {c.preparations.length ? <details><summary>Preparation records and review materials</summary>{c.preparations.map(p => <section key={p.id} className={styles.preparation}><strong>{p.data.title || p.id}</strong><p>{p.data.status} · {p.data.lead_ids?.length || 0} recorded contacts</p><p className={styles.meta}>{p.data.source || "Source not recorded"}</p>{p.data.url && safeLink(p.data.url) ? <a href={p.data.url}>Open review materials</a> : null}</section>)}</details> : null}
          </article>)}
        </section>
        {data.recommendations.some(a => a.state === "scheduled") ? <details className={styles.section}><summary>Upcoming commitments</summary>{data.recommendations.filter(a => a.state === "scheduled").map(a => <p key={a.id}><Link href={a.href}>{a.title}</Link> · {time(a.due)}</p>)}</details> : null}
        {data.recommendations.some(a => a.state === "blocked") ? <details className={styles.section}><summary>Blocked next actions</summary>{data.recommendations.filter(a => a.state === "blocked").map(a => <p key={a.id}><Link href={a.href}>{a.title}</Link> · {a.reason}</p>)}</details> : null}
        <details className={styles.section}><summary>Recorded activity and source coverage</summary>{data.activity.map(a => <section key={a.day}><h4>{a.day}</h4><ul>{a.events.map(e => <li key={e.id}>{e.lead_id ? <Link href={`/sales/outbound/rhythm?lead=${encodeURIComponent(e.lead_id)}`}>{e.company || "Contact record"}</Link> : <span>Verified sent message</span>} · {e.channel} · {e.outcome} · {time(e.at)}</li>)}</ul></section>)}<p>Call coverage: {data.coverage.calls}. Unrecorded conversations must be captured before they can inform the queue.</p>{data.sources.filter(s => ["source:instantly", "source:outbound-email-history"].includes(s.id)).map(s => <p key={s.id}>{s.data.status} · {s.data.coverage} {s.data.error}</p>)}</details>
      </> : null}
    </>}
  </section>;
}
