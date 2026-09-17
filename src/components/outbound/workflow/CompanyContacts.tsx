"use client";
import { useEffect, useState } from "react";
import { callingPhone } from "@/lib/calling-workspace";
import { Status } from "./PipelineForms";
import { mergePipelineRecords } from "./pipeline-read-store";
type Candidate = {
  id: string; person_name: string | null; role: string | null; method_type: string;
  phone_kind?: string | null; value: string; attribution_status: string;
  mailbox_result: string | null; verified_at: string | null;
};
export function CompanyContacts({ companyId, mode = "all" }: { companyId: string; mode?: "all" | "verify" }) {
  const [state, setState] = useState<{ companyId: string; records: Candidate[]; next: string | null; error: string; loading: boolean }>({ companyId, records: [], next: null, error: "", loading: true });
  const [cursor, setCursor] = useState({ companyId, after: "" });
  const after = cursor.companyId === companyId ? cursor.after : "";
  const [retry, setRetry] = useState(0);
  const [showOtherMethods, setShowOtherMethods] = useState(false);
  const records = state.companyId === companyId ? state.records : [];
  const loading = state.companyId !== companyId || state.loading;
  const error = state.companyId === companyId ? state.error : "";
  useEffect(() => { setShowOtherMethods(false); }, [companyId, mode]);
  useEffect(() => {
    const controller = new AbortController();
    setState(previous => ({ companyId, records: previous.companyId === companyId ? previous.records : [], next: previous.companyId === companyId ? previous.next : null, error: "", loading: true }));
    const query = new URLSearchParams({ collection: "candidates", company_id: companyId, limit: "100" });
    if (after) query.set("after", after);
    void fetch(`/api/operator/crm/collections?${query}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Could not load discovered contacts. Try again.");
      return response.json();
    }).then(body => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(body.records)) throw new Error("The contact response was incomplete. Try again.");
      setState(previous => ({ companyId, records: mergePipelineRecords(after && previous.companyId === companyId ? previous.records : [], body.records), next: body.next_after || null, error: "", loading: false }));
    }).catch(error => {
      if (!controller.signal.aborted) setState(previous => ({ ...previous, error: error instanceof Error ? error.message : "Could not load contacts.", loading: false }));
    });
    return () => controller.abort();
  }, [companyId, after, retry]);
  const visible = mode === "verify" && !showOtherMethods ? records.filter(contact => contact.method_type === "email") : records;
  return <section className="op-contact-records">
    <div className="op-section-heading"><h3>{mode === "verify" ? "Email verification results" : "Names, emails & phone numbers"}</h3></div>
    {mode === "verify" && <p className="op-muted">Results describe mailbox checks, not permission to send. The saved workflow still decides eligibility.</p>}
    {error && <p className="op-error" role="alert">{error} <button disabled={loading} onClick={() => setRetry(value => value + 1)}>Try again</button></p>}
    {visible.map(contact => <article className="op-contact-card" key={contact.id}>
      <div className="op-contact-card-heading"><strong>{contact.person_name || "Business contact"}</strong>{contact.method_type === "email" && <Status value={contact.mailbox_result || "unverified"} />}</div>
      {contact.role && <p className="op-muted">{contact.role}</p>}
      <div className="op-contact-method"><span className="op-method-label">{contact.method_type === "phone" ? (contact.phone_kind || "Phone").replaceAll("_", " ") : contact.method_type.replaceAll("_", " ")}</span><span>{contact.method_type === "phone" ? callingPhone(contact.value) : safeSocialUrl(contact.value) ? <a href={safeSocialUrl(contact.value)!} target="_blank" rel="noreferrer">{contact.value} ↗</a> : contact.value}</span></div>
      <p className="op-muted">Attribution: {(contact.attribution_status || "unresolved").replaceAll("_", " ")}{contact.method_type === "email" && contact.verified_at ? ` · Checked ${new Date(contact.verified_at).toLocaleDateString("en-AU")}` : ""}</p>
    </article>)}
    {!loading && !error && !visible.length && <div className="op-empty-state"><strong>{mode === "verify" ? "No email addresses on this page" : "No contact methods recorded"}</strong><p>{mode === "verify" ? "Find contact emails before verification. Phone and social records are still available below." : "Research or contact sourcing can add names and contact methods. This company has not been removed."}</p></div>}
    {loading && <p role="status" className="op-notice">Loading contact details…</p>}
    {mode === "verify" && records.some(contact => contact.method_type !== "email") && <button onClick={() => setShowOtherMethods(value => !value)}>{showOtherMethods ? "Show emails only" : "Show phone & social records"}</button>}
    {state.companyId === companyId && state.next && <button disabled={loading || Boolean(error)} onClick={() => setCursor({ companyId, after: state.next! })}>Load more contact methods</button>}
  </section>;
}
function safeSocialUrl(value: string) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
