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

/**
 * Resolve department display name from deal using field options map.
 * Raw value is option ID (numeric/string); map to human-readable name or "Unassigned".
 */
function getDepartmentName(
  deal: BitrixDeal,
  departmentIdToName: Record<string, string> | undefined
): string {
  const raw = deal.UF_CRM_1758023694929;
  if (raw == null || raw === "") return "Unassigned";
  const id = String(raw);
  if (!departmentIdToName) return id;
  return departmentIdToName[id] ?? "Unassigned";
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

export interface CommentListRow {
  label: string;
  count: number;
}

export interface SourceGroup {
  name: string;
  count: number;
  sourceRate: number;
}

export interface CountryGroup {
  name: string;
  count: number;
  percentage: number;
}

export function computeDashboardData(
  deals: BitrixDeal[],
  stageIdToName?: Record<string, string>,
  departmentIdToName?: Record<string, string>,
  rejectionReasonIdToName?: Record<string, string>,
  rejectionReasonFieldId?: string,
  commentListIdToName?: Record<string, string>,
  sourceIdToName?: Record<string, string>,
  countryIdToName?: Record<string, string>,
  allStageIdsInOrder?: string[]
): {
  kpi: KpiStats;
  stageGroups: StageGroup[];
  departmentGroups: DepartmentGroup[];
  rejectionReasons: RejectionReasonRow[];
  commentListRows: CommentListRow[];
  sourceGroups: SourceGroup[];
  countryGroups: CountryGroup[];
} {
  const totalRequests = deals.length;
  const rejectedDeals = deals.filter((d) => isRejectionStage(d.STAGE_ID ?? ""));
  const totalRejections = rejectedDeals.length;
  const rejectionRate =
    totalRequests > 0 ? Math.round((totalRejections / totalRequests) * 100) : 0;
  const avgDelayHours = 1; // Placeholder until custom field or logic exists

  // Build stage counts: if we have pipeline order, start with all stages at 0, then merge deal counts
  const stageMap = new Map<string, number>();
  if (allStageIdsInOrder && allStageIdsInOrder.length > 0) {
    for (const id of allStageIdsInOrder) {
      stageMap.set(id, 0);
    }
  }
  for (const d of deals) {
    const id = d.STAGE_ID ?? "Unknown";
    stageMap.set(id, (stageMap.get(id) ?? 0) + 1);
  }
  const stageGroups: StageGroup[] = (allStageIdsInOrder && allStageIdsInOrder.length > 0
    ? allStageIdsInOrder
    : Array.from(stageMap.keys())
  ).map((stageId) => ({
    stageId,
    name: stageIdToName?.[stageId] ?? stageLabel(stageId),
    value: stageMap.get(stageId) ?? 0,
  }));
  // Append any stages that appear in deals but not in pipeline list (e.g. unknown/legacy)
  if (allStageIdsInOrder && allStageIdsInOrder.length > 0) {
    const pipelineSet = new Set(allStageIdsInOrder);
    Array.from(stageMap.entries()).forEach(([stageId, value]) => {
      if (!pipelineSet.has(stageId) && value > 0) {
        stageGroups.push({
          stageId,
          name: stageIdToName?.[stageId] ?? stageLabel(stageId),
          value,
        });
      }
    });
  }

  const deptMap = new Map<string, number>();
  for (const d of deals) {
    const dept = getDepartmentName(d, departmentIdToName);
    deptMap.set(dept, (deptMap.get(dept) ?? 0) + 1);
  }
  const departmentGroups: DepartmentGroup[] = Array.from(deptMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // Rejection reasons = deals with rejection field set, grouped by mapped string value
  // Pipeline 1 uses UF_CRM_1753862633986, Pipeline 3 uses UF_CRM_1753861857976
  const rejectionFieldKey =
    rejectionReasonFieldId ?? "UF_CRM_1753862633986";
  const reasonMap = new Map<string, number>();
  for (const d of deals) {
    const raw = (d as any)[rejectionFieldKey];
    if (raw == null || raw === "") continue;
    const id = String(raw);
    const name = rejectionReasonIdToName?.[id] ?? id;
    reasonMap.set(name, (reasonMap.get(name) ?? 0) + 1);
  }
  const rejectionReasons: RejectionReasonRow[] = Array.from(reasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  // Comment (list) = deals with UF_CRM_1768995573895 set, grouped by mapped string value
  const commentMap = new Map<string, number>();
  for (const d of deals) {
    const raw = d.UF_CRM_1768995573895;
    if (raw == null || raw === "") continue;
    const id = String(raw);
    const name = commentListIdToName?.[id] ?? id;
    commentMap.set(name, (commentMap.get(name) ?? 0) + 1);
  }
  const commentListRows: CommentListRow[] = Array.from(commentMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // Requests by Source: group by SOURCE_ID (mapped to name), count and source rate (%), sort by count desc
  const sourceMap = new Map<string, number>();
  for (const d of deals) {
    const raw = d.SOURCE_ID ?? "";
    const id = raw === "" ? "__empty__" : String(raw);
    const name = raw === "" ? "Unassigned" : (sourceIdToName?.[id] ?? id);
    sourceMap.set(name, (sourceMap.get(name) ?? 0) + 1);
  }
  const sourceGroups: SourceGroup[] = Array.from(sourceMap.entries())
    .map(([name, count]) => ({
      name,
      count,
      sourceRate: totalRequests > 0 ? (count / totalRequests) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Request rate by country: map raw country ID to name (or "(Blank)"), group, percentage, sort desc
  const countryMap = new Map<string, number>();
  for (const d of deals) {
    const raw = d.UF_CRM_1769688668259;
    const name =
      raw == null || raw === ""
        ? "(Blank)"
        : (countryIdToName?.[String(raw)] ?? String(raw));
    countryMap.set(name, (countryMap.get(name) ?? 0) + 1);
  }
  const countryGroups: CountryGroup[] = Array.from(countryMap.entries())
    .map(([name, count]) => ({
      name,
      count,
      percentage:
        totalRequests > 0
          ? Math.round((count / totalRequests) * 100 * 100) / 100
          : 0,
    }))
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
    commentListRows,
    sourceGroups,
    countryGroups,
  };
}
