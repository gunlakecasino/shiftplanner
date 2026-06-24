-- Normalize legacy viewer accounts stored as utility_ops_super + canEditPublishedOnly marker.
UPDATE public.users
SET role = 'viewer', updated_at = now()
WHERE role = 'utility_ops_super'
  AND (permissions->>'canEditPublishedOnly')::boolean = true;