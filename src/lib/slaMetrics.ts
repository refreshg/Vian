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

export interface PriceSharingDebugRow {
  dealId: string;
  entryTime: string;
  exitTime: string;
  diffHours: number;
  isOnTime: boolean;
}

/** Known stage IDs from Bitrix24 (deal.ID is string, OWNER_ID is number — always compare as strings). */
const STAGE_NEW = "NEW";
const STAGE_C1_NEW = "C1:NEW";
const STAGE_FOLLOW_UP = "C1:UC_NX31U2";
const STAGE_PRICE_SHARING = "C1:FINAL_INVOICE";

const ONE_HOUR_MS = 3600000;
const TWENTY_FOUR_HOURS_MS = 86400000;

/** Parse date string to milliseconds; returns NaN if invalid. */
function parseTimeMs(value: string | undefined | null): number {
  if (value == null || typeof value !== "string") return NaN;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : NaN;
}

/** Normalize STAGE_ID for comparison (trim, no case change — Bitrix returns exact casing). */
function stageId(value: StageHistoryItem["STAGE_ID"]): string {
  return value != null ? String(value).trim() : "";
}

/**
 * Group history by deal. crm.deal.list returns deal.ID as string; crm.stagehistory.list
 * returns OWNER_ID as number — always use String() when building keys so lookup matches.
 */
function buildHistoryMap(
  histories: StageHistoryItem[]
): Record<string, StageHistoryItem[]> {
  const historyMap: Record<string, StageHistoryItem[]> = {};
  const list = Array.isArray(histories) ? histories : [];
  for (const event of list) {
    const dealId =
      (event as any).OWNER_ID ?? (event as any).ENTITY_ID ?? (event as any).ITEM_ID;
    if (dealId == null || dealId === "") continue;
    const key = String(dealId);
    if (!historyMap[key]) historyMap[key] = [];
    historyMap[key].push(event);
  }
  for (const key of Object.keys(historyMap)) {
    historyMap[key].sort((a, b) => {
      const ta = parseTimeMs(a.CREATED_TIME);
      const tb = parseTimeMs(b.CREATED_TIME);
      return ta - tb;
    });
  }
  return historyMap;
}

function makeMetric(
  title: string,
  onTimeCount: number,
  totalCount: number
): SlaMetric {
  const rate =
    totalCount > 0
      ? Math.round(((onTimeCount / totalCount) * 100) * 10) / 10
      : 0;
  return { title, onTimeCount, totalCount, rate };
}

export function computeSlaMetrics(
  deals: BitrixDeal[],
  histories: StageHistoryItem[],
  _stageIdToName?: Record<string, string>,
  options?: { priceSharingDebugOut?: PriceSharingDebugRow[] }
): SlaSummary {
  const safeDeals = Array.isArray(deals) ? deals : [];
  const historyMap = buildHistoryMap(histories);

  // —— A. First Communication (< 1 hour from DATE_CREATE to first non-NEW move) ——
  let firstOnTime = 0;
  let firstTotal = 0;
  for (const deal of safeDeals) {
    const dealId = deal?.ID != null ? String(deal.ID) : "";
    if (!dealId) continue;
    const events = historyMap[dealId];
    if (!events?.length) continue;
    const firstNonNew = events.find(
      (e) =>
        stageId(e.STAGE_ID) !== STAGE_NEW && stageId(e.STAGE_ID) !== STAGE_C1_NEW
    );
    if (!firstNonNew) continue;
    firstTotal += 1;
    const dateCreate = deal?.DATE_CREATE;
    const createMs = parseTimeMs(
      typeof dateCreate === "string" ? dateCreate : undefined
    );
    const eventMs = parseTimeMs(firstNonNew.CREATED_TIME);
    if (!Number.isFinite(createMs) || !Number.isFinite(eventMs)) continue;
    const diffMs = eventMs - createMs;
    if (diffMs <= ONE_HOUR_MS) firstOnTime += 1;
  }

  // —— B. Follow-up (< 24 hours from entry into C1:UC_NX31U2 to next event or now) ——
  let followOnTime = 0;
  let followTotal = 0;
  for (const deal of safeDeals) {
    const dealId = deal?.ID != null ? String(deal.ID) : "";
    if (!dealId) continue;
    const events = historyMap[dealId];
    if (!events?.length) continue;
    const entryIndex = events.findIndex(
      (e) => stageId(e.STAGE_ID) === STAGE_FOLLOW_UP
    );
    if (entryIndex === -1) continue;
    followTotal += 1;
    const entryMs = parseTimeMs(events[entryIndex].CREATED_TIME);
    if (!Number.isFinite(entryMs)) continue;
    const nextEvent = events[entryIndex + 1];
    const endMs = nextEvent
      ? parseTimeMs(nextEvent.CREATED_TIME)
      : Date.now();
    const endMsSafe = Number.isFinite(endMs) ? endMs : Date.now();
    const diffMs = endMsSafe - entryMs;
    if (diffMs <= TWENTY_FOUR_HOURS_MS) followOnTime += 1;
  }

  // —— C. Price Sharing (< 24 hours from entry into C1:FINAL_INVOICE to next event or now) ——
  let priceOnTime = 0;
  let priceTotal = 0;
  for (const deal of safeDeals) {
    const dealId = deal?.ID != null ? String(deal.ID) : "";
    if (!dealId) continue;
    const events = historyMap[dealId];
    if (!events?.length) continue;
    const entryIndex = events.findIndex(
      (e) => stageId(e.STAGE_ID) === STAGE_PRICE_SHARING
    );
    if (entryIndex === -1) continue;
    priceTotal += 1;
    const entryMs = parseTimeMs(events[entryIndex].CREATED_TIME);
    if (!Number.isFinite(entryMs)) continue;
    const nextEvent = events[entryIndex + 1];
    const endMs = nextEvent
      ? parseTimeMs(nextEvent.CREATED_TIME)
      : Date.now();
    const endMsSafe = Number.isFinite(endMs) ? endMs : Date.now();
    const diffMs = endMsSafe - entryMs;
    const diffHours = diffMs / (1000 * 60 * 60);
    const isOnTime = diffMs <= TWENTY_FOUR_HOURS_MS;
    if (options?.priceSharingDebugOut) {
      options.priceSharingDebugOut.push({
        dealId,
        entryTime: String(events[entryIndex].CREATED_TIME ?? ""),
        exitTime: nextEvent
          ? String(nextEvent.CREATED_TIME ?? "")
          : new Date(endMsSafe).toISOString(),
        diffHours,
        isOnTime,
      });
    }
    if (isOnTime) priceOnTime += 1;
  }

  if (
    options?.priceSharingDebugOut &&
    process.env.NODE_ENV !== "production"
  ) {
    console.log(
      "SLA Verification - Price Sharing:",
      options.priceSharingDebugOut
    );
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
