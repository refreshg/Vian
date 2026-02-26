import type { BitrixDeal } from "@/types/bitrix";
import type { StageHistoryItem } from "./bitrix";

export interface SlaMetric {
  title: string;
  onTimeCount: number;
  totalCount: number;
  rate: number; // percentage 0-100
}

export interface SlaSummary {
  firstCommunication: SlaMetric;
  followUp: SlaMetric;
  priceSharing: SlaMetric;
}

function diffHours(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return NaN;
  return (end - start) / (1000 * 60 * 60);
}

function buildHistoryByDeal(
  histories: StageHistoryItem[]
): Record<string, StageHistoryItem[]> {
  const safeHistories = Array.isArray(histories) ? histories : [];
  const byId: Record<string, StageHistoryItem[]> = {};
  for (const h of safeHistories) {
    const id = String(h.OWNER_ID);
    if (!byId[id]) byId[id] = [];
    byId[id].push(h);
  }
  for (const id of Object.keys(byId)) {
    byId[id].sort(
      (a, b) =>
        new Date(a.CREATED_TIME).getTime() -
        new Date(b.CREATED_TIME).getTime()
    );
  }
  return byId;
}

const normalizeName = (s: string) => s.trim().toLowerCase();

/**
 * Get the human-readable stage name for a history record using the pipeline map.
 * History uses STAGE_ID (or STATUS_ID); we translate via crm.status.list result.
 */
function getStageNameFromHistory(
  h: StageHistoryItem,
  stageIdToName: Record<string, string>
): string {
  const id = (h.STAGE_ID ?? h.STATUS_ID ?? "") as string;
  if (!id) return "";
  return stageIdToName[id] ?? id;
}

/** Check if a history record's stage (translated to name) matches the target name. */
function stageRecordMatchesName(
  h: StageHistoryItem,
  targetName: string,
  stageIdToName: Record<string, string>
): boolean {
  const name = getStageNameFromHistory(h, stageIdToName);
  return normalizeName(name) === normalizeName(targetName);
}

function makeMetric(
  title: string,
  onTimeCount: number,
  totalCount: number
): SlaMetric {
  const rate =
    totalCount > 0 ? Math.round(((onTimeCount / totalCount) * 100) * 10) / 10 : 0;
  return { title, onTimeCount, totalCount, rate };
}

export function computeSlaMetrics(
  deals: BitrixDeal[],
  histories: StageHistoryItem[],
  stageIdToName?: Record<string, string>
): SlaSummary {
  const safeDeals = Array.isArray(deals) ? deals : [];
  const safeHistories = Array.isArray(histories) ? histories : [];
  const historyByDeal = buildHistoryByDeal(safeHistories);

  const stageNameMap = stageIdToName ?? {};

  // 1. First Communication on Time (< 1 hour from DATE_CREATE to very first logged stage transition)
  let firstOnTime = 0;
  let firstTotal = 0;
  for (const deal of safeDeals) {
    const dealHistory = historyByDeal[deal.ID];
    if (!dealHistory || dealHistory.length === 0 || !deal.DATE_CREATE) continue;
    const firstTransition = dealHistory[0];
    const hours = diffHours(deal.DATE_CREATE, firstTransition.CREATED_TIME);
    if (!Number.isFinite(hours)) continue;
    firstTotal += 1;
    if (hours < 1) firstOnTime += 1;
  }

  // 2. Follow-up on Time (< 24 hours in "Follow up in 24 Hours" stage)
  // Match by translating history STAGE_ID to name via pipeline map, then compare to target name.
  const followUpTargetName = "Follow up in 24 Hours";
  let followOnTime = 0;
  let followTotal = 0;
  for (const deal of safeDeals) {
    const dealHistory = historyByDeal[deal.ID];
    if (!dealHistory || dealHistory.length === 0) continue;
    const enterIndex = dealHistory.findIndex((h) =>
      stageRecordMatchesName(h, followUpTargetName, stageNameMap)
    );
    if (enterIndex === -1) continue;
    const enterTime = dealHistory[enterIndex].CREATED_TIME;
    const exitRecord = dealHistory
      .slice(enterIndex + 1)
      .find((h) => !stageRecordMatchesName(h, followUpTargetName, stageNameMap));
    if (!exitRecord) continue;
    const hours = diffHours(enterTime, exitRecord.CREATED_TIME);
    if (!Number.isFinite(hours)) continue;
    followTotal += 1;
    if (hours < 24) followOnTime += 1;
  }

  // 3. Price sharing to Patient on Time (< 24 hours in "Offer Finalization for Patient" stage)
  // Match by translating history STAGE_ID to name via pipeline map, then compare to target name.
  const priceTargetName = "Offer Finalization for Patient";
  let priceOnTime = 0;
  let priceTotal = 0;
  for (const deal of safeDeals) {
    const dealHistory = historyByDeal[deal.ID];
    if (!dealHistory || dealHistory.length === 0) continue;
    const enterIndex = dealHistory.findIndex((h) =>
      stageRecordMatchesName(h, priceTargetName, stageNameMap)
    );
    if (enterIndex === -1) continue;
    const enterTime = dealHistory[enterIndex].CREATED_TIME;
    const exitRecord = dealHistory
      .slice(enterIndex + 1)
      .find((h) => !stageRecordMatchesName(h, priceTargetName, stageNameMap));
    if (!exitRecord) continue;
    const hours = diffHours(enterTime, exitRecord.CREATED_TIME);
    if (!Number.isFinite(hours)) continue;
    priceTotal += 1;
    if (hours < 24) priceOnTime += 1;
  }

  return {
    firstCommunication: makeMetric(
      "First Communication on Time",
      firstOnTime,
      firstTotal
    ),
    followUp: makeMetric("Follow-up on Time", followOnTime, followTotal),
    priceSharing: makeMetric(
      "Price sharing to Patient on Time",
      priceOnTime,
      priceTotal
    ),
  };
}

