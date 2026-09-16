"use client";
import { useEffect, useState } from "react";
import type { OfferRevision } from "@/lib/offer-revisions";
import { parseOfferLock } from "@/lib/offer-sku";
import type { WorkflowPolicy, WorkflowVersion } from "@/lib/outbound-pipeline";
import { Field } from "./PipelineForms";
type Offer = {
  id: string;
  name: string;
  active_revision_id: string | null;
};
export function OfferProfile({
  policy,
  onChange,
  workflows,
}: {
  policy: WorkflowPolicy;
  onChange: (policy: WorkflowPolicy) => void;
  workflows: WorkflowVersion[];
}) {
  const [offers, setOffers] = useState<Offer[]>([]),
    [offerId, setOfferId] = useState(""),
    [revisions, setRevisions] = useState<OfferRevision[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/outbound/offers", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load offers.");
        return response.json();
      })
      .then((body) => {
        setOffers(body.items);
        setOfferId(
          (body.items as Offer[]).find(
            (offer) => offer.active_revision_id === policy.offer_version_id,
          )?.id || "",
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!offerId) return;
    const controller = new AbortController();
    setRevisions([]);
    fetch(`/api/offers/${encodeURIComponent(offerId)}/revisions`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load offer versions.");
        return response.json();
      })
      .then((body) => {
        setRevisions(body.revisions);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [offerId]);
  function chooseRevision(id: string) {
    const revision = revisions.find((value) => value.id === id);
    if (!revision) return;
    const lock = parseOfferLock(revision.snapshot.lock);
    const criteria = [
      ...(lock.icp
        ? [{ label: lock.icp, required: true, exclusion: false }]
        : []),
      ...lock.screen.map((value) => ({
        label: value,
        required: true,
        exclusion: false,
      })),
      ...lock.antiIcp.map((value) => ({
        label: value,
        required: false,
        exclusion: true,
      })),
    ].map((value) => ({ ...value, id: crypto.randomUUID(), instructions: "" }));
    onChange({
      ...policy,
      offer_version_id: id,
      icp_version_id: crypto.randomUUID(),
      criteria,
    });
  }
  return (
    <section>
      <h3>Offer and ideal customer profile</h3>
      {error && (
        <p role="alert" className="op-error">
          {error}
        </p>
      )}
      <div className="op-grid-two">
        <Field label="Offer">
          <select
            value={offerId}
            onChange={(e) => {
              setOfferId(e.target.value);
              onChange({ ...policy, offer_version_id: "" });
            }}
          >
            <option value="">Choose an offer</option>
            {offers.map((offer) => (
              <option key={offer.id} value={offer.id}>
                {offer.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Offer version"
          hint="Selecting a version loads its published screening criteria for review."
        >
          <select
            value={policy.offer_version_id}
            onChange={(e) => chooseRevision(e.target.value)}
          >
            <option value="">Choose a version</option>
            {policy.offer_version_id &&
              !revisions.some((v) => v.id === policy.offer_version_id) && (
                <option value={policy.offer_version_id}>
                  Saved offer version
                </option>
              )}
            {revisions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.version_label || `Version ${version.version_no}`}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Reuse an existing customer profile">
        <select
          value=""
          onChange={(e) => {
            const workflow = workflows.find((v) => v.id === e.target.value);
            if (workflow)
              onChange({
                ...policy,
                icp_version_id: workflow.policy.icp_version_id,
                criteria: structuredClone(workflow.policy.criteria),
              });
          }}
        >
          <option value="">Current editable profile</option>
          {workflows.map((workflow) => (
            <option key={workflow.id} value={workflow.id}>
              {workflow.name}
            </option>
          ))}
        </select>
      </Field>
    </section>
  );
}
