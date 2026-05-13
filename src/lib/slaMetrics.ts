import type { BitrixDeal } from "@/types/bitrix";
import type { BitrixActivityItem, StageHistoryItem } from "./bitrix";
import {
  businessHoursBetweenZoned,
  isoWeekdayInZone,
  isInstantInBusinessHoursZoned,
  SLA_TIME_ZONE,
  type BusinessHoursConfig,
} from "./businessCalendar";

export type { BusinessHoursConfig };

/** Proforma / price-sharing stage per pipeline (Bitrix STATUS_ID). */
export const PRICE_SHARING_STAGE_ID_BY_CATEGORY: Record<string, string> = {
  "1": "C1:UC_W95SAM",
  "2": "C2:FINAL_INVOICE",
  "3": "C3:UC_QHKPK0",
  "4": "C4:UC_COEU6V",
  "5": "C5:UC_0VR22O",
};

/** Active communication stage (start of interval when deal was never Qualified before Proforma). */
export const ACTIVE_COMMUNICATION_STAGE_ID_BY_CATEGORY: Record<string, string> = {
  "1": "C1:UC_AEL2CB",
  "2": "C2:PREPAYMENT_INVOICE",
  "3": "C3:UC_MAXQG9",
  "4": "C4:UC_4TSJWJ",
  "5": "C5:UC_TLYV0G",
};

/** Excluded from Price sharing SLA (e.g. mistaken Proforma move). */
export const PRICE_SHARING_EXCLUDED_DEAL_IDS = new Set<string>(["6367"]);

export interface SlaDealRow {
  dealId: string;
  title: string;
  stageId: string;
  stageName: string;
  detail: string;
  /** Creation fell in business window (First Communication popup filter). */
  createdInBusinessHours?: boolean;
}

export interface SlaMetric {
  title: string;
  onTimeCount: number;
  totalCount: number;
  rate: number; // percentage 0-100
  /** On-time rate for deals created outside business hours (same qualifying logic). */
  offHoursRate?: number;
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

export function getBusinessHoursForCategory(
  categoryId?: string
): BusinessHoursConfig {
  const id = String(categoryId ?? "1").trim();
  if (id === "4") {
    return { workdayStartHour: 10, workdayEndHour: 19 };
  }
  return { workdayStartHour: 9, workdayEndHour: 18 };
}

/** Stage name phrases for multi-pipeline SLA (stage IDs differ per pipeline, e.g. C1:NEW vs C2:NEW). */
const PHRASE_INITIAL = "Coordinator did not start";
const PHRASE_CONTACT_SUCCESSFUL = "Contact was Successful";
/**
 * Bitrix CRM activity TYPE_ID (crm.enum.activitytype — built-in types).
 * We count types that typically have a scheduled moment + DEADLINE like meetings:
 * 1 Meeting, 5 Action, 6 User Action ("Contact customer" is usually 5 or 6, not 1).
 */
const FOLLOW_MONTHS_ACTIVITY_TYPE_IDS = new Set([1, 5, 6]);

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

/** Deadline for calendar meeting activities (Follow up in Months). */
function activityDeadlineMs(activity: BitrixActivityItem): number {
  return parseTimeMs(String(activity.DEADLINE ?? "").trim());
}

/** Exclude chat-finish/system chat events from Follow up in Months SLA. */
function isExcludedFollowMonthsActivity(activity: BitrixActivityItem): boolean {
  const subject = String(activity.SUBJECT ?? "").toLowerCase();
  const providerId = String(activity.PROVIDER_ID ?? "").toLowerCase();
  const providerTypeId = String(activity.PROVIDER_TYPE_ID ?? "").toLowerCase();
  if (subject.includes("customer chat finished")) return true;
  if (providerId.includes("imopenlines") || providerId.includes("openline")) return true;
  if (providerTypeId.includes("chat")) return true;
  return false;
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
  extras?: Partial<Pick<SlaMetric, "poolCount" | "rows" | "offHoursRate">>
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

function calcRate(onTimeCount: number, totalCount: number): number {
  return totalCount > 0
    ? Math.round(((onTimeCount / totalCount) * 100) * 10) / 10
    : 0;
}

function dealRow(
  deal: BitrixDeal,
  stageIdToName: Record<string, string>,
  detail: string,
  extra?: Partial<Pick<SlaDealRow, "createdInBusinessHours">>
): SlaDealRow {
  const sid = String(deal.STAGE_ID ?? "");
  return {
    dealId: String(deal.ID ?? ""),
    title: String(deal.TITLE ?? ""),
    stageId: sid,
    stageName: stageIdToName[sid] ?? sid,
    detail,
    ...extra,
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
  const activeCommStageId =
    ACTIVE_COMMUNICATION_STAGE_ID_BY_CATEGORY[categoryId] ?? "";

  const initialStageIds = buildInitialStageIds(stageIdToName);
  const followUpDayStageIds = stageIdsMatchingRegex(
    stageIdToName,
    /\bDay\s*(2|3|5)\b/i
  );
  const contactSuccessfulStageIds = stageIdsMatchingName(
    stageIdToName,
    PHRASE_CONTACT_SUCCESSFUL
  );
  const qualifiedStageIds = stageIdsMatchingRegex(
    stageIdToName,
    /\bqualified\b/i
  );

  const isInitialStage = (sid: string) => initialStageIds.has(sid);
  const isFollowUpDayStage = (sid: string) => followUpDayStageIds.has(sid);
  const isContactSuccessfulStage = (sid: string) =>
    contactSuccessfulStageIds.has(sid);
  const isProformaStage = (sid: string) =>
    Boolean(priceSharingStageId) && sid === priceSharingStageId;
  const isActiveCommStageById = (sid: string) =>
    Boolean(activeCommStageId) && sid === activeCommStageId;
  const isQualifiedStage = (sid: string) => qualifiedStageIds.has(sid);

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

  // —— A. First Communication (<= 1 business hour; Monday gets 2 hours) ——
  const FIRST_COMMUNICATION_LIMIT_HOURS = 1;
  const FIRST_COMMUNICATION_LIMIT_HOURS_MONDAY = 2;
  const nowMs = Date.now();
  let firstPool = 0;
  let firstBhTotal = 0;
  let firstBhOnTime = 0;
  let firstOffTotal = 0;
  let firstOffOnTime = 0;
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
    const diffBusinessHours = businessHoursBetweenZoned(
      createMs,
      endMsSafe,
      businessHours,
      SLA_TIME_ZONE
    );
    const weekdayIso = isoWeekdayInZone(createMs, SLA_TIME_ZONE);
    const limitHours =
      weekdayIso === 1
        ? FIRST_COMMUNICATION_LIMIT_HOURS_MONDAY
        : FIRST_COMMUNICATION_LIMIT_HOURS;
    const isOnTime = diffBusinessHours <= limitHours;
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

    const createdInBh = isInstantInBusinessHoursZoned(
      createMs,
      businessHours,
      SLA_TIME_ZONE
    );

    firstRows.push(
      dealRow(
        deal,
        stageIdToName,
        [
          `Created: ${typeof dateCreate === "string" ? dateCreate : String(dateCreate ?? "")}`,
          `Created in business hours: ${createdInBh ? "Yes" : "No"}`,
          `First move: ${firstCommEnteredAt ?? "PENDING"} → ${triggerStageLabel}`,
          `SLA limit: ${limitHours}h`,
          `Business hours to first move: ${Math.round(diffBusinessHours * 100) / 100}h`,
          isOnTime ? "On time" : "Late",
        ].join(" · "),
        { createdInBusinessHours: createdInBh }
      )
    );

    if (createdInBh) {
      firstBhTotal += 1;
      if (isOnTime) firstBhOnTime += 1;
    } else {
      firstOffTotal += 1;
      if (isOnTime) firstOffOnTime += 1;
    }
  }

  // —— B. Follow-up on Time ——
  const FIVE_DAYS_MS = 5 * TWENTY_FOUR_HOURS_MS;
  let followPool = 0;
  let followBhTotal = 0;
  let followBhOnTime = 0;
  let followOffTotal = 0;
  let followOffOnTime = 0;
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
        return isFollowUpDayStage(sid);
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
              const diffBusinessHours = businessHoursBetweenZoned(
                entryMs,
                successMs,
                businessHours,
                SLA_TIME_ZONE
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
            detailParts = ["No follow up on time"];
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

    const createdInBh = isInstantInBusinessHoursZoned(
      createMs,
      businessHours,
      SLA_TIME_ZONE
    );
    const detailWithCreate = [
      `Created: ${typeof dateCreate === "string" ? dateCreate : String(dateCreate ?? "")}`,
      `Created in business hours: ${createdInBh ? "Yes" : "No"}`,
      ...detailParts,
    ].join(" · ");

    followRows.push(
      dealRow(deal, stageIdToName, detailWithCreate, {
        createdInBusinessHours: createdInBh,
      })
    );

    if (createdInBh) {
      followBhTotal += 1;
      if (isOnTime) followBhOnTime += 1;
    } else {
      followOffTotal += 1;
      if (isOnTime) followOffOnTime += 1;
    }
  }

  // —— B2. Follow-up in Months (Meeting / Action / User Action with DEADLINE; no override) ——
  let followMonthsTotal = 0;
  let followMonthsOnTime = 0;
  let followMonthsOffTotal = 0;
  let followMonthsOffOnTime = 0;
  const followMonthsRows: SlaDealRow[] = [];

  for (const deal of safeDeals) {
    const dealId = deal?.ID != null ? String(deal.ID) : "";
    if (!dealId) continue;
    const activities = activitiesByDeal[dealId] ?? [];
    const timed = activities.filter((a) => {
      const typeId = Number(a.TYPE_ID);
      if (!FOLLOW_MONTHS_ACTIVITY_TYPE_IDS.has(typeId)) return false;
      if (isExcludedFollowMonthsActivity(a)) return false;
      const dl = activityDeadlineMs(a);
      return Number.isFinite(dl);
    });
    if (timed.length === 0) continue;

    followMonthsTotal += 1;
    let dealOnTime = true;

    const activityLines: string[] = [];
    const now = Date.now();
    for (const a of timed) {
      const sched = activityDeadlineMs(a);
      const schedLabel = String(a.DEADLINE ?? "").trim();
      const completed = String(a.COMPLETED ?? "").toUpperCase() === "Y";
      const endAt = parseTimeMs(String(a.END_TIME ?? a.LAST_UPDATED ?? "").trim());
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
        `Activity ${a.ID} (type ${a.TYPE_ID ?? "?"}) @ ${schedLabel || String(sched)} → ${
          completed
            ? `done ${endLabel || "?"}`
            : now > sched
              ? "overdue (open)"
              : "pending"
        }`
      );
    }

    if (dealOnTime) followMonthsOnTime += 1;
    const createMs = parseTimeMs(String(deal.DATE_CREATE ?? ""));
    const createdInBh = isInstantInBusinessHoursZoned(
      createMs,
      businessHours,
      SLA_TIME_ZONE
    );
    if (createdInBh) {
      // currently only off-hours rate requested as secondary indicator
    } else {
      followMonthsOffTotal += 1;
      if (dealOnTime) followMonthsOffOnTime += 1;
    }
    followMonthsRows.push(
      dealRow(deal, stageIdToName, activityLines.join(" | "), {
        createdInBusinessHours: createdInBh,
      })
    );

    if (options?.followUpMonthsDebugOut) {
      options.followUpMonthsDebugOut.push({
        Deal_ID: dealId,
        Activities: timed.length,
        On_Time: dealOnTime,
      });
    }
  }

  // —— C. Proforma / Price sharing (ever on Proforma stage; 24 calendar hours) ——
  let priceOnTime = 0;
  let priceTotal = 0;
  let priceOffTotal = 0;
  let priceOffOnTime = 0;
  const priceSharingDebug: Array<{
    Deal_ID: string;
    Start_Reference: string;
    Proforma_At: string;
    Calendar_Hours: number;
    Is_On_Time: boolean;
  }> = [];
  const priceRows: SlaDealRow[] = [];

  const findFirstProformaIndex = (events: StageHistoryItem[]): number =>
    events.findIndex((e) => isProformaStage(stageId(e.STAGE_ID)));

  const dealTouchesProforma = (
    deal: BitrixDeal,
    events: StageHistoryItem[]
  ): boolean => {
    if (!priceSharingStageId) return false;
    if (isProformaStage(String(deal.STAGE_ID ?? ""))) return true;
    return events.some((e) => isProformaStage(stageId(e.STAGE_ID)));
  };

  for (const deal of safeDeals) {
    const dealId = deal?.ID != null ? String(deal.ID) : "";
    if (!dealId || !priceSharingStageId) continue;
    if (PRICE_SHARING_EXCLUDED_DEAL_IDS.has(dealId)) continue;
    const events = historyMap[dealId] ?? [];
    if (!dealTouchesProforma(deal, events)) continue;

    const proformaIdx = findFirstProformaIndex(events);
    let proformaMs: number;
    let proformaLabel: string;
    if (proformaIdx >= 0) {
      proformaMs = parseTimeMs(events[proformaIdx].CREATED_TIME);
      proformaLabel = String(events[proformaIdx].CREATED_TIME ?? "");
      if (!Number.isFinite(proformaMs)) continue;
    } else if (isProformaStage(String(deal.STAGE_ID ?? ""))) {
      proformaMs = parseTimeMs(String(deal.DATE_CREATE ?? ""));
      proformaLabel = `current Proforma (lead created ${deal.DATE_CREATE ?? ""})`;
      if (!Number.isFinite(proformaMs)) continue;
    } else {
      continue;
    }

    priceTotal += 1;

    const createMs = parseTimeMs(String(deal.DATE_CREATE ?? ""));
    const sliceBeforeProforma =
      proformaIdx >= 0 ? events.slice(0, proformaIdx) : [];
    const qualEvent = sliceBeforeProforma.find((e) =>
      isQualifiedStage(stageId(e.STAGE_ID))
    );
    let startMs: number;
    let startLabel: string;
    if (qualEvent) {
      startMs = parseTimeMs(qualEvent.CREATED_TIME);
      startLabel = `Qualified at ${qualEvent.CREATED_TIME}`;
    } else {
      let activeCommEvent: StageHistoryItem | undefined;
      for (const e of sliceBeforeProforma) {
        if (isActiveCommStageById(stageId(e.STAGE_ID))) activeCommEvent = e;
      }
      if (activeCommEvent) {
        startMs = parseTimeMs(activeCommEvent.CREATED_TIME);
        startLabel = `Active communication at ${activeCommEvent.CREATED_TIME}`;
      } else {
        startMs = Number.isFinite(createMs)
          ? createMs
          : parseTimeMs(String(deal.DATE_CREATE ?? ""));
        startLabel = `Lead created ${deal.DATE_CREATE ?? ""} (no Qualified and no Active communication before Proforma)`;
      }
    }
    if (!Number.isFinite(startMs)) continue;

    const calendarHours =
      (proformaMs - startMs) / ONE_HOUR_MS;
    const isOnTime =
      Number.isFinite(calendarHours) && calendarHours <= 24;

    priceSharingDebug.push({
      Deal_ID: dealId,
      Start_Reference: startLabel,
      Proforma_At: proformaLabel,
      Calendar_Hours: Math.round(calendarHours * 100) / 100,
      Is_On_Time: isOnTime,
    });
    if (options?.priceSharingDebugOut) {
      options.priceSharingDebugOut.push({
        dealId,
        entryTime: startLabel,
        exitTime: proformaLabel,
        diffHours: calendarHours,
        diffBusinessHours: undefined,
        isOnTime,
      });
    }
    if (isOnTime) priceOnTime += 1;
    const createMsForPrice = parseTimeMs(String(deal.DATE_CREATE ?? ""));
    const createdInBhForPrice = isInstantInBusinessHoursZoned(
      createMsForPrice,
      businessHours,
      SLA_TIME_ZONE
    );
    if (!createdInBhForPrice) {
      priceOffTotal += 1;
      if (isOnTime) priceOffOnTime += 1;
    }

    priceRows.push(
      dealRow(
        deal,
        stageIdToName,
        [
          startLabel,
          `Proforma: ${proformaLabel}`,
          `Elapsed (calendar h): ${Math.round(calendarHours * 100) / 100}h (on time if ≤ 24h)`,
          isOnTime ? "On time" : "Late",
        ].join(" · "),
        { createdInBusinessHours: createdInBhForPrice }
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
        offHoursRate: calcRate(firstOffOnTime, firstOffTotal),
        poolCount: firstPool,
        rows: firstRows,
      }
    ),
    followUp: makeMetric("Follow-up on Time", followBhOnTime, followBhTotal, {
      offHoursRate: calcRate(followOffOnTime, followOffTotal),
      poolCount: followPool,
      rows: followRows,
    }),
    followUpMonths: makeMetric(
      "Follow up in Months on Time",
      followMonthsOnTime,
      followMonthsTotal,
      {
        offHoursRate: calcRate(followMonthsOffOnTime, followMonthsOffTotal),
        rows: followMonthsRows,
      }
    ),
    priceSharing: makeMetric(
      "Price sharing to Patient on Time",
      priceOnTime,
      priceTotal,
      {
        offHoursRate: calcRate(priceOffOnTime, priceOffTotal),
        rows: priceRows,
      }
    ),
  };
}
