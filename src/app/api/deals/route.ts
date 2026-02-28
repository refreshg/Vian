import { NextRequest, NextResponse } from "next/server";
import {
  fetchAllDealsInRange,
  fetchStageNameMap,
  fetchSourceNameMap,
  fetchDealFieldOptions,
  fetchStageHistoryForDeals,
} from "@/lib/bitrix";
import { computeSlaMetrics, type PriceSharingDebugRow } from "@/lib/slaMetrics";

const DEPARTMENT_FIELD_ID = "UF_CRM_1758023694929";
/** Rejection reasons field for Pipeline 1 (Caucasus Medical Centre) */
const REJECTION_REASONS_FIELD_ID = "UF_CRM_1753862633986";
/** Rejection reasons field for Pipeline 3 (Iv.Bokeria University Hospital) */
const REJECTION_REASONS_FIELD_ID_PIPELINE_3 = "UF_CRM_1753861857976";
const COMMENT_LIST_FIELD_ID = "UF_CRM_1768995573895";
const COUNTRY_FIELD_ID = "UF_CRM_1769688668259";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const category = searchParams.get("category") ?? "1";

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "startDate and endDate are required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  try {
    const dealsRaw = await fetchAllDealsInRange({
      startDate,
      endDate,
      categoryId: category,
    });
    const deals = Array.isArray(dealsRaw) ? dealsRaw : [];
    const dealsForCategory = deals.filter(
      (d) =>
        d &&
        typeof d === "object" &&
        String(d.CATEGORY_ID ?? "") === category
    );

    const dealIds = dealsForCategory
      .map((d) => (d && typeof d === "object" && "ID" in d ? String(d.ID) : ""))
      .filter(Boolean);

    let stageHistories: Awaited<ReturnType<typeof fetchStageHistoryForDeals>> = [];
    try {
      stageHistories = await fetchStageHistoryForDeals(dealIds);
    } catch {
      stageHistories = [];
    }
    const safeStageHistories = Array.isArray(stageHistories) ? stageHistories : [];

    const rejectionReasonsFieldId =
      category === "3"
        ? REJECTION_REASONS_FIELD_ID_PIPELINE_3
        : REJECTION_REASONS_FIELD_ID;

    const [
      stageResult,
      sourceIdToName,
      departmentIdToName,
      rejectionReasonIdToName,
      commentListIdToName,
      countryIdToName,
    ] = await Promise.all([
      fetchStageNameMap(category),
      fetchSourceNameMap(),
      fetchDealFieldOptions(DEPARTMENT_FIELD_ID),
      fetchDealFieldOptions(rejectionReasonsFieldId),
      fetchDealFieldOptions(COMMENT_LIST_FIELD_ID),
      fetchDealFieldOptions(COUNTRY_FIELD_ID),
    ]);

    let slaMetrics;
    const priceSharingDebug: PriceSharingDebugRow[] = [];
    try {
      slaMetrics = computeSlaMetrics(
        dealsForCategory,
        safeStageHistories,
        stageResult?.nameMap ?? {},
        { priceSharingDebugOut: priceSharingDebug }
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
      rejectionReasonFieldId: rejectionReasonsFieldId,
      commentListIdToName,
      countryIdToName,
      slaMetrics,
      priceSharingDebug,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch deals";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
