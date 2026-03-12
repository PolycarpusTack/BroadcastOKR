import type { Role, RolePermissions } from '../types';

export const ROLE_PERMS: Record<Role, RolePermissions> = {
  owner: { canCreate: true, canEdit: true, canDelete: true, canAssign: true, canCheckIn: true, canChangeStatus: true, canViewReports: true, label: 'Owner' },
  manager: { canCreate: true, canEdit: true, canDelete: false, canAssign: true, canCheckIn: true, canChangeStatus: true, canViewReports: true, label: 'Manager' },
  member: { canCreate: false, canEdit: false, canDelete: false, canAssign: false, canCheckIn: true, canChangeStatus: true, canViewReports: false, label: 'Member' },
};
