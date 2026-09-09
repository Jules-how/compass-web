"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { NotebookEditor } from "@/components/planning/NotebookEditor";
import type { CompassCampaign } from "@/lib/campaigns";
import type { PlanningRow } from "@/lib/planning-server";
import { workFetch } from "@/lib/workspace-change";
const route = (id: string) =>
  "/sales/outbound/editor/" + encodeURIComponent(id);
export function OutboundNotebook({
  campaigns,
}: {
  campaigns: CompassCampaign[];
}) {
  const options = campaigns.filter(
    (c) =>
      c.offer_key === "installation-booking" &&
      !["archived", "cancelled", "completed"].includes(c.status),
  );
  const [selected, setSelected] = useState(""),
    [notes, setNotes] = useState<PlanningRow[]>([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void (async () => {
      const all: PlanningRow[] = [];
      for (let page = 0; ; page++) {
        const r = await workFetch(`/api/planning?kind=note&page=${page}`);
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        all.push(...b.records);
        if (all.length >= b.total) break;
        if (page > 50) throw new Error("Too many notes to load safely");
      }
      if (live) {
        setNotes(all);
        setLoaded(true);
      }
    })().catch((e) => {
      if (live) setError(e.message);
    });
    return () => {
      live = false;
    };
  }, []);
  const current = options.find((c) => c.id === selected) ?? options[0];
  return (
    <div className="outbound-notebook">
      <aside className="outbound-notebook-index" aria-label="Campaign pages">
        <p className="text-xs uppercase tracking-widest text-neutral-500">
          Campaign pages
        </p>
        {options.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={current?.id === c.id}
            onClick={() => setSelected(c.id)}
          >
            {c.name}
            <small>{c.status}</small>
          </button>
        ))}
        <Link href="/sales/offers">Ads + booking offer ↗</Link>
        <Link href="/sales/outbound/craft">Copy and elements ↗</Link>
        <Link href="/sales/experiments">Plan an outbound test ↗</Link>
        <Link href="/leads">Lead data and lists ↗</Link>
        <Link href="/sales/outbound/research">Research library ↗</Link>
      </aside>
      <div className="min-w-0">
        {error && <p role="alert">{error}</p>}
        {!loaded && !error && <p role="status">Loading notebook…</p>}
        {loaded &&
          options.map((c) => (
            <div key={c.id} hidden={c.id !== current?.id}>
              <CampaignPage
                campaign={c}
                note={notes.find(
                  (n) =>
                    !n.data.archived &&
                    String(n.data.links ?? "")
                      .split("\n")
                      .includes(route(c.id)),
                )}
                onSave={(saved) =>
                  setNotes((old) => [
                    saved,
                    ...old.filter((n) => n.id !== saved.id),
                  ])
                }
              />
            </div>
          ))}{" "}
        {!current && (
          <div className="folio-paper p-6">
            <p>No current ads + booking campaign yet.</p>
            <Link href="/sales/offers" className="underline">
              Open the offer and campaign desk
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
function CampaignPage({
  campaign,
  note,
  onSave,
}: {
  campaign: CompassCampaign;
  note?: PlanningRow;
  onSave: (n: PlanningRow) => void;
}) {
  const [body, setBody] = useState(String(note?.data.body ?? "")),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState("");
  const createId = useRef("");
  const latestBody = useRef(body);
  const dirtyRef = useRef(false);
  const draftKey = "compass.outbound.note-draft." + campaign.id;
  useEffect(() => {
    const savedBody = String(note?.data.body ?? "");
    try {
      const draft = sessionStorage.getItem(draftKey);
      if (draft !== null && draft !== savedBody) {
        latestBody.current = draft;
        dirtyRef.current = true;
        setBody(draft);
        setDirty(true);
        return;
      }
    } catch {}
    if (!dirtyRef.current) {
      latestBody.current = savedBody;
      setBody(savedBody);
    }
  }, [draftKey, note?.data.body]);
  const changeBody = (value: string) => {
    latestBody.current = value;
    dirtyRef.current = true;
    setBody(value);
    setDirty(true);
    setSaved("");
    try {
      sessionStorage.setItem(draftKey, value);
    } catch {}
  };

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function save() {
    const submittedBody = latestBody.current;
    setBusy(true);
    setError("");
    try {
      createId.current ||= `planning.note.${crypto.randomUUID()}`;
      const r = await workFetch("/api/planning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "note",
          id: note?.id ?? createId.current,
          revision: note?.revision ?? 0,
          data: {
            ...note?.data,
            title: `Outbound plan · ${campaign.name}`,
            body: submittedBody,
            links: note?.data.links ?? route(campaign.id),
            goalId: note?.data.goalId ?? "",
            status: note?.data.status ?? "idea",
          },
        }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      onSave(b.record);
      if (latestBody.current === submittedBody) {
        dirtyRef.current = false;
        setDirty(false);
        setSaved("Saved to Compass");
        try {
          sessionStorage.removeItem(draftKey);
        } catch {}
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="outbound-notebook-page">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <p className="text-xs text-neutral-500">
          Ads + booking · campaign plan
        </p>
        <button
          type="button"
          className="compass-btn-primary"
          disabled={busy || !dirty}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save page"}
        </button>
      </div>
      <h2 className="font-serif text-3xl mt-4">{campaign.name}</h2>
      <p className="mt-2 text-sm text-neutral-500">
        Write the audience, angle, list criteria, sequence, follow-up approach
        and what you want to learn.
      </p>
      <nav
        aria-label="Campaign tools"
        className="my-5 flex flex-wrap gap-4 text-sm"
      >
        <Link href={route(campaign.id)} className="underline">
          Write emails ↗
        </Link>
        <Link href={route(campaign.id) + "?tab=prepare"} className="underline">
          Signals, list and output ↗
        </Link>
        <Link href="/sales/experiments" className="underline">
          Test settings and results ↗
        </Link>
      </nav>
      {error && (
        <p role="alert" className="text-red-700">
          {error} Your unsaved text is still here.
        </p>
      )}
      <p role="status" className="text-xs text-neutral-500">
        {dirty
          ? "Unsaved changes"
          : saved ||
            (note
              ? `Saved ${new Date(note.updatedAt).toLocaleString("en-AU")}`
              : "New page")}
      </p>
      {!body && (
        <button
          type="button"
          className="mt-4 text-sm underline"
          onClick={() => {
            changeBody(
              "## Audience and list\n\n## Angle and hypothesis\n\n## Emails and signals\n\n## Follow-up plan\n\n## Test and review window\n\n## Results and learning\n",
            );
          }}
        >
          Start with a light outline
        </button>
      )}
      <NotebookEditor
        label="Outbound campaign plan"
        value={body}
        onChange={changeBody}
        maxLength={20000}
      />
      <details className="mt-6 border-t border-stone-200 pt-4">
        <summary className="cursor-pointer text-sm font-medium">
          Suggested follow-up structure
        </summary>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600">
          For each selected account, record one next action: channel, due time,
          reason and owner. Record the result after the touch, then decide the
          next action. A reply or opt-out should stop the cold sequence; a
          promised callback takes precedence. Use calls selectively. Text and
          social need a suitable contact basis and context. Keep those actions
          in the existing task list, linked to the lead and campaign.
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          This is planning guidance. Writing a date here does not schedule or
          send a message.
        </p>
        <Link className="mt-2 inline-block underline text-sm" href="/tasks">
          Open follow-up tasks ↗
        </Link>
      </details>
    </article>
  );
}
