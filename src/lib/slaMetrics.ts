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

/** Safely parse a date string to milliseconds; returns NaN if invalid. */
function parseTime(dateString: string | undefined | null): number {
  if (dateString == null || typeof dateString !== "string") return NaN;
  const t = new Date(dateString).getTime();
  return Number.isFinite(t) ? t : NaN;
}

function diffHours(startIso: string, endIso: string): number {
  const start = parseTime(startIso);
  const end = parseTime(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return NaN;
  return (end - start) / (1000 * 60 * 60);
}

/** Bitrix crm.stagehistory.list returns OWNER_ID = deal ID. Group history by OWNER_ID. */
function buildHistoryByDeal(
  histories: StageHistoryItem[]
): Record<string, StageHistoryItem[]> {
  const safeHistories = Array.isArray(histories) ? histories : [];
  const byOwnerId: Record<string, StageHistoryItem[]> = {};
  for (const h of safeHistories) {
    const ownerId = h.OWNER_ID != null ? String(h.OWNER_ID) : "";
    if (!ownerId) continue;
    if (!byOwnerId[ownerId]) byOwnerId[ownerId] = [];
    byOwnerId[ownerId].push(h);
  }
  for (const id of Object.keys(byOwnerId)) {
    byOwnerId[id].sort((a, b) => {
      const ta = parseTime(a.CREATED_TIME);
      const tb = parseTime(b.CREATED_TIME);
      return ta - tb;
    });
  }
  return byOwnerId;
}

/** History timestamps come from CREATED_TIME. */
function getCreatedTime(h: StageHistoryItem): string {
  return typeof h.CREATED_TIME === "string" ? h.CREATED_TIME : "";
}

/**
 * Translate STAGE_ID (e.g. C1:UC_NX31U2, C1:NEW) to human name via crm.status.list map.
 * Then check if that name (lowercase) includes the target phrase.
 */
function getStageNameFromHistory(
  h: StageHistoryItem,
  stageIdToName: Record<string, string>
): string {
  const id = h.STAGE_ID ?? "";
  if (!id) return "";
  return stageIdToName[id] ?? id;
}

function stageRecordMatchesName(
  h: StageHistoryItem,
  targetPhrase: string,
  stageIdToName: Record<string, string>
): boolean {
  const name = getStageNameFromHistory(h, stageIdToName);
  const needle = (targetPhrase ?? "").trim().toLowerCase();
  const haystack = (name ?? "").toLowerCase();
  return needle.length > 0 && haystack.includes(needle);
}

/** Initial stages (NEW, C1:NEW) are creation; first "real" move is when STAGE_ID differs. */
function isInitialStage(stageId: string): boolean {
  const s = (stageId ?? "").trim().toUpperCase();
  return s === "NEW" || s === "C1:NEW" || s.endsWith(":NEW");
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

  // 1. First Communication on Time: first transition *out* of initial stage (NEW/C1:NEW) within 1 hour of DATE_CREATE
  let firstOnTime = 0;
  let firstTotal = 0;
  for (const deal of safeDeals) {
    const dealId = deal?.ID != null ? String(deal.ID) : "";
    if (!dealId) continue;
    const dealHistory = historyByDeal[dealId];
    if (!dealHistory || dealHistory.length === 0) continue;
    const dateCreate = (deal as any).DATE_CREATE;
    if (dateCreate == null || typeof dateCreate !== "string") continue;
    const firstRealMove = dealHistory.find(
      (h) => h.STAGE_ID != null && !isInitialStage(h.STAGE_ID)
    );
    if (!firstRealMove) continue;
    const firstTime = getCreatedTime(firstRealMove);
    const hours = diffHours(dateCreate, firstTime);
    if (!Number.isFinite(hours)) continue;
    firstTotal += 1;
    if (hours < 1) firstOnTime += 1;
  }

  // 2. Follow-up on Time: STAGE_ID translated via stageIdToName; match name includes "follow up in 24 hours"
  const followUpTargetName = "Follow up in 24 Hours";
  let followOnTime = 0;
  let followTotal = 0;
  for (const deal of safeDeals) {
    const dealId = deal?.ID != null ? String(deal.ID) : "";
    if (!dealId) continue;
    const dealHistory = historyByDeal[dealId];
    if (!dealHistory || dealHistory.length === 0) continue;
    const enterIndex = dealHistory.findIndex((h) =>
      stageRecordMatchesName(h, followUpTargetName, stageNameMap)
    );
    if (enterIndex === -1) continue;
    const enterTime = getCreatedTime(dealHistory[enterIndex]);
    const exitRecord = dealHistory
      .slice(enterIndex + 1)
      .find((h) => !stageRecordMatchesName(h, followUpTargetName, stageNameMap));
    if (!exitRecord) continue;
    const hours = diffHours(enterTime, getCreatedTime(exitRecord));
    if (!Number.isFinite(hours)) continue;
    followTotal += 1;
    if (hours < 24) followOnTime += 1;
  }

  // 3. Price sharing to Patient on Time: STAGE_ID translated via stageIdToName; match name includes "offer finalization for patient"
  const priceTargetName = "Offer Finalization for Patient";
  let priceOnTime = 0;
  let priceTotal = 0;
  for (const deal of safeDeals) {
    const dealId = deal?.ID != null ? String(deal.ID) : "";
    if (!dealId) continue;
    const dealHistory = historyByDeal[dealId];
    if (!dealHistory || dealHistory.length === 0) continue;
    const enterIndex = dealHistory.findIndex((h) =>
      stageRecordMatchesName(h, priceTargetName, stageNameMap)
    );
    if (enterIndex === -1) continue;
    const enterTime = getCreatedTime(dealHistory[enterIndex]);
    const exitRecord = dealHistory
      .slice(enterIndex + 1)
      .find((h) => !stageRecordMatchesName(h, priceTargetName, stageNameMap));
    if (!exitRecord) continue;
    const hours = diffHours(enterTime, getCreatedTime(exitRecord));
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
