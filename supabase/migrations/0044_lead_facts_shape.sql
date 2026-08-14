-- Document the engager-fact array shape used by /api/agent/leads/mark rows.

COMMENT ON COLUMN public.lead_contacts.lead_facts IS
  'JSON array of {kind, claim, url}. kind is the opener-slot type (specialty|policy|tenure|review|about|milestone|content|update|location). claim is one sentence. url is the source page. Empty array = harvested thin. null = not harvested.';
