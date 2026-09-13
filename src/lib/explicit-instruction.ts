import { createHash, createPublicKey, verify } from "node:crypto";
import { z } from "zod";
export const explicitCommand = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("complete_task"),
      task_id: z.string().min(1).max(200),
      expected_updated_at: z.string().datetime({ offset: true }),
    })
    .strict(),
  z
    .object({
      action: z.literal("save_goal"),
      id: z.string().regex(/^planning\.goal\.[a-f0-9-]{36}$/),
      revision: z.number().int().nonnegative(),
      data: z.record(z.string(), z.unknown()),
    })
    .strict(),
]);
const instruction = z
  .object({
    version: z.literal(1),
    issuer: z.literal("codex-local"),
    request_id: z.string().uuid(),
    issued_at: z.string().datetime(),
    expires_at: z.string().datetime(),
    source: z
      .object({
        thread_id: z.string().uuid(),
        message_id: z.string().min(1).max(200),
        text: z.string().min(1).max(30000),
        text_sha256: z.string().regex(/^[a-f0-9]{64}$/),
        role: z.literal("user"),
      })
      .strict(),
    intent: z.literal("explicit"),
    command: explicitCommand,
  })
  .strict();
export function checkExplicitInstruction(
  input: unknown,
  publicKey: string,
  now = Date.now(),
) {
  const envelope = z
    .object({ payload: z.string().max(100000), signature: z.string().max(500) })
    .strict()
    .parse(input);
  if (!publicKey)
    throw new Error(
      "This chat surface has no trusted instruction adapter configured. Save a proposal instead.",
    );
  if (
    !verify(
      null,
      Buffer.from(envelope.payload, "base64url"),
      createPublicKey(publicKey),
      Buffer.from(envelope.signature, "base64url"),
    )
  )
    throw new Error("Instruction signature is invalid.");
  const p = instruction.parse(
    JSON.parse(Buffer.from(envelope.payload, "base64url").toString("utf8")),
  );
  if (
    createHash("sha256").update(p.source.text).digest("hex") !==
    p.source.text_sha256
  )
    throw new Error("Instruction source changed.");
  if (
    Date.parse(p.issued_at) > now + 30000 ||
    Date.parse(p.expires_at) - Date.parse(p.issued_at) > 600000 ||
    Date.parse(p.expires_at) <= Date.parse(p.issued_at)
  )
    throw new Error("Instruction time window is invalid.");
  return {
    instruction: p,
    expired: Date.parse(p.expires_at) < now,
    digest: createHash("sha256").update(envelope.payload).digest("hex"),
  };
}
