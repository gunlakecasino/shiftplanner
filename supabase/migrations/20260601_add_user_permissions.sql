-- Add granular per-user permissions to the users table.
-- This allows overriding the base role permissions on a per-operator basis.

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT NULL;

COMMENT ON COLUMN public.users.permissions IS 
'Granular ShiftBuilder permissions for this user. When null, the user inherits permissions from their role via getPermissionsForRole(). 
When set, these values override/merge with the role defaults.';

-- Optional: Add an index if we ever query on specific permission keys frequently
-- CREATE INDEX IF NOT EXISTS users_permissions_gin ON public.users USING GIN (permissions);