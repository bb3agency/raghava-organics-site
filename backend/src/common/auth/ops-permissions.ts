export type OpsPermissionValue = 'OPS_READ' | 'OPS_WRITE' | 'OPS_APPROVE';

export const OPS_PERMISSION_MAP = {
  'ops:read': 'OPS_READ',
  'ops:write': 'OPS_WRITE',
  'ops:approve': 'OPS_APPROVE'
} as const satisfies Record<'ops:read' | 'ops:write' | 'ops:approve', OpsPermissionValue>;

export type OpsPermissionScope = keyof typeof OPS_PERMISSION_MAP;

export function hasOpsPermission(
  permissions: readonly OpsPermissionValue[] | undefined,
  required: OpsPermissionScope
): boolean {
  if (!permissions || permissions.length === 0) {
    return false;
  }
  const resolved = OPS_PERMISSION_MAP[required];
  if (!resolved) {
    return false;
  }
  return permissions.includes(resolved);
}
