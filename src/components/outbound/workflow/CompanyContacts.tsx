"use client";
import { useEffect, useState } from "react";
import { callingPhone } from "@/lib/calling-workspace";
import { Status } from "./PipelineForms";
type Candidate = {
  id: string;
  person_name: string | null;
  role: string | null;
  method_type: string;
  phone_kind?: string | null;
  value: string;
  attribution_status: string;
  mailbox_result: string | null;
  verified_at: string | null;
};
export function CompanyContacts({ companyId }: { companyId: string }) {
  const [records, setRecords] = useState<Candidate[]>([]),
    [after, setAfter] = useState(""),
    [next, setNext] = useState<string | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const query = new URLSearchParams({
      collection: "candidates",
      company_id: companyId,
      limit: "100",
    });
    if (after) query.set("after", after);
    fetch(`/api/operator/crm/collections?${query}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Could not load discovered contacts.");
        return response.json();
      })
      .then((body) => {
        if (controller.signal.aborted) return;
        setRecords((previous) =>
          after ? [...previous, ...body.records] : body.records,
        );
        setNext(body.next_after);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [companyId, after]);
  return (
    <section>
      <h3>Discovered contacts and methods</h3>
      {error && <p role="alert">{error}</p>}
      {records.map((contact) => (
        <article className="op-evidence" key={contact.id}>
          <strong>
            {contact.person_name || "Business contact"}
            {contact.role ? ` · ${contact.role}` : ""}
          </strong>
          <p>
            {contact.method_type}
            {contact.method_type === "phone" && contact.phone_kind
              ? ` (${contact.phone_kind.replaceAll("_", " ")})`
              : ""}
            :{" "}
            {contact.method_type === "phone" ? (
              callingPhone(contact.value)
            ) : safeSocialUrl(contact.value) ? (
              <a
                href={safeSocialUrl(contact.value)!}
                target="_blank"
                rel="noreferrer"
              >
                {contact.value} ↗
              </a>
            ) : (
              contact.value
            )}
          </p>
          <p>Attribution: {contact.attribution_status.replaceAll("_", " ")}</p>
          {contact.method_type === "email" && (
            <p>
              Mailbox: <Status value={contact.mailbox_result || "unverified"} />
              {contact.verified_at &&
                ` · checked ${new Date(contact.verified_at).toLocaleDateString("en-AU")}`}
            </p>
          )}
        </article>
      ))}
      {!loading && !records.length && (
        <p>
          No contact methods recorded. Company research can continue without an
          email address.
        </p>
      )}
      {loading && <p role="status">Loading contacts…</p>}
      {next && (
        <button disabled={loading} onClick={() => setAfter(next)}>
          Load more contact methods
        </button>
      )}
    </section>
  );
}

function safeSocialUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
