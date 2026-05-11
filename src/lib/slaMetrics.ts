import type { BitrixDeal } from "@/types/bitrix";
import type { BitrixActivityItem, StageHistoryItem } from "./bitrix";

/** Price-sharing stage per pipeline (Bitrix STATUS_ID). */
export const PRICE_SHARING_STAGE_ID_BY_CATEGORY: Record<string, string> = {
  "1": "C1:UC_W95SAM",
  "2": "C2:FINAL_INVOICE",
  "3": "C3:UC_QHKPK0",
  "4": "C4:UC_GR8ROT",
  "5": "C5:UC_0VR22O",
};

export interface SlaDealRow {
  dealId: string;
  title: string;
  stageId: string;
  stageName: string;
  detail: string;
}

export interface SlaMetric {
  title: string;
  onTimeCount: number;
  totalCount: number;
  rate: number; // percentage 0-100
  /** Broader pool for context (e.g. all in-range deals with valid create). */
  poolCount?: number;
  rows?: SlaDealRow[];
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
  diffBusinessHours?: number;
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

export interface BusinessHoursConfig {
  workdayStartHour: number;
  workdayEndHour: number;
}

export function getBusinessHoursForCategory(
  categoryId?: string
): BusinessHoursConfig {
  const id = String(categoryId ?? "1").trim();
  if (id === "4") {
    return { workdayStartHour: 10, workdayEndHour: 19 };
  }
  return { workdayStartHour: 9, workdayEndHour: 18 };
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** True if local timestamp falls on a weekday and clock time is in [start, end) hours. */
export function isInstantInBusinessHours(
  ms: number,
  businessHours: BusinessHoursConfig
): boolean {
  if (!Number.isFinite(ms)) return false;
  const d = new Date(ms);
  if (isWeekend(d)) return false;
  const { workdayStartHour, workdayEndHour } = businessHours;
  if (workdayEndHour <= workdayStartHour) return false;
  const mins = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  const startM = workdayStartHour * 60;
  const endM = workdayEndHour * 60;
  return mins >= startM && mins < endM;
}

function businessHoursBetween(
  startMs: number,
  endMs: number,
  businessHours: BusinessHoursConfig
): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 0;
  }
  const { workdayStartHour, workdayEndHour } = businessHours;
  if (workdayEndHour <= workdayStartHour) return 0;

  let totalMs = 0;
  const cursor = new Date(startMs);
  cursor.setHours(0, 0, 0, 0);
  const endDate = new Date(endMs);
  endDate.setHours(0, 0, 0, 0);

  while (cursor.getTime() <= endDate.getTime()) {
    if (!isWeekend(cursor)) {
      const dayStart = new Date(cursor);
      dayStart.setHours(workdayStartHour, 0, 0, 0);
      const dayEnd = new Date(cursor);
      dayEnd.setHours(workdayEndHour, 0, 0, 0);
      const segStart = Math.max(startMs, dayStart.getTime());
      const segEnd = Math.min(endMs, dayEnd.getTime());
      if (segEnd > segStart) totalMs += segEnd - segStart;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return totalMs / ONE_HOUR_MS;
}

/** Stage name phrases for multi-pipeline SLA (stage IDs differ per pipeline, e.g. C1:NEW vs C2:NEW). */
const PHRASE_INITIAL = "Coordinator did not start";
const PHRASE_FOLLOW_UP = "Follow up in 24 Hours";
const PHRASE_CONTACT_SUCCESSFUL = "Contact was Successful";
const PHRASE_ACTIVE_COMMUNICATION = "Active communication";

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

function activityScheduledMs(activity: BitrixActivityItem): number {
  const d = parseTimeMs(String(activity.DEADLINE ?? "").trim());
  if (Number.isFinite(d)) return d;
  return parseTimeMs(String(activity.START_TIME ?? "").trim());
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
  totalCount: number,
  extras?: Partial<Pick<SlaMetric, "poolCount" | "rows">>
): SlaMetric {
  const rate =
    totalCount > 0
      ? Math.round(((onTimeCount / totalCount) * 100) * 10) / 10
      : 0;
  return {
    title,
    onTimeCount,
    totalCount,
    rate,
    ...extras,
  };
}

function dealRow(
  deal: BitrixDeal,
  stageIdToName: Record<string, string>,
  detail: string
): SlaDealRow {
  const sid = String(deal.STAGE_ID ?? "");
  return {
    dealId: String(deal.ID ?? ""),
    title: String(deal.TITLE ?? ""),
    stageId: sid,
    stageName: stageIdToName[sid] ?? sid,
    detail,
  };
}

export function computeSlaMetrics(
  deals: BitrixDeal[],
  histories: StageHistoryItem[],
  stageIdToName: Record<string, string> = {},
  activitiesByDeal: Record<string, BitrixActivityItem[]> = {},
  options?: {
    categoryId?: string;
    priceSharingStageId?: string;
    priceSharingDebugOut?: PriceSharingDebugRow[];
    firstCommDebugOut?: any[];
    followUpOverrideIdToName?: Record<string, string>;
    followUpMonthsDebugOut?: any[];
    businessHours?: Partial<BusinessHoursConfig>;
  }
): SlaSummary {
  const safeDeals = Array.isArray(deals) ? deals : [];
  const categoryId = String(options?.categoryId ?? "1").trim();
  const baseBh = getBusinessHoursForCategory(categoryId);
  const businessHours: BusinessHoursConfig = {
    workdayStartHour:
      options?.businessHours?.workdayStartHour ?? baseBh.workdayStartHour,
    workdayEndHour:
      options?.businessHours?.workdayEndHour ?? baseBh.workdayEndHour,
  };
  const historyMap = buildHistoryMap(histories);
  const priceSharingStageId =
    options?.priceSharingStageId ??
    PRICE_SHARING_STAGE_ID_BY_CATEGORY[categoryId] ??
    "";

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
  const activeCommunicationStageIds = stageIdsMatchingName(
    stageIdToName,
    PHRASE_ACTIVE_COMMUNICATION
  );

  const isInitialStage = (sid: string) => initialStageIds.has(sid);
  const isFollowUpStage = (sid: string) => followUpStageIds.has(sid);
  const isFollowUpDayStage = (sid: string) => followUpDayStageIds.has(sid);
  const isContactSuccessfulStage = (sid: string) =>
    contactSuccessfulStageIds.has(sid);
  const isActiveCommunicationStage = (sid: string) =>
    activeCommunicationStageIds.has(sid);
  const isPriceSharingStage = (sid: string) =>
    Boolean(priceSharingStageId) && sid === priceSharingStageId;

  const normalizeYes = (value: unknown): boolean => {
    const raw = String(value ?? "").trim().toLowerCase();
    return raw === "yes" || raw === "y" || raw === "true" || raw === "1";
  };
  const isYesValue = (value: unknown): boolean => {
    if (normalizeYes(value)) return true;
    const parts: string[] = [];
    if (Array.isArray(value)) {
      for (const v of value) parts.push(String(v ?? "").trim());
    } else {
      const s = String(value ?? "").trim();
      if (s) {
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

  // —— A. First Communication (<= 1 business hour from DATE_CREATE to first move out of initial stage) ——
  const FIRST_COMMUNICATION_LIMIT_HOURS = 1;
  const nowMs = Date.now();
  let firstPool = 0;
  let firstBhTotal = 0;
  let firstBhOnTime = 0;
  const firstCommDebug: any[] = [];
  const firstRows: SlaDealRow[] = [];

  for (const deal of safeDeals) {
    const dealId = deal?.ID != null ? String(deal.ID) : "";
    if (!dealId) continue;
    const dateCreate = deal?.DATE_CREATE;
    const createMs = parseTimeMs(
      typeof dateCreate === "string" ? dateCreate : undefined
    );
    if (!Number.isFinite(createMs)) continue;
    firstPool += 1;

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
    const diffBusinessHours = businessHoursBetween(
      createMs,
      endMsSafe,
      businessHours
    );
    const isOnTime = diffBusinessHours <= FIRST_COMMUNICATION_LIMIT_HOURS;
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
      Calculated_Business_Hours: Math.round(diffBusinessHours * 100) / 100,
      Is_On_Time: isOnTime,
    });

    const createdInBh = isInstantInBusinessHours(createMs, businessHours);
    if (!createdInBh) continue;

    firstBhTotal += 1;
    if (isOnTime) firstBhOnTime += 1;

    firstRows.push(
      dealRow(
        deal,
        stageIdToName,
        [
          `Created: ${typeof dateCreate === "string" ? dateCreate : String(dateCreate ?? "")}`,
          `First move: ${firstCommEnteredAt ?? "PENDING"} → ${triggerStageLabel}`,
          `Business hours to first move: ${Math.round(diffBusinessHours * 100) / 100}h`,
          isOnTime ? "On time" : "Late",
        ].join(" · ")
      )
    );
  }

  // —— B. Follow-up on Time ——
  const FIVE_DAYS_MS = 5 * TWENTY_FOUR_HOURS_MS;
  let followPool = 0;
  let followBhTotal = 0;
  let followBhOnTime = 0;
  const followRows: SlaDealRow[] = [];

  for (const deal of safeDeals) {
    const dealId = deal?.ID != null ? String(deal.ID) : "";
    if (!dealId) continue;
    const dateCreate = deal?.DATE_CREATE;
    const createMs = parseTimeMs(
      typeof dateCreate === "string" ? dateCreate : undefined
    );
    if (!Number.isFinite(createMs)) continue;

    const events = historyMap[dealId];
    let qualifies = false;
    let isOnTime = false;
    let detailParts: string[] = [];

    if (isYesValue((deal as any).UF_CRM_1774537634447)) {
      qualifies = true;
      isOnTime = true;
      detailParts = ["Override: on time"];
    } else if (events?.length) {
      const entryIndex = events.findIndex((e) => {
        const sid = stageId(e.STAGE_ID);
        return isFollowUpStage(sid) || isFollowUpDayStage(sid);
      });
      if (entryIndex !== -1) {
        qualifies = true;
        const entryMs = parseTimeMs(events[entryIndex].CREATED_TIME);
        if (Number.isFinite(entryMs)) {
          const successEvent = events
            .slice(entryIndex + 1)
            .find((e) => isContactSuccessfulStage(stageId(e.STAGE_ID)));
          if (successEvent) {
            const successMs = parseTimeMs(successEvent.CREATED_TIME);
            if (Number.isFinite(successMs)) {
              const diffBusinessHours = businessHoursBetween(
                entryMs,
                successMs,
                businessHours
              );
              isOnTime = diffBusinessHours * ONE_HOUR_MS <= FIVE_DAYS_MS;
              detailParts = [
                `Follow-up from: ${events[entryIndex].CREATED_TIME}`,
                `Success at: ${successEvent.CREATED_TIME}`,
                `Elapsed (business h): ${Math.round(diffBusinessHours * 100) / 100}h`,
                isOnTime ? "On time" : "Late",
              ];
            } else {
              detailParts = ["Success stage time invalid"];
              isOnTime = false;
            }
          } else {
            detailParts = ["No Contact was Successful after follow-up"];
            isOnTime = false;
          }
        } else {
          detailParts = ["Follow-up entry time invalid"];
          isOnTime = false;
        }
      }
    }

    if (!qualifies) continue;
    followPool += 1;

    if (!isInstantInBusinessHours(createMs, businessHours)) continue;

    followBhTotal += 1;
    if (isOnTime) followBhOnTime += 1;
    followRows.push(dealRow(deal, stageIdToName, detailParts.join(" · ")));
  }

  // —— B2. Follow-up in Months (activities with scheduled time) ——
  let followMonthsTotal = 0;
  let followMonthsOnTime = 0;
  const followMonthsRows: SlaDealRow[] = [];

  for (const deal of safeDeals) {
    const dealId = deal?.ID != null ? String(deal.ID) : "";
    if (!dealId) continue;
    const activities = activitiesByDeal[dealId] ?? [];
    const timed = activities.filter((a) =>
      Number.isFinite(activityScheduledMs(a))
    );
    if (timed.length === 0) continue;

    followMonthsTotal += 1;
    const override = isYesValue((deal as any).UF_CRM_1774537634447);
    let dealOnTime = override;

    const activityLines: string[] = [];
    if (!override) {
      dealOnTime = true;
        const now = Date.now();
      for (const a of timed) {
        const sched = activityScheduledMs(a);
        const schedLabel = String(a.DEADLINE ?? a.START_TIME ?? "").trim();
        const completed = String(a.COMPLETED ?? "").toUpperCase() === "Y";
        const endAt = parseTimeMs(
          String(a.END_TIME ?? a.LAST_UPDATED ?? "").trim()
        );
        let ok = true;
        if (completed && Number.isFinite(endAt)) {
          ok = endAt <= sched;
        } else if (completed) {
          ok = true;
        } else {
          ok = now <= sched;
        }
        if (!ok) dealOnTime = false;
        const endLabel =
          completed && Number.isFinite(endAt)
            ? String(a.END_TIME ?? a.LAST_UPDATED ?? "").trim()
            : "";
        activityLines.push(
          `Act.${a.ID} @ ${schedLabel || String(sched)} → ${
            completed
              ? `done ${endLabel || "?"}`
              : now > sched
                ? "overdue (open)"
                : "pending"
          }`
        );
      }
    } else {
      activityLines.push("Override: on time");
    }

    if (dealOnTime) followMonthsOnTime += 1;
    followMonthsRows.push(
      dealRow(deal, stageIdToName, activityLines.join(" | "))
    );

    if (options?.followUpMonthsDebugOut) {
      options.followUpMonthsDebugOut.push({
        Deal_ID: dealId,
        Activities: timed.length,
        On_Time: dealOnTime,
      });
    }
  }

  // —— C. Price Sharing ——
  let priceOnTime = 0;
  let priceTotal = 0;
  const priceSharingDebug: Array<{
    Deal_ID: string;
    Entered_Stage_At: string;
    Exited_Stage_At: string;
    Calculated_Hours: number;
    Calculated_Business_Hours: number;
    Is_On_Time: boolean;
  }> = [];
  const priceRows: SlaDealRow[] = [];

  const findFirstPriceSharingIndex = (
    events: StageHistoryItem[]
  ): number => {
    return events.findIndex((e) => isPriceSharingStage(stageId(e.STAGE_ID)));
  };

  const getPriceEntryMs = (
    deal: BitrixDeal,
    events: StageHistoryItem[]
  ): { entryMs: number; entryLabel: string } | null => {
    const idx = findFirstPriceSharingIndex(events);
    if (idx !== -1) {
      const t = parseTimeMs(events[idx].CREATED_TIME);
      if (Number.isFinite(t))
        return { entryMs: t, entryLabel: String(events[idx].CREATED_TIME ?? "") };
    }
    if (isPriceSharingStage(String(deal.STAGE_ID ?? ""))) {
      const t = parseTimeMs(String(deal.DATE_CREATE ?? ""));
      if (Number.isFinite(t))
        return {
          entryMs: t,
          entryLabel: `current stage (created ${deal.DATE_CREATE ?? ""})`,
        };
    }
    return null;
  };

  const dealQualifiesPriceSharing = (
    deal: BitrixDeal,
    events: StageHistoryItem[]
  ): boolean => {
    if (!priceSharingStageId) return false;
    if (isPriceSharingStage(String(deal.STAGE_ID ?? ""))) return true;
    return events.some((e) => isPriceSharingStage(stageId(e.STAGE_ID)));
  };

  for (const deal of safeDeals) {
    const dealId = deal?.ID != null ? String(deal.ID) : "";
    if (!dealId || !priceSharingStageId) continue;
    const events = historyMap[dealId] ?? [];
    if (!dealQualifiesPriceSharing(deal, events)) continue;

    const entry = getPriceEntryMs(deal, events);
    if (!entry) continue;

    priceTotal += 1;
    const { entryMs: priceEntryMs, entryLabel: enteredAt } = entry;

    let activeCommunicationEvent: StageHistoryItem | undefined;
    for (const e of events) {
      const t = parseTimeMs(e.CREATED_TIME);
      if (!Number.isFinite(t) || t >= priceEntryMs) continue;
      if (isActiveCommunicationStage(stageId(e.STAGE_ID)))
        activeCommunicationEvent = e;
    }

    const activeCommunicationMs = activeCommunicationEvent
      ? parseTimeMs(activeCommunicationEvent.CREATED_TIME)
      : NaN;
    const activeCommunicationAt = activeCommunicationEvent
      ? String(activeCommunicationEvent.CREATED_TIME ?? "")
      : "Not found";
    const diffMs = Number.isFinite(activeCommunicationMs)
      ? priceEntryMs - activeCommunicationMs
      : NaN;
    const diffHours = Number.isFinite(diffMs) ? diffMs / ONE_HOUR_MS : NaN;
    const diffBusinessHours = Number.isFinite(activeCommunicationMs)
      ? businessHoursBetween(activeCommunicationMs, priceEntryMs, businessHours)
      : NaN;
    const isOnTime =
      Number.isFinite(activeCommunicationMs) &&
      diffBusinessHours * ONE_HOUR_MS <= TWENTY_FOUR_HOURS_MS;

    priceSharingDebug.push({
      Deal_ID: dealId,
      Entered_Stage_At: activeCommunicationAt,
      Exited_Stage_At: enteredAt,
      Calculated_Hours: Number.isFinite(diffHours)
        ? Math.round(diffHours * 100) / 100
        : NaN,
      Calculated_Business_Hours: Number.isFinite(diffBusinessHours)
        ? Math.round(diffBusinessHours * 100) / 100
        : NaN,
      Is_On_Time: isOnTime,
    });
    if (options?.priceSharingDebugOut) {
      options.priceSharingDebugOut.push({
        dealId,
        entryTime: activeCommunicationAt,
        exitTime: enteredAt,
        diffHours: Number.isFinite(diffHours) ? diffHours : NaN,
        diffBusinessHours: Number.isFinite(diffBusinessHours)
          ? diffBusinessHours
          : undefined,
        isOnTime,
      });
    }
    if (isOnTime) priceOnTime += 1;

    priceRows.push(
      dealRow(
        deal,
        stageIdToName,
        [
          `Price stage entry: ${enteredAt}`,
          `Active communication: ${activeCommunicationAt}`,
          Number.isFinite(diffBusinessHours)
            ? `Business hours (active → price): ${Math.round(diffBusinessHours * 100) / 100}h`
            : "—",
          isOnTime ? "On time" : "Late / incomplete",
        ].join(" · ")
      )
    );
  }

  if (options?.firstCommDebugOut) {
    options.firstCommDebugOut.push(...firstCommDebug);
  }

  return {
    firstCommunication: makeMetric(
      "First Communication on Time",
      firstBhOnTime,
      firstBhTotal,
      {
        poolCount: firstPool,
        rows: firstRows,
      }
    ),
    followUp: makeMetric("Follow-up on Time", followBhOnTime, followBhTotal, {
      poolCount: followPool,
      rows: followRows,
    }),
    followUpMonths: makeMetric(
      "Follow up in Months on Time",
      followMonthsOnTime,
      followMonthsTotal,
      { rows: followMonthsRows }
    ),
    priceSharing: makeMetric(
      "Price sharing to Patient on Time",
      priceOnTime,
      priceTotal,
      { rows: priceRows }
    ),
  };
}
