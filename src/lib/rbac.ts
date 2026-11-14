import type { DemoSession, InspectionReport, UserRole } from '../types/compliance';

export const DEMO_SESSIONS: Record<UserRole, DemoSession> = {
  MANUFACTURER: {
    role: 'MANUFACTURER',
    actorId: 'msme-abc-foods',
    displayName: 'Manufacturer / MSME',
    organization: 'ABC Foods Pvt. Ltd.',
  },
  INSPECTOR: {
    role: 'INSPECTOR',
    actorId: 'insp-lmpc-042',
    displayName: 'Inspector / Reviewer',
    organization: 'Legal Metrology Verification Cell',
  },
  MAINTAINER: {
    role: 'MAINTAINER',
    actorId: 'admin-rule-maint',
    displayName: 'Rule Maintainer / Administrator',
    organization: 'Standards & Statutory Rule Registry',
  },
  VISITOR: {
    role: 'VISITOR',
    actorId: 'anonymous',
    displayName: 'Unauthenticated Visitor',
    organization: 'Public Informational Access Only',
  },
};

export interface RolePermissions {
  isAuthenticated: boolean;
  canRunAnalysis: boolean;
  canViewAllRecords: boolean;
  canViewOwnRecords: boolean;
  canExportReport: boolean;
  canReviewHitl: boolean;
  canEditDraftRules: boolean;
  canPublishRuleVersion: boolean;
  canViewAuditLog: boolean;
}

export function getRolePermissions(role: UserRole): RolePermissions {
  switch (role) {
    case 'MANUFACTURER':
      return {
        isAuthenticated: true,
        canRunAnalysis: true,
        canViewAllRecords: false,
        canViewOwnRecords: true,
        canExportReport: true,
        canReviewHitl: false,
        canEditDraftRules: false,
        canPublishRuleVersion: false,
        canViewAuditLog: false,
      };
    case 'INSPECTOR':
      return {
        isAuthenticated: true,
        canRunAnalysis: true,
        canViewAllRecords: true,
        canViewOwnRecords: true,
        canExportReport: true,
        canReviewHitl: true,
        canEditDraftRules: false,
        canPublishRuleVersion: false,
        canViewAuditLog: false,
      };
    case 'MAINTAINER':
      return {
        isAuthenticated: true,
        canRunAnalysis: true,
        canViewAllRecords: true,
        canViewOwnRecords: true,
        canExportReport: true,
        canReviewHitl: true,
        canEditDraftRules: true,
        canPublishRuleVersion: true,
        canViewAuditLog: true,
      };
    case 'VISITOR':
    default:
      return {
        isAuthenticated: false,
        canRunAnalysis: false,
        canViewAllRecords: false,
        canViewOwnRecords: false,
        canExportReport: false,
        canReviewHitl: false,
        canEditDraftRules: false,
        canPublishRuleVersion: false,
        canViewAuditLog: false,
      };
  }
}

/**
 * Enforces record ownership (SEC-01 / SEC-06 / AUTH-01):
 * - VISITOR: denied all private records
 * - MANUFACTURER: own records only (ownerId === session.actorId)
 * - INSPECTOR / MAINTAINER: authorized across submitted inspection records
 */
export function canAccessRecord(
  session: DemoSession,
  record: Pick<InspectionReport, 'ownerId'>,
): boolean {
  if (session.role === 'VISITOR') return false;
  if (session.role === 'INSPECTOR' || session.role === 'MAINTAINER') return true;
  return record.ownerId === session.actorId;
}
