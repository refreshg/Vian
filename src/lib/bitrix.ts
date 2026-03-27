import type { BitrixDealListResponse } from "@/types/bitrix";

const getWebhookUrl = (): string => {
  const url = process.env.NEXT_PUBLIC_BITRIX24_WEBHOOK_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_BITRIX24_WEBHOOK_URL is not set. Add it to .env.local (see .env.local.example)."
    );
  }
  return url.replace(/\/$/, "");
};

/** Category/pipeline ID for deal list filter. Override from API; default "1". */
function getCategoryId(override?: string): string {
  return override ?? process.env.BITRIX_CATEGORY_ID ?? "1";
}

/** ENTITY_ID for crm.status.list: DEAL_STAGE for default pipeline, DEAL_STAGE_{id} for specific. */
function getStatusEntityId(categoryId?: string): string {
  const id = getCategoryId(categoryId);
  if (id === "0") return "DEAL_STAGE";
  return `DEAL_STAGE_${id}`;
}

/** Response shape from crm.status.list (each item in result). */
interface BitrixStatusItem {
  STATUS_ID: string;
  NAME: string;
  [key: string]: unknown;
}

export interface StageNameMapResult {
  /** STATUS_ID -> display NAME for the current pipeline */
  nameMap: Record<string, string>;
  /** All stage IDs in pipeline order (from crm.status.list) */
  stageIdsInOrder: string[];
}

/**
 * Fetches all stages for the given pipeline via crm.status.list.
 * ENTITY_ID is DEAL_STAGE for category 0, or DEAL_STAGE_{categoryId} for specific pipeline.
 * Returns both the stage name map and the ordered list of stage IDs (so charts can show all stages, including 0).
 */
export async function fetchStageNameMap(categoryId?: string): Promise<StageNameMapResult> {
  const baseUrl = getWebhookUrl();
  const endpoint = `${baseUrl}/crm.status.list`;

  const body = {
    FILTER: { ENTITY_ID: getStatusEntityId(categoryId) },
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error_description || data.error || `HTTP ${response.status}`
    );
  }

  if (data.error) {
    throw new Error(data.error_description || data.error);
  }

  const list = (data.result ?? []) as BitrixStatusItem[];
  const nameMap: Record<string, string> = {};
  const stageIdsInOrder: string[] = [];
  for (const item of list) {
    if (item.STATUS_ID && item.NAME) {
      nameMap[item.STATUS_ID] = item.NAME;
      stageIdsInOrder.push(item.STATUS_ID);
    }
  }
  return { nameMap, stageIdsInOrder };
}

/**
 * Fetches source statuses (ENTITY_ID: SOURCE) and returns STATUS_ID -> NAME.
 */
export async function fetchSourceNameMap(): Promise<Record<string, string>> {
  const baseUrl = getWebhookUrl();
  const endpoint = `${baseUrl}/crm.status.list`;

  const body = {
    FILTER: { ENTITY_ID: "SOURCE" },
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error_description || data.error || `HTTP ${response.status}`
    );
  }

  if (data.error) {
    throw new Error(data.error_description || data.error);
  }

  const list = (data.result ?? []) as BitrixStatusItem[];
  const map: Record<string, string> = {};
  for (const item of list) {
    if (item.STATUS_ID && item.NAME) {
      map[item.STATUS_ID] = item.NAME;
    }
  }
  return map;
}

/** Option item for dropdown/list fields in crm.deal.fields (items or list array). */
interface BitrixFieldOption {
  ID: string | number;
  VALUE: string;
  [key: string]: unknown;
}

/** Field descriptor in crm.deal.fields result (may contain items/list/LIST for enumerations). */
interface BitrixFieldDescriptor {
  items?: BitrixFieldOption[];
  list?: BitrixFieldOption[];
  LIST?: BitrixFieldOption[];
  [key: string]: unknown;
}

/**
 * Fetches deal field metadata and returns option ID -> VALUE for a dropdown field.
 * Call crm.deal.fields and read the field's items (or list) array.
 */
export async function fetchDealFieldOptions(
  fieldId: string
): Promise<Record<string, string>> {
  const baseUrl = getWebhookUrl();
  const endpoint = `${baseUrl}/crm.deal.fields`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error_description || data.error || `HTTP ${response.status}`
    );
  }

  if (data.error) {
    throw new Error(data.error_description || data.error);
  }

  const fields = (data.result ?? {}) as Record<string, BitrixFieldDescriptor>;
  const field = fields[fieldId];
  const items: BitrixFieldOption[] =
    field?.items ?? field?.list ?? field?.LIST ?? ([] as BitrixFieldOption[]);

  const map: Record<string, string> = {};
  for (const item of items) {
    const id = item.ID != null ? String(item.ID) : "";
    const value = item.VALUE ?? "";
    if (id) map[id] = value;
  }
  return map;
}

/** Single history record from crm.stagehistory.list for deals (entityTypeId: 2). */
export interface StageHistoryItem {
  ID: string;
  OWNER_ID: string | number;
  STAGE_ID?: string;
  STATUS_ID?: string;
  CREATED_TIME: string;
  [key: string]: unknown;
}

/** CRM activity row used for Follow up in Months SLA timing. */
export interface BitrixActivityItem {
  ID: string;
  OWNER_ID?: string | number;
  OWNER_TYPE_ID?: string | number;
  CREATED?: string;
  START_TIME?: string;
  END_TIME?: string;
  DEADLINE?: string;
  LAST_UPDATED?: string;
  COMPLETED?: string;
  [key: string]: unknown;
}

/**
 * Fetches stage history for the given deal IDs using crm.stagehistory.list.
 * Only histories for the provided OWNER_IDs are returned.
 */
export async function fetchStageHistoryForDeals(
  dealIds: string[]
): Promise<StageHistoryItem[]> {
  const ids = Array.isArray(dealIds) ? dealIds : [];
  if (ids.length === 0) return [];

  const baseUrl = getWebhookUrl();
  const endpoint = `${baseUrl}/crm.stagehistory.list`;
  const all: StageHistoryItem[] = [];
  const chunkSize = 20;

  function asNumberArray(values: string[]): number[] {
    return values
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  function isStageHistoryItemLike(value: unknown): value is StageHistoryItem {
    if (!value || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;
    return (
      ("OWNER_ID" in v || "ownerId" in v) &&
      typeof v.CREATED_TIME === "string" &&
      (typeof v.OWNER_ID === "string" ||
        typeof v.OWNER_ID === "number" ||
        typeof (v as any).ownerId === "string" ||
        typeof (v as any).ownerId === "number")
    );
  }

  function extractItemsAndNext(data: any): { items: StageHistoryItem[]; next?: number } {
    const raw = data?.result;
    let itemsRaw: unknown = raw;
    let nextRaw: unknown = data?.next;

    // Some Bitrix methods return { result: { items: [...], next: N } }
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      if (Array.isArray((raw as any).items)) itemsRaw = (raw as any).items;
      if (typeof (raw as any).next === "number") nextRaw = (raw as any).next;
    }

    const items = Array.isArray(itemsRaw) ? (itemsRaw.filter(isStageHistoryItemLike) as StageHistoryItem[]) : [];
    const next = typeof nextRaw === "number" ? nextRaw : undefined;
    return { items, next };
  }

  for (let i = 0; i < ids.length; i += chunkSize) {
    const idsChunk = ids.slice(i, i + chunkSize);
    const idsChunkNumbers = asNumberArray(idsChunk);
    const ownerIdFilter = idsChunkNumbers.length > 0 ? idsChunkNumbers : idsChunk;
    let start = 0;

    // Paginate through history for this chunk of deals.
    // Bitrix24 uses "start"/"next" cursor-style pagination similar to crm.deal.list.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const body: Record<string, unknown> = {
        entityTypeId: 2,
        filter: { OWNER_ID: ownerIdFilter },
        order: { OWNER_ID: "ASC", CREATED_TIME: "ASC" },
        select: ["ID", "OWNER_ID", "STAGE_ID", "CREATED_TIME"],
        start,
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error_description || data.error || `HTTP ${response.status}`
        );
      }

      if (data.error) {
        throw new Error(data.error_description || data.error);
      }

      const { items, next } = extractItemsAndNext(data);
      all.push(...items);

      if (items.length === 0) break;
      if (typeof next !== "number") break;
      if (next === start) break; // safety against infinite loops
      start = next;
    }
  }

  return all;
}

/**
 * Fetches activities for deal IDs via crm.activity.list.
 * Returns a map keyed by OWNER_ID (deal ID string).
 */
export async function fetchActivitiesForDeals(
  dealIds: string[]
): Promise<Record<string, BitrixActivityItem[]>> {
  const ids = Array.isArray(dealIds) ? dealIds : [];
  if (ids.length === 0) return {};

  const baseUrl = getWebhookUrl();
  const endpoint = `${baseUrl}/crm.activity.list`;
  const byDeal: Record<string, BitrixActivityItem[]> = {};
  const chunkSize = 20;

  function asNumberArray(values: string[]): number[] {
    return values
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  for (let i = 0; i < ids.length; i += chunkSize) {
    const idsChunk = ids.slice(i, i + chunkSize);
    const idsChunkNumbers = asNumberArray(idsChunk);
    const ownerIdFilter = idsChunkNumbers.length > 0 ? idsChunkNumbers : idsChunk;
    let start = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const body: Record<string, unknown> = {
        filter: {
          OWNER_TYPE_ID: 2,
          OWNER_ID: ownerIdFilter,
        },
        order: { ID: "ASC" },
        select: [
          "ID",
          "OWNER_ID",
          "OWNER_TYPE_ID",
          "CREATED",
          "START_TIME",
          "END_TIME",
          "DEADLINE",
          "LAST_UPDATED",
          "COMPLETED",
        ],
        start,
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error_description || data.error || `HTTP ${response.status}`
        );
      }

      if (data.error) {
        throw new Error(data.error_description || data.error);
      }

      const result = (data.result ?? []) as BitrixActivityItem[];
      for (const activity of result) {
        const key = String(activity?.OWNER_ID ?? "");
        if (!key) continue;
        if (!byDeal[key]) byDeal[key] = [];
        byDeal[key].push(activity);
      }

      if (result.length < 50) break;
      const nextVal = data.next;
      if (typeof nextVal === "number") {
        if (nextVal === start) break;
        start = nextVal;
      } else {
        start += result.length;
      }
    }
  }

  for (const key of Object.keys(byDeal)) {
    byDeal[key].sort((a, b) => {
      const ta = new Date(String(a.CREATED ?? a.START_TIME ?? "")).getTime();
      const tb = new Date(String(b.CREATED ?? b.START_TIME ?? "")).getTime();
      return ta - tb;
    });
  }

  return byDeal;
}

/**
 * Fetches deals from Bitrix24 using crm.deal.list with optional date filter.
 * Uses DATE_CREATE with full-day boundaries (>= start 00:00:00, <= end 23:59:59).
 */
export async function fetchDealList(params: {
  startDate: string;
  endDate: string;
  categoryId?: string;
}): Promise<BitrixDealListResponse> {
  const baseUrl = getWebhookUrl();
  const endpoint = `${baseUrl}/crm.deal.list`;

  const categoryId = getCategoryId(params.categoryId);
  const { from: dateFrom, to: dateTo } = buildDateBoundaries(
    params.startDate,
    params.endDate
  );
  const filter: Record<string, string> = {
    ">=DATE_CREATE": dateFrom,
    "<=DATE_CREATE": dateTo,
    CATEGORY_ID: categoryId,
  };

  const body = {
    SELECT: [
      "ID",
      "TITLE",
      "OPPORTUNITY",
      "STAGE_ID",
      "DATE_CREATE",
      "CATEGORY_ID",
      "SOURCE_ID",
      "UF_CRM_1758023694929",
      "UF_CRM_1753862633986",
      "UF_CRM_1753861857976",
      "UF_CRM_1768995573895",
      "UF_CRM_1769688668259",
      "UF_CRM_1774537634447",
    ],
    FILTER: filter,
    ORDER: { DATE_CREATE: "DESC" },
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error_description || data.error || `HTTP ${response.status}`
    );
  }

  if (data.error) {
    throw new Error(data.error_description || data.error);
  }

  return data as BitrixDealListResponse;
}

/**
 * Builds full-day date boundaries for Bitrix filter (inclusive full days).
 * From = 00:00:00, To = 23:59:59 so no leads are lost at day boundaries.
 * Bitrix interprets these in the portal's timezone when no offset is given.
 */
function normalizeDateTimeInput(value: string, mode: "start" | "end"): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return mode === "start" ? "1970-01-01 00:00:00" : "1970-01-01 23:59:59";
  // datetime-local format: YYYY-MM-DDTHH:mm
  if (trimmed.includes("T")) {
    const withSpace = trimmed.replace("T", " ");
    return withSpace.length === 16 ? `${withSpace}:00` : withSpace;
  }
  // date-only format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return mode === "start"
      ? `${trimmed} 00:00:00`
      : `${trimmed} 23:59:59`;
  }
  return trimmed;
}

function buildDateBoundaries(startDate: string, endDate: string): {
  from: string;
  to: string;
} {
  const from = normalizeDateTimeInput(startDate, "start");
  const to = normalizeDateTimeInput(endDate, "end");
  return { from, to };
}

/**
 * Fetches ALL deals in date range by paginating with crm.deal.list.
 * No limit/top cap; uses >= and <= DATE_CREATE; loops until no more pages.
 */
export async function fetchAllDealsInRange(params: {
  startDate: string;
  endDate: string;
  categoryId?: string;
}): Promise<BitrixDealListResponse["result"]> {
  const { from: dateFrom, to: dateTo } = buildDateBoundaries(
    params.startDate,
    params.endDate
  );
  const categoryId = getCategoryId(params.categoryId);

  const filter: Record<string, string> = {
    ">=DATE_CREATE": dateFrom,
    "<=DATE_CREATE": dateTo,
    CATEGORY_ID: categoryId,
  };

  console.log(
    "📅 Bitrix DATE_CREATE filter (exact):",
    JSON.stringify({ ">=DATE_CREATE": dateFrom, "<=DATE_CREATE": dateTo, CATEGORY_ID: categoryId })
  );

  const allDeals: BitrixDealListResponse["result"] = [];
  let start = 0;
  const baseUrl = getWebhookUrl();
  const endpoint = `${baseUrl}/crm.deal.list`;

  const SELECT = [
    "ID",
    "TITLE",
    "OPPORTUNITY",
    "STAGE_ID",
    "DATE_CREATE",
    "CATEGORY_ID",
    "SOURCE_ID",
    "UF_CRM_1758023694929",
    "UF_CRM_1753862633986",
    "UF_CRM_1753861857976",
    "UF_CRM_1768995573895",
    "UF_CRM_1769688668259",
    "UF_CRM_1774537634447",
  ];

  while (true) {
    const body: Record<string, unknown> = {
      SELECT,
      FILTER: filter,
      ORDER: { DATE_CREATE: "DESC" },
      start,
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error_description || data.error || `HTTP ${response.status}`
      );
    }

    if (data.error) {
      throw new Error(data.error_description || data.error);
    }

    const result = (data.result ?? []) as BitrixDealListResponse["result"];
    for (const deal of result) {
      allDeals.push(deal);
    }

    console.log("📥 FETCHING PROGRESS:", allDeals.length, "deals so far...");

    if (result.length === 0) {
      break;
    }

    if (result.length < 50) {
      break;
    }

    const nextVal = data.next;
    if (nextVal != null) {
      start = typeof nextVal === "number" ? nextVal : Number(nextVal);
      if (!Number.isFinite(start)) start = start + result.length;
    } else {
      start = start + result.length;
    }
  }

  return allDeals;
}
