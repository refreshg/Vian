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

/** Category/pipeline ID for deal list filter. Use "0" for default pipeline. */
function getCategoryId(): string {
  return process.env.BITRIX_CATEGORY_ID ?? "0";
}

/** ENTITY_ID for crm.status.list: DEAL_STAGE for default pipeline, DEAL_STAGE_{id} for specific. */
function getStatusEntityId(): string {
  const categoryId = getCategoryId();
  if (categoryId === "0") return "DEAL_STAGE";
  return `DEAL_STAGE_${categoryId}`;
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
 * Fetches all stages for the current pipeline via crm.status.list.
 * ENTITY_ID is DEAL_STAGE for category 0, or DEAL_STAGE_{categoryId} for specific pipeline.
 * Returns both the stage name map and the ordered list of stage IDs (so charts can show all stages, including 0).
 */
export async function fetchStageNameMap(): Promise<StageNameMapResult> {
  const baseUrl = getWebhookUrl();
  const endpoint = `${baseUrl}/crm.status.list`;

  const body = {
    FILTER: { ENTITY_ID: getStatusEntityId() },
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
  STAGE_ID: string;
  CREATED_TIME: string;
  [key: string]: unknown;
}

/**
 * Fetches stage history for the given deal IDs using crm.stagehistory.list.
 * Only histories for the provided OWNER_IDs are returned.
 */
export async function fetchStageHistoryForDeals(
  dealIds: string[]
): Promise<StageHistoryItem[]> {
  if (dealIds.length === 0) return [];

  const baseUrl = getWebhookUrl();
  const endpoint = `${baseUrl}/crm.stagehistory.list`;
  const all: StageHistoryItem[] = [];
  const chunkSize = 20;

  for (let i = 0; i < dealIds.length; i += chunkSize) {
    const idsChunk = dealIds.slice(i, i + chunkSize);
    let start = 0;

    // Paginate through history for this chunk of deals.
    // Bitrix24 uses "start"/"next" cursor-style pagination similar to crm.deal.list.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const body: Record<string, unknown> = {
        entityTypeId: 2,
        filter: { OWNER_ID: idsChunk },
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

      const items = (data.result ?? []) as StageHistoryItem[];
      all.push(...items);

      if (!data.next || items.length === 0) break;
      start = data.next;
    }
  }

  return all;
}

/**
 * Fetches deals from Bitrix24 using crm.deal.list with optional date filter.
 * Uses DATE_CREATE filter with >= and <= for the given range.
 */
export async function fetchDealList(params: {
  startDate: string;
  endDate: string;
}): Promise<BitrixDealListResponse> {
  const baseUrl = getWebhookUrl();
  const endpoint = `${baseUrl}/crm.deal.list`;

  const categoryId = getCategoryId();
  const filter: Record<string, string> = {
    ">=DATE_CREATE": params.startDate,
    "<=DATE_CREATE": params.endDate,
    CATEGORY_ID: categoryId,
  };

  const body = {
    SELECT: [
      "ID",
      "TITLE",
      "OPPORTUNITY",
      "STAGE_ID",
      "DATE_CREATE",
      "SOURCE_ID",
      "UF_CRM_1758023694929",
      "UF_CRM_1753862633986",
      "UF_CRM_1768995573895",
      "UF_CRM_1769688668259",
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
 * Fetches all deals in date range by following pagination (50 per page).
 */
export async function fetchAllDealsInRange(params: {
  startDate: string;
  endDate: string;
}): Promise<BitrixDealListResponse["result"]> {
  const all: BitrixDealListResponse["result"] = [];
  let start = 0;
  const pageSize = 50;

  while (true) {
    const baseUrl = getWebhookUrl();
    const endpoint = `${baseUrl}/crm.deal.list`;

  const categoryId = getCategoryId();
  const filter: Record<string, string> = {
    ">=DATE_CREATE": params.startDate,
    "<=DATE_CREATE": params.endDate,
    CATEGORY_ID: categoryId,
  };

  const body = {
    SELECT: [
      "ID",
      "TITLE",
      "OPPORTUNITY",
      "STAGE_ID",
      "DATE_CREATE",
      "SOURCE_ID",
      "UF_CRM_1758023694929",
      "UF_CRM_1753862633986",
      "UF_CRM_1768995573895",
      "UF_CRM_1769688668259",
    ],
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
    all.push(...result);

    if (!data.next || result.length < pageSize) break;
    start = data.next;
  }

  return all;
}
