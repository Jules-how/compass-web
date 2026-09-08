import { requirePortalAccess } from "@/lib/portal-access";
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin,
} from "@/lib/portal-http";
import { savePlanning } from "@/lib/planning-server";
import { CAMPAIGN_LIST_COLUMNS } from "@/lib/campaigns";
export async function POST(request: Request) {
  const origin = requireSameOrigin(request);
  if (origin) return origin;
  try {
    const { supabase } = await requirePortalAccess({ operator: true });
    const body = (await readBoundedJson(request, 4000)) as {
      id: string;
      campaignId: string;
      dimension: string;
      reviewDate: string;
    };
    if (
      !/^planning\.preparation\.[a-f0-9-]{36}$/.test(body.id) ||
      typeof body.campaignId !== "string" ||
      typeof body.dimension !== "string" ||
      body.dimension.length > 100 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.reviewDate)
    )
      return portalJson(
        { error: "Invalid preparation request." },
        { status: 400 },
      );
    const { data: campaign, error } = await supabase
      .from("compass_pipeline_campaigns")
      .select(CAMPAIGN_LIST_COLUMNS)
      .eq("id", body.campaignId)
      .maybeSingle();
    if (error || !campaign) throw new Error("Campaign could not be read.");
    if (!["planned", "draft", "paused"].includes(campaign.status))
      throw new Error("Prepare a separate planned or paused draft.");
    const snapshot = JSON.stringify(campaign);
    if (snapshot.length > 23000)
      throw new Error(
        "Campaign is too large for a review snapshot. Use the campaign review workflow.",
      );
    const record = await savePlanning({
      kind: "preparation",
      id: body.id,
      data: {
        title: `Prepare ${campaign.name}`,
        status: "queued",
        campaignId: campaign.id,
        source: `/sales/pipeline/${campaign.id}`,
        body: `Requested test: ${body.dimension}. Earliest review: ${body.reviewDate}.\nQueued only: no paid work, upload or activation has executed.\nRequired: exact variation, comparable non-overlapping company cohorts, existing lead and contact history checks, source-backed facts, verification policy, rendered-merge review, all campaign settings, capacity and paused-state proof. Refresh the snapshot if campaign.updated_at changes.\nSnapshot:\n${snapshot}`,
      },
    });
    return portalJson({ record });
  } catch (e) {
    return (
      portalAccessResponse(e) ||
      portalJson(
        { error: e instanceof Error ? e.message : "Preparation failed." },
        { status: 400 },
      )
    );
  }
}
