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

const ONE_HOUR_MS = 3600000;
const TWENTY_FOUR_HOURS_MS = 86400000;

/** Stage name phrases for multi-pipeline SLA (stage IDs differ per pipeline, e.g. C1:NEW vs C2:NEW). */
const PHRASE_INITIAL = "Coordinator did not start";
const PHRASE_FOLLOW_UP = "Follow up in 24 Hours";
const PHRASE_PRICE_SHARING = "Offer Finalization for Patient";

/** Return stage IDs whose human-readable name contains the given phrase (case-insensitive). */
function stageIdsMatchingName(
  stageIdToName: Record<string, string>,
  phrase: string
): Set<string> {
  const set = new Set<string>();
  const needle = (phrase ?? "").trim().toLowerCase();
  if (!needle) return set;
  for (const [id, name] of Object.entries(stageIdToName)) {
    if ((name ?? "").toLowerCase().includes(needle)) set.add(id.trim());
  }
  return set;
}

/** Initial stages: name contains "Coordinator did not start" or stage ID is NEW / *:NEW. */
function buildInitialStageIds(stageIdToName: Record<string, string>): Set<string> {
  const set = stageIdsMatchingName(stageIdToName, PHRASE_INITIAL);
  for (const id of Object.keys(stageIdToName)) {
    const s = id.trim();
    if (s === "NEW" || s.endsWith(":NEW")) set.add(s);
  }
  return set;
}

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
  stageIdToName: Record<string, string> = {},
  options?: { priceSharingDebugOut?: PriceSharingDebugRow[] }
): SlaSummary {
  const safeDeals = Array.isArray(deals) ? deals : [];
  const historyMap = buildHistoryMap(histories);

  const initialStageIds = buildInitialStageIds(stageIdToName);
  const followUpStageIds = stageIdsMatchingName(stageIdToName, PHRASE_FOLLOW_UP);
  const priceSharingStageIds = stageIdsMatchingName(
    stageIdToName,
    PHRASE_PRICE_SHARING
  );

  const isInitialStage = (sid: string) => initialStageIds.has(sid);
  const isFollowUpStage = (sid: string) => followUpStageIds.has(sid);
  const isPriceSharingStage = (sid: string) => priceSharingStageIds.has(sid);

  // —— A. First Communication (< 1 hour from DATE_CREATE to first non-initial move) ——
  let firstOnTime = 0;
  let firstTotal = 0;
  for (const deal of safeDeals) {
    const dealId = deal?.ID != null ? String(deal.ID) : "";
    if (!dealId) continue;
    const events = historyMap[dealId];
    if (!events?.length) continue;
    const firstNonInitial = events.find(
      (e) => !isInitialStage(stageId(e.STAGE_ID))
    );
    if (!firstNonInitial) continue;
    firstTotal += 1;
    const dateCreate = deal?.DATE_CREATE;
    const createMs = parseTimeMs(
      typeof dateCreate === "string" ? dateCreate : undefined
    );
    const eventMs = parseTimeMs(firstNonInitial.CREATED_TIME);
    if (!Number.isFinite(createMs) || !Number.isFinite(eventMs)) continue;
    const diffMs = eventMs - createMs;
    if (diffMs <= ONE_HOUR_MS) firstOnTime += 1;
  }

  // —— B. Follow-up (< 24 hours from entry into "Follow up in 24 Hours" to next event or now) ——
  let followOnTime = 0;
  let followTotal = 0;
  for (const deal of safeDeals) {
    const dealId = deal?.ID != null ? String(deal.ID) : "";
    if (!dealId) continue;
    const events = historyMap[dealId];
    if (!events?.length) continue;
    const entryIndex = events.findIndex((e) =>
      isFollowUpStage(stageId(e.STAGE_ID))
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

  // —— C. Price Sharing (< 24 hours from entry into "Offer Finalization for Patient" to next event or now) ——
  let priceOnTime = 0;
  let priceTotal = 0;
  for (const deal of safeDeals) {
    const dealId = deal?.ID != null ? String(deal.ID) : "";
    if (!dealId) continue;
    const events = historyMap[dealId];
    if (!events?.length) continue;
    const entryIndex = events.findIndex((e) =>
      isPriceSharingStage(stageId(e.STAGE_ID))
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
