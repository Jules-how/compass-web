-- Copy Archive: saved cold-email / sequence snapshots with performance + last_used.
-- Operator-only; editor Archive tab SoT when synced (local store is the offline SoT).

CREATE TABLE IF NOT EXISTS public.compass_outbound_copy_archive (
  id text PRIMARY KEY,
  name text NOT NULL,
  source text NOT NULL DEFAULT 'saved',
  source_id text,
  vertical_tags text[] NOT NULL DEFAULT '{}',
  location_tags text[] NOT NULL DEFAULT '{}',
  offer_key text,
  structure_id text NOT NULL,
  opener_mode text,
  sequence jsonb NOT NULL DEFAULT '{}'::jsonb,
  components jsonb NOT NULL DEFAULT '{}'::jsonb,
  performance jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_used_at timestamptz,
  first_used_at timestamptz,
  notes text,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compass_outbound_copy_archive IS
  'Saved cold-email / sequence archive for editor reuse (vertical, components, performance, last used).';

CREATE INDEX IF NOT EXISTS compass_outbound_copy_archive_offer_idx
  ON public.compass_outbound_copy_archive (offer_key);
CREATE INDEX IF NOT EXISTS compass_outbound_copy_archive_vertical_idx
  ON public.compass_outbound_copy_archive USING gin (vertical_tags);
CREATE INDEX IF NOT EXISTS compass_outbound_copy_archive_last_used_idx
  ON public.compass_outbound_copy_archive (last_used_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS compass_outbound_copy_archive_archived_idx
  ON public.compass_outbound_copy_archive (archived);

ALTER TABLE public.compass_outbound_copy_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_outbound_copy_archive FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_outbound_copy_archive_operator_all ON public.compass_outbound_copy_archive;
CREATE POLICY compass_outbound_copy_archive_operator_all ON public.compass_outbound_copy_archive
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_outbound_copy_archive TO authenticated;
