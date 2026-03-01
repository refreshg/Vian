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

/** Business hours: Monday–Friday 09:00–18:00. Returns elapsed business hours between startMs and endMs. */
function businessHoursBetween(startMs: number, endMs: number): number {
  if (endMs <= startMs) return 0;
  const MS_PER_HOUR = 3600000;
  const START_HOUR = 9;
  const END_HOUR = 18;
  let totalMs = 0;
  let current = new Date(startMs);
  const end = new Date(endMs);
  while (current < end) {
    const day = current.getDay();
    if (day >= 1 && day <= 5) {
      const dayStart = new Date(current);
      dayStart.setHours(START_HOUR, 0, 0, 0);
      const dayEnd = new Date(current);
      dayEnd.setHours(END_HOUR, 0, 0, 0);
      const segmentStart =
        current.getTime() < dayStart.getTime() ? dayStart : current;
      const segmentEnd =
        end.getTime() < dayEnd.getTime() ? end : dayEnd;
      if (segmentEnd.getTime() > segmentStart.getTime()) {
        totalMs += segmentEnd.getTime() - segmentStart.getTime();
      }
    }
    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
  }
  return totalMs / MS_PER_HOUR;
}

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
  options?: {
    priceSharingDebugOut?: PriceSharingDebugRow[];
    firstCommDebugOut?: any[];
  }
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

  // —— A. First Communication (< 1 business hour from DATE_CREATE to first move out of initial stage) ——
  // First transition to ANY stage strictly different from initial. Ignore the creation-moment assignment (event time must be > createMs).
  const FIRST_COMMUNICATION_LIMIT_HOURS = 1;
  let firstOnTime = 0;
  let firstTotal = 0;
  const firstCommDebug: Array<{
    Deal_ID: string;
    Created_At: string;
    Trigger_Stage: string;
    First_Comm_At: string;
    Calculated_Hours: number;
    Is_On_Time: boolean;
  }> = [];
  const nowMs = Date.now();
  for (const deal of safeDeals) {
    const dealId = deal?.ID != null ? String(deal.ID) : "";
    if (!dealId) continue;
    const dateCreate = deal?.DATE_CREATE;
    const createMs = parseTimeMs(
      typeof dateCreate === "string" ? dateCreate : undefined
    );
    if (!Number.isFinite(createMs)) continue;
    const events = historyMap[dealId] ?? [];
    let firstCommEnteredAt: string | null = null;
    let triggerStageId: string | null = null;
    for (const e of events) {
      const sid = stageId(e.STAGE_ID);
      const eventMs = parseTimeMs(e.CREATED_TIME);
      const t = e.CREATED_TIME;
      if (
        !isInitialStage(sid) &&
        t != null &&
        String(t).trim() !== "" &&
        Number.isFinite(eventMs) &&
        eventMs > createMs
      ) {
        firstCommEnteredAt = String(t).trim();
        triggerStageId = sid;
        break;
      }
    }
    let diffHours: number;
    let isOnTime: boolean;
    const triggerStageLabel =
      triggerStageId != null
        ? (stageIdToName[triggerStageId] ?? triggerStageId)
        : "PENDING";
    if (firstCommEnteredAt) {
      const eventMs = parseTimeMs(firstCommEnteredAt);
      diffHours = Number.isFinite(eventMs)
        ? businessHoursBetween(createMs, eventMs)
        : businessHoursBetween(createMs, nowMs);
      isOnTime = diffHours <= FIRST_COMMUNICATION_LIMIT_HOURS;
    } else {
      diffHours = businessHoursBetween(createMs, nowMs);
      isOnTime = diffHours <= FIRST_COMMUNICATION_LIMIT_HOURS;
    }
    firstTotal += 1;
    if (isOnTime) firstOnTime += 1;
    firstCommDebug.push({
      Deal_ID: dealId,
      Created_At: typeof dateCreate === "string" ? dateCreate : String(dateCreate ?? ""),
      Trigger_Stage: triggerStageLabel,
      First_Comm_At: firstCommEnteredAt ?? "PENDING",
      Calculated_Hours: Math.round(diffHours * 100) / 100,
      Is_On_Time: isOnTime,
    });
  }
  console.log("🚨 FIRST COMM DEBUG:", firstCommDebug);
  if (options?.firstCommDebugOut) {
    options.firstCommDebugOut.push(...firstCommDebug);
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
  const priceSharingDebug: Array<{
    Deal_ID: string;
    Entered_Stage_At: string;
    Exited_Stage_At: string;
    Calculated_Hours: number;
    Is_On_Time: boolean;
  }> = [];
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
    const enteredAt = String(events[entryIndex].CREATED_TIME ?? "");
    const exitedAt = nextEvent
      ? String(nextEvent.CREATED_TIME ?? "")
      : "Still in stage";
    priceSharingDebug.push({
      Deal_ID: dealId,
      Entered_Stage_At: enteredAt,
      Exited_Stage_At: exitedAt,
      Calculated_Hours: Math.round(diffHours * 100) / 100,
      Is_On_Time: isOnTime,
    });
    if (options?.priceSharingDebugOut) {
      options.priceSharingDebugOut.push({
        dealId,
        entryTime: enteredAt,
        exitTime: nextEvent ? exitedAt : new Date(endMsSafe).toISOString(),
        diffHours,
        isOnTime,
      });
    }
    if (isOnTime) priceOnTime += 1;
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
