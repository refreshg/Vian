import type { BitrixDeal } from "@/types/bitrix";
import type { BitrixActivityItem, StageHistoryItem } from "./bitrix";

export interface SlaMetric {
  title: string;
  onTimeCount: number;
  totalCount: number;
  rate: number; // percentage 0-100
}

export interface SlaSummary {
  firstCommunication: SlaMetric;
  followUp: SlaMetric;
  followUpMonths: SlaMetric;
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

/** Raw 24/7 calendar hours between two timestamps (no business-hours logic). */
function calendarHoursBetween(startMs: number, endMs: number): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs)
    return 0;
  return (endMs - startMs) / ONE_HOUR_MS;
}

/** Stage name phrases for multi-pipeline SLA (stage IDs differ per pipeline, e.g. C1:NEW vs C2:NEW). */
const PHRASE_INITIAL = "Coordinator did not start";
const PHRASE_FOLLOW_UP = "Follow up in 24 Hours";
const PHRASE_FOLLOW_UP_MONTHS = "Follow up in Months";
const PHRASE_CONTACT_SUCCESSFUL = "Contact was Successful";
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

function stageIdsMatchingRegex(
  stageIdToName: Record<string, string>,
  pattern: RegExp
): Set<string> {
  const set = new Set<string>();
  for (const [id, name] of Object.entries(stageIdToName)) {
    if (pattern.test(name ?? "")) set.add(id.trim());
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

function activityEffectiveTimeMs(activity: BitrixActivityItem): number {
  const completed = String(activity.COMPLETED ?? "").toUpperCase() === "Y";
  const completedAt = parseTimeMs(
    String(activity.END_TIME ?? activity.LAST_UPDATED ?? "")
  );
  if (completed && Number.isFinite(completedAt)) return completedAt;
  return Date.now();
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
  activitiesByDeal: Record<string, BitrixActivityItem[]> = {},
  options?: {
    priceSharingDebugOut?: PriceSharingDebugRow[];
    firstCommDebugOut?: any[];
    followUpOverrideIdToName?: Record<string, string>;
    followUpMonthsDebugOut?: any[];
  }
): SlaSummary {
  console.log("🚀 SLA Metrics calculation started...");
  const safeDeals = Array.isArray(deals) ? deals : [];
  const historyMap = buildHistoryMap(histories);

  const initialStageIds = buildInitialStageIds(stageIdToName);
  const followUpStageIds = stageIdsMatchingName(stageIdToName, PHRASE_FOLLOW_UP);
  const followUpDayStageIds = stageIdsMatchingRegex(
    stageIdToName,
    /\bDay\s*[1-5]\b/i
  );
  const contactSuccessfulStageIds = stageIdsMatchingName(
    stageIdToName,
    PHRASE_CONTACT_SUCCESSFUL
  );
  const followUpMonthsStageIds = stageIdsMatchingName(
    stageIdToName,
    PHRASE_FOLLOW_UP_MONTHS
  );
  const priceSharingStageIds = stageIdsMatchingName(
    stageIdToName,
    PHRASE_PRICE_SHARING
  );

  const isInitialStage = (sid: string) => initialStageIds.has(sid);
  const isFollowUpStage = (sid: string) => followUpStageIds.has(sid);
  const isFollowUpDayStage = (sid: string) => followUpDayStageIds.has(sid);
  const isContactSuccessfulStage = (sid: string) =>
    contactSuccessfulStageIds.has(sid);
  const isFollowUpMonthsStage = (sid: string) =>
    followUpMonthsStageIds.has(sid);
  const isPriceSharingStage = (sid: string) => priceSharingStageIds.has(sid);

  // Debug: verify stage detection for Follow up in Months
  if (process.env.NODE_ENV !== "production") {
    console.log("🧩 SLA stage match counts:", {
      followUpMonthsStageIds: followUpMonthsStageIds.size,
      followUpDayStageIds: followUpDayStageIds.size,
      contactSuccessfulStageIds: contactSuccessfulStageIds.size,
    });
  }

  // —— A. First Communication (<= 1 calendar hour from DATE_CREATE to first move out of initial stage) ——
  // First transition to ANY stage strictly different from initial. Ignore creation-moment assignment (event time must be > createMs).
  const FIRST_COMMUNICATION_LIMIT_HOURS = 1;
  let firstOnTime = 0;
  let firstTotal = 0;
  const firstCommDebug: any[] = [];
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
    const endMs = firstCommEnteredAt
      ? parseTimeMs(firstCommEnteredAt)
      : nowMs;
    const endMsSafe = Number.isFinite(endMs) ? endMs : nowMs;
    const diffHours = calendarHoursBetween(createMs, endMsSafe);
    const isOnTime = diffHours <= FIRST_COMMUNICATION_LIMIT_HOURS;
    firstTotal += 1;
    if (isOnTime) firstOnTime += 1;
    const triggerStageLabel =
      triggerStageId != null
        ? (stageIdToName[triggerStageId] ?? triggerStageId)
        : "PENDING";
    firstCommDebug.push({
      Deal_ID: dealId,
      Created_At: typeof dateCreate === "string" ? dateCreate : String(dateCreate ?? ""),
      Trigger_Stage: triggerStageLabel,
      First_Comm_At: firstCommEnteredAt ?? "PENDING",
      Calculated_Hours: Math.round(diffHours * 100) / 100,
      Is_On_Time: isOnTime,
    });
  }

  // —— B. Follow-up on Time (Day 1 - Day 5; on-time when it reaches "Contact was Successful" within 5 days) ——
  let followOnTime = 0;
  let followTotal = 0;
  const FIVE_DAYS_MS = 5 * TWENTY_FOUR_HOURS_MS;
  const normalizeYes = (value: unknown): boolean => {
    const raw = String(value ?? "").trim().toLowerCase();
    return raw === "yes" || raw === "y" || raw === "true" || raw === "1";
  };
  const isYesValue = (value: unknown): boolean => {
    // Bitrix dropdowns can return ID, label, array of IDs, or delimited string.
    if (normalizeYes(value)) return true;
    const parts: string[] = [];
    if (Array.isArray(value)) {
      for (const v of value) parts.push(String(v ?? "").trim());
    } else {
      const s = String(value ?? "").trim();
      if (s) {
        // split on common delimiters for multi-values
        for (const p of s.split(/[,\|;]+/g)) parts.push(p.trim());
      }
    }
    for (const id of parts) {
      if (!id) continue;
      if (normalizeYes(id)) return true;
      const mappedLabel = options?.followUpOverrideIdToName?.[id];
      if (normalizeYes(mappedLabel)) return true;
    }
    return false;
  };
  for (const deal of safeDeals) {
    const dealId = deal?.ID != null ? String(deal.ID) : "";
    if (!dealId) continue;
    const events = historyMap[dealId];
    // Override: if UF_CRM_1774537634447 is "yes" (or maps to Yes), count as on-time
    // even if the deal never entered Day 1-5 / Follow-up stages.
    if (isYesValue((deal as any).UF_CRM_1774537634447)) {
      followTotal += 1;
      followOnTime += 1;
      continue;
    }
    if (!events?.length) continue;
    const entryIndex = events.findIndex((e) => {
      const sid = stageId(e.STAGE_ID);
      return isFollowUpStage(sid) || isFollowUpDayStage(sid);
    });
    if (entryIndex === -1) continue;
    followTotal += 1;
    const entryMs = parseTimeMs(events[entryIndex].CREATED_TIME);
    if (!Number.isFinite(entryMs)) continue;
    const successEvent = events
      .slice(entryIndex + 1)
      .find((e) => isContactSuccessfulStage(stageId(e.STAGE_ID)));
    if (!successEvent) continue;
    const successMs = parseTimeMs(successEvent.CREATED_TIME);
    if (!Number.isFinite(successMs)) continue;
    const diffMs = successMs - entryMs;
    if (diffMs <= FIVE_DAYS_MS) followOnTime += 1;
  }

  // —— B2. Follow-up in Months on Time ——
  // Qualifying: entered "Follow up in Months".
  // On-time: entry happened within the same calendar month as deal creation.
  // Override: UF_CRM_1774537634447 = yes → on-time regardless.
  let followMonthsOnTime = 0;
  let followMonthsTotal = 0;
  for (const deal of safeDeals) {
    const dealId = deal?.ID != null ? String(deal.ID) : "";
    if (!dealId) continue;
    const events = historyMap[dealId];
    if (!events?.length) continue;
    const entryIndex = events.findIndex((e) =>
      isFollowUpMonthsStage(stageId(e.STAGE_ID))
    );
    if (entryIndex === -1) continue;
    followMonthsTotal += 1;
    if (isYesValue((deal as any).UF_CRM_1774537634447)) {
      followMonthsOnTime += 1;
      continue;
    }
    const createMs = parseTimeMs(String((deal as any).DATE_CREATE ?? ""));
    const entryMs = parseTimeMs(events[entryIndex].CREATED_TIME);
    if (!Number.isFinite(createMs) || !Number.isFinite(entryMs)) continue;
    const createdAt = new Date(createMs);
    const enteredAt = new Date(entryMs);
    const sameMonth =
      createdAt.getFullYear() === enteredAt.getFullYear() &&
      createdAt.getMonth() === enteredAt.getMonth();
    if (sameMonth) followMonthsOnTime += 1;
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

  console.log("🚨 FIRST COMM VERIFICATION (24/7):", firstCommDebug);
  if (options?.firstCommDebugOut) {
    options.firstCommDebugOut.push(...firstCommDebug);
  }

  return {
    firstCommunication: makeMetric(
      "First Communication on Time",
      firstOnTime,
      firstTotal
    ),
    followUp: makeMetric("Follow-up on Time", followOnTime, followTotal),
    followUpMonths: makeMetric(
      "Follow up in Months on Time",
      followMonthsOnTime,
      followMonthsTotal
    ),
    priceSharing: makeMetric(
      "Price sharing to Patient on Time",
      priceOnTime,
      priceTotal
    ),
  };
}
