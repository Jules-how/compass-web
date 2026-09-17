#!/usr/bin/env node
/** Rehearse first, then run --apply after schema/flag preflight. No provider calls. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseEnvFile, resolveConfig } from "../mcp/lib.mjs";
const apply = process.argv.includes("--apply");
const stateArg = process.argv.find((a) => a.startsWith("--state="));
const statePath = path.resolve(
  stateArg?.slice(8) || ".legacy-crm-import-state.json",
);
const cfg = resolveConfig(process.env, [
  parseEnvFile(fs.readFileSync(".env.local", "utf8")),
]);
let state = fs.existsSync(statePath)
  ? JSON.parse(fs.readFileSync(statePath, "utf8"))
  : {
      base: cfg.baseUrl,
      after: "",
      until: null,
      imported: 0,
      held: 0,
      linked: 0,
      pending: null,
      complete: false,
    };
if (state.base !== cfg.baseUrl)
  throw new Error("State belongs to another Compass environment");
const persist = () => {
  fs.writeFileSync(statePath + ".tmp", JSON.stringify(state, null, 2), {
    mode: 0o600,
  });
  fs.renameSync(statePath + ".tmp", statePath);
};
async function call(body) {
  const response = await fetch(cfg.baseUrl + "/api/agent/crm/legacy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      `${response.status}: ${result.error || "legacy bridge failed"}${
        result.issues ? " " + JSON.stringify(result.issues) : ""
      }`,
    );
  return result;
}
if (!apply) {
  const p = await call({
    action: "preview",
    after: "",
    until: null,
    limit: 100,
  });
  console.log(
    JSON.stringify(
      {
        mode: "preview",
        total_leads: p.total,
        unlinked: p.unlinked,
        first_page: p.rows.map((r) => ({
          id: r.id,
          company: r.company,
          disposition: r.disposition,
        })),
        next_after: p.next_after,
        until: p.until,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
while (!state.complete) {
  if (state.pending) {
    let receipt;
    try {
      receipt = await call(state.pending.command);
    } catch (error) {
      if (
        error.message === "409: crm_lead_revision_conflict" &&
        (state.staleRetries || 0) < 3
      ) {
        // A confirmed atomic rejection can be re-previewed. Uncertain network
        // failures keep the exact pending packet for receipt-safe retry.
        state.pending = null;
        state.staleRetries = (state.staleRetries || 0) + 1;
        persist();
        continue;
      }
      throw error;
    }
    if (!Array.isArray(receipt.dispositions))
      throw new Error(
        "Bridge receipt lacks actual row dispositions; deploy current API before migration",
      );
    const totals = {
      imported:
        state.imported +
        receipt.dispositions.filter((r) => r.status === "imported").length,
      held:
        state.held +
        receipt.dispositions.filter((r) => r.status === "held").length,
      linked:
        state.linked +
        receipt.dispositions.filter((r) => r.status === "already_linked")
          .length,
    };
    Object.assign(state, state.pending.progress, totals, {
      pending: null,
      staleRetries: 0,
    });
    persist();
    console.log(
      JSON.stringify({
        imported: state.imported,
        held: state.held,
        linked: state.linked,
        complete: state.complete,
      }),
    );
    continue;
  }
  const page = await call({
    action: "preview",
    after: state.after,
    until: state.until,
    limit: 100,
  });
  if (!page.rows.length) {
    state.complete = true;
    persist();
    break;
  }
  const rows = page.rows.map(({ id, updated_at }) => ({ id, updated_at }));
  const request_id =
    "legacy-bridge-" +
    createHash("sha256")
      .update(JSON.stringify([cfg.baseUrl, rows]))
      .digest("hex")
      .slice(0, 32);
  state.until = page.until;
  state.pending = {
    command: { action: "import", request_id, rows },
    progress: {
      after: page.next_after || state.after,
      until: page.until,
      complete: !page.next_after,
      imported:
        state.imported +
        page.rows.filter((r) => r.disposition === "import_unreviewed").length,
      held:
        state.held +
        page.rows.filter((r) => r.disposition.startsWith("held_")).length,
      linked: state.linked + page.rows.filter((r) => r.already_linked).length,
    },
  };
  persist();
}
console.log(
  JSON.stringify({
    complete: state.complete,
    imported: state.imported,
    held: state.held,
    linked: state.linked,
    statePath,
  }),
);
