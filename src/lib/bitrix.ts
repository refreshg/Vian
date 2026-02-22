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

/**
 * Fetches stage statuses for the current pipeline and returns STATUS_ID -> NAME.
 */
export async function fetchStageNameMap(): Promise<Record<string, string>> {
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
  const map: Record<string, string> = {};
  for (const item of list) {
    if (item.STATUS_ID && item.NAME) {
      map[item.STATUS_ID] = item.NAME;
    }
  }
  return map;
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
      "UF_CRM_DEPARTMENT",
      "UF_CRM_REJECTION_REASON",
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
      "UF_CRM_DEPARTMENT",
      "UF_CRM_REJECTION_REASON",
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
