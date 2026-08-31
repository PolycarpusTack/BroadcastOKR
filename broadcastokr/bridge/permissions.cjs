/**
 * Server-authoritative role→permission matrix. src/constants/roles.ts mirrors
 * this for UX gating (CJS/ESM split forces the mirror); an equality test pins
 * the two. The server side is the real boundary — UI gates are hints.
 */
const ROLE_PERMS = {
  owner: { canCreate: true, canEdit: true, canDelete: true, canAssign: true, canCheckIn: true, canChangeStatus: true, canViewReports: true, label: 'Owner' },
  manager: { canCreate: true, canEdit: true, canDelete: false, canAssign: true, canCheckIn: true, canChangeStatus: true, canViewReports: true, label: 'Manager' },
  member: { canCreate: false, canEdit: false, canDelete: false, canAssign: false, canCheckIn: true, canChangeStatus: true, canViewReports: false, label: 'Member' },
};

module.exports = { ROLE_PERMS };
