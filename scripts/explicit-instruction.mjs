#!/usr/bin/env node
/** Attest an actual local Codex user message, never an agent-written quotation file. */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash, sign, randomUUID } from "node:crypto";
const [transcriptFile, messageId, commandFile, outputFile] =
  process.argv.slice(2);
if (!transcriptFile || !messageId || !commandFile || !outputFile)
  throw new Error(
    "Usage: node scripts/explicit-instruction.mjs <Codex session JSONL> <user message ID> <command JSON> <signed output JSON>",
  );
const root = await fs.realpath(path.join(os.homedir(), ".codex", "sessions"));
const transcript = await fs.realpath(transcriptFile);
if (!transcript.startsWith(root + path.sep) || !transcript.endsWith(".jsonl"))
  throw new Error("Use an original Codex session transcript.");
const rows = (await fs.readFile(transcript, "utf8"))
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
const meta = rows.find((r) => r.type === "session_meta")?.payload;
const messages = rows.filter(
  (r) =>
    r.type === "response_item" &&
    r.payload?.id === messageId &&
    r.payload?.type === "message" &&
    r.payload?.role === "user",
);
if (messages.length !== 1 || !meta?.id)
  throw new Error("Exactly one original user message must match.");
const text = messages[0].payload.content
  .filter((c) => ["input_text", "text"].includes(c.type))
  .map((c) => c.text)
  .join("\n");
if (
  !text.trim() ||
  text.includes("# AGENTS.md instructions") ||
  text.startsWith("<environment_context>")
)
  throw new Error("Environment instructions are not a user action.");
const command = JSON.parse(await fs.readFile(commandFile, "utf8"));
const issued_at = new Date().toISOString(),
  expires_at = new Date(Date.now() + 600000).toISOString();
const payload = Buffer.from(
  JSON.stringify({
    version: 1,
    issuer: "codex-local",
    request_id: randomUUID(),
    issued_at,
    expires_at,
    source: {
      thread_id: meta.id,
      message_id: messageId,
      text,
      text_sha256: createHash("sha256").update(text).digest("hex"),
      role: "user",
    },
    intent: "explicit",
    command,
  }),
).toString("base64url");
const privateKey = await fs.readFile(
  process.env.COMPASS_ATTESTER_KEY_FILE ||
    path.join(os.homedir(), ".codex", "compass-explicit", "private.pem"),
  "utf8",
);
const signature = sign(
  null,
  Buffer.from(payload, "base64url"),
  privateKey,
).toString("base64url");
await fs.writeFile(outputFile, JSON.stringify({ payload, signature }), {
  mode: 0o600,
  flag: "wx",
});
process.stdout.write(
  "Signed source-bound instruction saved. Review command scope against the original user message before sending. Retry using this exact file.\n",
);
