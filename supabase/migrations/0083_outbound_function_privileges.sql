-- Supabase projects may grant service_role EXECUTE through default privileges.
-- Human approval must not inherit that grant; trigger functions need no API grant.
REVOKE ALL ON FUNCTION public.outbound_approve_preparation(text,text) FROM service_role;
REVOKE ALL ON FUNCTION public.outbound_invalidate(),public.outbound_immutable() FROM PUBLIC,anon,authenticated,service_role;
