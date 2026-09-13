"use client";
import { useRef, useState } from "react";
import type { PlanningRow } from "@/lib/planning-server";
import type { Observation } from "@/lib/pathfinder/types";
import { pathfinderCommand } from "@/components/pathfinder/OutcomePanel";
import { localDay } from "@/lib/goal-actions";
export function PaymentEvidence({
  goal,
  observations,
  onChanged,
}: {
  goal: PlanningRow;
  observations: Observation[];
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    kind: "payment",
    receipt_id: "",
    payment_id: "",
    client_id: "",
    offer_key: "installation-booking",
    amount: "",
    received_on: localDay(new Date()),
    source: "",
    detail: "",
  });
  const pending = useRef<any>(null);
  const set = (key: string, value: string) =>
    setForm({ ...form, [key]: value });
  async function save() {
    setBusy(true);
    setError("");
    try {
      pending.current ??= {
        action: "observe",
        goal_id: goal.id,
        goal_revision: goal.revision,
        idempotency_key: `receipt:${crypto.randomUUID()}`,
        metric_id: "payment",
        receipt: {
          kind: form.kind,
          receipt_id: form.receipt_id,
          payment_id: form.payment_id,
          client_id: form.client_id,
          offer_key: form.offer_key,
          amount: Number(form.amount),
          currency: "AUD",
          received_on: form.received_on,
        },
        provenance: "reported",
        value: Number(form.amount),
        accepted: null,
        source: form.source,
        detail: form.detail,
        period_start: form.received_on,
        period_end: form.received_on,
        observed_at: new Date().toISOString(),
        evidence_ids: [],
      };
      await pathfinderCommand(pending.current);
      pending.current = null;
      setOpen(false);
      setForm({
        ...form,
        receipt_id: "",
        payment_id: "",
        amount: "",
        source: "",
        detail: "",
      });
      await onChanged();
    } catch (e) {
      if (
        (e as { status?: number }).status &&
        (e as { status: number }).status < 500
      )
        pending.current = null;
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <div className="ga-dialog-title">
        <h2>Cash collected</h2>
        <button onClick={() => setOpen((v) => !v)}>
          {open ? "Close form" : "Record receipt / refund"}
        </button>
      </div>
      <p>
        Record actual receipts with a stable payment reference. These are
        operator-reported records; bank and payment-provider reconciliation
        remains in Finances.
      </p>
      <p>
        A$2,500 collected meets the first-customer cash target. The A$2,500
        monthly retainer is refundable under the agreed risk reversal; its
        detailed terms remain in the offer agreement.
      </p>
      {open && (
        <form
          className="ga-outcome-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={busy || Boolean(pending.current)}>
            <label>
              Receipt type
              <select
                value={form.kind}
                onChange={(e) => set("kind", e.target.value)}
              >
                <option value="payment">Payment collected</option>
                <option value="refund">Refund issued</option>
              </select>
            </label>
            <div className="ga-form-row">
              {[
                ["receipt_id", "Unique receipt / refund reference"],
                ["payment_id", "Original payment reference"],
                ["client_id", "Stable client / business ID"],
                ["offer_key", "Offer"],
                ["amount", "Amount (AUD)"],
                ["received_on", "Received / refunded on"],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    required
                    value={(form as any)[key]}
                    type={
                      key === "amount"
                        ? "number"
                        : key === "received_on"
                          ? "date"
                          : "text"
                    }
                    min={key === "amount" ? "0.01" : undefined}
                    step={key === "amount" ? "0.01" : undefined}
                    onChange={(e) => set(key, e.target.value)}
                  />
                </label>
              ))}
            </div>
            <label>
              Receipt source / link
              <input
                required
                value={form.source}
                onChange={(e) => set("source", e.target.value)}
              />
            </label>
            <label>
              What this receipt proves
              <textarea
                required
                value={form.detail}
                onChange={(e) => set("detail", e.target.value)}
              />
            </label>
          </fieldset>
          {error && <p role="alert">{error}</p>}
          <button className="ga-primary" disabled={busy}>
            {busy
              ? "Saving…"
              : pending.current
                ? "Retry same receipt"
                : "Record receipt"}
          </button>
        </form>
      )}
      {observations
        .filter((o) => o.receipt)
        .map((o) => (
          <article className="ga-evidence-row" key={o.id}>
            <strong>
              {o.receipt!.kind === "refund" ? "Refund" : "Collected"} · A$
              {o.receipt!.amount.toLocaleString("en-AU")}
            </strong>
            <span>
              {o.receipt!.received_on} · {o.receipt!.client_id} · {o.provenance}
            </span>
            <small>
              {o.source} · {o.receipt!.receipt_id}
            </small>
          </article>
        ))}
      {!observations.some((o) => o.receipt) && (
        <p className="ga-muted">
          No payment receipts are linked to this goal. Collected revenue is
          unknown.
        </p>
      )}
    </section>
  );
}
