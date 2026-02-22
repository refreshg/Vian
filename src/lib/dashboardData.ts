import type { BitrixDeal } from "@/types/bitrix";

/** Stage IDs that count as "rejection" / lost */
const REJECTION_STAGE_PATTERNS = /LOSE|LOST|REJECT|FAIL/i;

export function isRejectionStage(stageId: string): boolean {
  return REJECTION_STAGE_PATTERNS.test(stageId);
}

/** Human-readable stage label (strip prefix like C1:) */
export function stageLabel(stageId: string): string {
  const parts = stageId.split(":");
  const last = parts[parts.length - 1] ?? stageId;
  return last.replace(/_/g, " ");
}

/** Mock department when UF_CRM_DEPARTMENT is missing - derive from deal ID for consistency */
const MOCK_DEPARTMENTS = [
  "Gynecologic Oncology",
  "Cardiology",
  "General Medicine",
  "Pediatrics",
  "Surgery",
  "Neurology",
  "Other",
];

function getDepartment(deal: BitrixDeal): string {
  const custom = deal.UF_CRM_DEPARTMENT?.trim();
  if (custom) return custom;
  const index = parseInt(deal.ID, 10) % MOCK_DEPARTMENTS.length;
  return MOCK_DEPARTMENTS[Number.isNaN(index) ? 0 : index];
}

/** Mock rejection reasons when UF_CRM_REJECTION_REASON is missing */
const MOCK_REJECTION_REASONS = [
  "Didn't receive enough follow-up/support",
  "Does not need medical assistance",
  "Is not interested",
  "Service is not available at this hospital",
  "Got in touch and received the information, but stopped communicating after the feedback.",
  "Others",
];

function getRejectionReason(deal: BitrixDeal): string {
  const custom = deal.UF_CRM_REJECTION_REASON?.trim();
  if (custom) return custom;
  const index = parseInt(deal.ID, 10) % MOCK_REJECTION_REASONS.length;
  return MOCK_REJECTION_REASONS[Number.isNaN(index) ? 0 : index];
}

export interface KpiStats {
  totalRequests: number;
  totalRejections: number;
  rejectionRate: number;
  avgDelayHours: number;
}

export interface StageGroup {
  name: string;
  value: number;
  stageId: string;
}

export interface DepartmentGroup {
  name: string;
  count: number;
}

export interface RejectionReasonRow {
  reason: string;
  count: number;
}

export function computeDashboardData(
  deals: BitrixDeal[],
  stageIdToName?: Record<string, string>
): {
  kpi: KpiStats;
  stageGroups: StageGroup[];
  departmentGroups: DepartmentGroup[];
  rejectionReasons: RejectionReasonRow[];
} {
  const totalRequests = deals.length;
  const rejectedDeals = deals.filter((d) => isRejectionStage(d.STAGE_ID ?? ""));
  const totalRejections = rejectedDeals.length;
  const rejectionRate =
    totalRequests > 0 ? Math.round((totalRejections / totalRequests) * 100) : 0;
  const avgDelayHours = 1; // Placeholder until custom field or logic exists

  const stageMap = new Map<string, number>();
  for (const d of deals) {
    const id = d.STAGE_ID ?? "Unknown";
    stageMap.set(id, (stageMap.get(id) ?? 0) + 1);
  }
  const stageGroups: StageGroup[] = Array.from(stageMap.entries()).map(
    ([stageId, value]) => ({
      name: stageIdToName?.[stageId] ?? stageLabel(stageId),
      value,
      stageId,
    })
  );

  const deptMap = new Map<string, number>();
  for (const d of deals) {
    const dept = getDepartment(d);
    deptMap.set(dept, (deptMap.get(dept) ?? 0) + 1);
  }
  const departmentGroups: DepartmentGroup[] = Array.from(deptMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const reasonMap = new Map<string, number>();
  for (const d of rejectedDeals) {
    const reason = getRejectionReason(d);
    reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1);
  }
  const rejectionReasons: RejectionReasonRow[] = Array.from(reasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return {
    kpi: {
      totalRequests,
      totalRejections,
      rejectionRate,
      avgDelayHours,
    },
    stageGroups,
    departmentGroups,
    rejectionReasons,
  };
}
