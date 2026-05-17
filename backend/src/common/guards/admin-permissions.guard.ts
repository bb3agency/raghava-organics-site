import { FastifyReply, FastifyRequest } from 'fastify';
import { Role } from '@prisma/client';
import { AppError } from '@common/errors/app-error';
import { ERROR_CODES } from '@common/errors/error-codes';
import {
  AdminPermission,
  resolveAdminControlPolicy,
  resolveAdminDutyRole,
  roleHasOwnershipOrHigher
} from '@common/auth/admin-permissions';

function isScopeEnforcementEnabled(): boolean {
  const env = (process.env.NODE_ENV ?? 'development').toLowerCase();
  if (env === 'production') {
    return true;
  }
  const configured = process.env.ADMIN_SCOPE_ENFORCEMENT?.trim().toLowerCase();
  if (configured === 'false') {
    // Allow bypass only in explicit local development sessions.
    const explicitBypass = process.env.ALLOW_ADMIN_SCOPE_BYPASS?.trim().toLowerCase() === 'true';
    return !(env === 'development' && explicitBypass);
  }
  if (configured !== undefined) {
    return true;
  }
  return true;
}

export function adminPermissionGuard(requiredPermission: AdminPermission) {
  return async function enforceAdminPermission(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    if (!isScopeEnforcementEnabled()) {
      return;
    }
    if (!request.user || request.user.role !== Role.ADMIN) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'Insufficient permissions', 403);
    }

    const permissions = request.user.permissions ?? [];
    const policy = resolveAdminControlPolicy(requiredPermission);
    const dutyRole = resolveAdminDutyRole(permissions);
    const method = typeof request.method === 'string' ? request.method.toUpperCase() : 'GET';
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    if (!permissions.includes('*') && !permissions.includes(requiredPermission)) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'Insufficient permissions', 403, {
        kind: 'permission',
        hintKey: 'permission_missing',
        requiredPermission,
        role: dutyRole
      });
    }

    // Layer C controls are platform-owned. Merchant roles may only read diagnostics.
    if (policy.layer === 'C' && isMutation && dutyRole !== 'developer') {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'Layer C controls are platform-owned', 403, {
        kind: 'permission',
        hintKey: 'developer_role_required',
        layer: policy.layer,
        requiredPermission
      });
    }

    if (policy.requiresApproval && !roleHasOwnershipOrHigher(dutyRole, policy)) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'Elevated role required for sensitive operation', 403, {
        kind: 'permission',
        hintKey: 'sensitive_control_requires_elevated_role',
        ownerRole: policy.ownerRole,
        requiredPermission
      });
    }

    request.adminControlDecision = {
      permission: requiredPermission,
      layer: policy.layer,
      role: dutyRole,
      requiresApproval: policy.requiresApproval
    };
  };
}
