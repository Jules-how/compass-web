/** Stable policy identifiers; execution lives in the connected agent's adapters. */
export const OUTBOUND_TOOL_CATALOGUE = [
  {
    id: "http.fetch",
    label: "HTTP to text",
    stages: ["research", "contacts"],
    description:
      "Read a public page, retaining the URL, fetched time and text artifact.",
  },
  {
    id: "parallel.search",
    label: "Parallel search",
    stages: ["research", "contacts"],
    description: "Find source pages using the connected Parallel search tool.",
  },
  {
    id: "parallel.extract",
    label: "Parallel extract",
    stages: ["research", "contacts"],
    description: "Extract saved URLs when direct HTTP text is insufficient.",
  },
  {
    id: "firecrawl.scrape",
    label: "Firecrawl scrape",
    stages: ["research", "contacts"],
    description: "Use a connected Firecrawl adapter for selected pages.",
  },
  {
    id: "millionverifier.email",
    label: "MillionVerifier",
    stages: ["verify"],
    description:
      "Verify a published or provider-sourced address and retain the actual result.",
  },
  {
    id: "ai.write",
    label: "Selected AI writing model",
    stages: ["write"],
    description:
      "Use only the template’s saved model/prompt and referenced evidence; persist one result.",
  },
  {
    id: "template.render",
    label: "Saved template renderer",
    stages: ["write"],
    description:
      "Render deterministic saved slots and fallbacks using the shared Compass renderer.",
  },
] as const;
export type ExecutorCapability = {
  id: string;
  stages: string[];
  adapter_version: string;
  tool_name: string;
  probe: {
    status: "ready" | "unavailable";
    checked_at: string;
    detail: string;
  };
};
export type ExecutorSession = {
  id: string;
  name: string;
  revision: number;
  expires_at: string;
  tools: ExecutorCapability[];
};
export type ExecutorCatalogue = {
  executor: "connected_agent";
  sessions: ExecutorSession[];
  tools: Array<{
    id: string;
    label: string;
    stages: readonly string[];
    description: string;
    available: boolean;
    available_stages: string[];
    checked_at: string | null;
    reason: string;
  }>;
};
