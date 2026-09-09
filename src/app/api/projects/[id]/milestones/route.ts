import { z } from "zod";
import { requirePortalAccess } from "@/lib/portal-access";
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin,
} from "@/lib/portal-http";

const inputSchema = z
  .object({
    id: z.string().regex(/^milestone-[a-f0-9-]{36}$/),
    title: z.string().trim().min(1).max(200),
    target_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (v) =>
          !Number.isNaN(Date.parse(v)) &&
          new Date(v).toISOString().slice(0, 10) === v,
      )
      .nullable()
      .default(null),
  })
  .strict();

/** Add one milestone without replacing the project's existing milestone collection. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const origin = requireSameOrigin(request);
  if (origin) return origin;
  try {
    const { supabase } = await requirePortalAccess({ operator: true });
    const input = inputSchema.parse(await readBoundedJson(request));
    const { id: project_id } = await context.params;
    const { data: previous, error: readError } = await supabase
      .from("compass_project_milestones")
      .select("*")
      .eq("id", input.id)
      .maybeSingle();
    if (readError) throw readError;
    if (previous) {
      if (
        previous.project_id === project_id &&
        previous.title === input.title &&
        previous.target_date === input.target_date
      )
        return portalJson(previous);
      return portalJson(
        { error: "This milestone already exists with different details." },
        { status: 409 },
      );
    }
    const stamp = new Date().toISOString();
    const { data, error } = await supabase
      .from("compass_project_milestones")
      .insert({
        ...input,
        project_id,
        completed: false,
        sort_order: 0,
        created_at: stamp,
        updated_at: stamp,
        mirrored_at: stamp,
      })
      .select("*")
      .single();
    if (error)
      return portalJson(
        {
          error:
            "The milestone could not be added. Check the project and try again.",
        },
        { status: 400 },
      );
    return portalJson(data, { status: 201 });
  } catch (error) {
    return (
      portalAccessResponse(error) ??
      portalJson(
        {
          error:
            error instanceof z.ZodError
              ? "Add a title and a valid date."
              : "Unable to add the milestone.",
        },
        { status: 400 },
      )
    );
  }
}

const updateSchema = inputSchema.extend({
  // Existing milestones may have IDs assigned by desktop sync.
  id: z.string().min(1).max(200),
  description: z.string().max(10000).nullable().default(null),
  completed: z.boolean(),
  expected_updated_at: z.string().datetime({ offset: true }),
});
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const origin = requireSameOrigin(request);
  if (origin) return origin;
  try {
    const { supabase } = await requirePortalAccess({ operator: true });
    const { expected_updated_at, id, ...input } = updateSchema.parse(
      await readBoundedJson(request),
    );
    const { id: project_id } = await context.params;
    const stamp = new Date().toISOString();
    const { data, error } = await supabase
      .from("compass_project_milestones")
      .update({ ...input, updated_at: stamp, mirrored_at: stamp })
      .eq("id", id)
      .eq("project_id", project_id)
      .eq("updated_at", expected_updated_at)
      .select("*")
      .maybeSingle();
    if (error || !data)
      return portalJson(
        { error: "This milestone changed. Reopen it before editing." },
        { status: 409 },
      );
    return portalJson(data);
  } catch (error) {
    return (
      portalAccessResponse(error) ??
      portalJson(
        {
          error:
            error instanceof z.ZodError
              ? "Add a title and a valid date."
              : "Unable to save the milestone.",
        },
        { status: 400 },
      )
    );
  }
}
