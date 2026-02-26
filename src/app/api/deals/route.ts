import { NextRequest, NextResponse } from "next/server";
import {
  fetchAllDealsInRange,
  fetchStageNameMap,
  fetchSourceNameMap,
  fetchDealFieldOptions,
  fetchStageHistoryForDeals,
} from "@/lib/bitrix";
import { computeSlaMetrics } from "@/lib/slaMetrics";

const DEPARTMENT_FIELD_ID = "UF_CRM_1758023694929";
const REJECTION_REASONS_FIELD_ID = "UF_CRM_1753862633986";
const COMMENT_LIST_FIELD_ID = "UF_CRM_1768995573895";
const COUNTRY_FIELD_ID = "UF_CRM_1769688668259";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "startDate and endDate are required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  try {
    const dealsRaw = await fetchAllDealsInRange({ startDate, endDate });
    const deals = Array.isArray(dealsRaw) ? dealsRaw : [];

    const dealIds = deals.map((d) => (d && typeof d === "object" && "ID" in d ? String(d.ID) : "")).filter(Boolean);

    let stageHistories: Awaited<ReturnType<typeof fetchStageHistoryForDeals>> = [];
    try {
      stageHistories = await fetchStageHistoryForDeals(dealIds);
    } catch {
      stageHistories = [];
    }
    const safeStageHistories = Array.isArray(stageHistories) ? stageHistories : [];

    if (safeStageHistories.length > 0) {
      console.log("Sample Stage History record:", safeStageHistories[0]);
    }

    const [
      stageResult,
      sourceIdToName,
      departmentIdToName,
      rejectionReasonIdToName,
      commentListIdToName,
      countryIdToName,
    ] = await Promise.all([
      fetchStageNameMap(),
      fetchSourceNameMap(),
      fetchDealFieldOptions(DEPARTMENT_FIELD_ID),
      fetchDealFieldOptions(REJECTION_REASONS_FIELD_ID),
      fetchDealFieldOptions(COMMENT_LIST_FIELD_ID),
      fetchDealFieldOptions(COUNTRY_FIELD_ID),
    ]);

    let slaMetrics;
    try {
      slaMetrics = computeSlaMetrics(
        deals,
        safeStageHistories,
        stageResult?.nameMap ?? {}
      );
    } catch {
      slaMetrics = {
        firstCommunication: { title: "First Communication on Time", onTimeCount: 0, totalCount: 0, rate: 0 },
        followUp: { title: "Follow-up on Time", onTimeCount: 0, totalCount: 0, rate: 0 },
        priceSharing: { title: "Price sharing to Patient on Time", onTimeCount: 0, totalCount: 0, rate: 0 },
      };
    }
    return NextResponse.json({
      result: deals,
      total: deals.length,
      stageNameMap: stageResult.nameMap,
      allStageIdsInOrder: stageResult.stageIdsInOrder,
      sourceIdToName,
      departmentIdToName,
      rejectionReasonIdToName,
      commentListIdToName,
      countryIdToName,
      slaMetrics,
      stageHistoryCount: safeStageHistories.length,
      stageHistorySample:
        safeStageHistories.length > 0 ? safeStageHistories[0] : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch deals";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
