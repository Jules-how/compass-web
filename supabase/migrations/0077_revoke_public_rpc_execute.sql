-- Close anon/authenticated EXECUTE on privilege-escalation and lead-inventory RPCs.
-- Matches 0058 intent for inventory; bootstrap was never meant for the Data API.

REVOKE ALL ON FUNCTION public.portal_bootstrap_operator(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_bootstrap_operator(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_bootstrap_operator(text) TO service_role;

REVOKE ALL ON FUNCTION public.lead_inventory_aggregate(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lead_inventory_aggregate(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_inventory_aggregate(text) TO service_role;

REVOKE ALL ON FUNCTION public.lead_list_facets() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lead_list_facets() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_list_facets() TO service_role;
