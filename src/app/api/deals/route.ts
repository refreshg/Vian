import { NextRequest, NextResponse } from "next/server";
import {
  fetchAllDealsInRange,
  fetchStageNameMap,
  fetchSourceNameMap,
  fetchDealFieldOptions,
  fetchStageHistoryForDeals,
  fetchActivitiesForDeals,
} from "@/lib/bitrix";
import {
  computeSlaMetrics,
  getBusinessHoursForCategory,
  PRICE_SHARING_STAGE_ID_BY_CATEGORY,
  type PriceSharingDebugRow,
} from "@/lib/slaMetrics";

const DEPARTMENT_FIELD_ID = "UF_CRM_1758023694929";
/** Rejection reasons field for Pipeline 1 (Caucasus Medical Centre) */
const REJECTION_REASONS_FIELD_ID = "UF_CRM_1753862633986";
/** Rejection reasons field for Pipeline 3 (Iv.Bokeria University Hospital) */
const REJECTION_REASONS_FIELD_ID_PIPELINE_3 = "UF_CRM_1753861857976";
const COMMENT_LIST_FIELD_ID = "UF_CRM_1768995573895";
const COMMENT_LIST_STAGE_FIELD_ID = "UF_CRM_1774442321633";
const COMMENT_LIST_STAGE_ID = "C1:UC_6L0FQZ";
const COUNTRY_FIELD_ID = "UF_CRM_1769688668259";
const FOLLOW_UP_OVERRIDE_FIELD_ID = "UF_CRM_1774537634447";

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
    // fetchAllDealsInRange already applies CATEGORY_ID filter in Bitrix query.
    // Keep the list as-is to avoid accidentally dropping valid records due to
    // formatting differences (e.g. numeric vs string category values).
    const dealsForCategory = deals;

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
    let activitiesByDeal: Record<string, any[]> = {};
    try {
      activitiesByDeal = await fetchActivitiesForDeals(dealIds);
    } catch {
      activitiesByDeal = {};
    }

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
      commentListStageIdToName,
      countryIdToName,
      followUpOverrideIdToName,
    ] = await Promise.all([
      fetchStageNameMap(category),
      fetchSourceNameMap(),
      fetchDealFieldOptions(DEPARTMENT_FIELD_ID),
      fetchDealFieldOptions(rejectionReasonsFieldId),
      fetchDealFieldOptions(COMMENT_LIST_FIELD_ID),
      fetchDealFieldOptions(COMMENT_LIST_STAGE_FIELD_ID),
      fetchDealFieldOptions(COUNTRY_FIELD_ID),
      fetchDealFieldOptions(FOLLOW_UP_OVERRIDE_FIELD_ID),
    ]);

    let slaMetrics;
    const priceSharingDebug: PriceSharingDebugRow[] = [];
    const firstCommDebug: any[] = [];
    const followUpMonthsDebug: any[] = [];
    const bh = getBusinessHoursForCategory(category);
    const priceStageIdForCategory =
      PRICE_SHARING_STAGE_ID_BY_CATEGORY[category] ?? "";
    try {
      slaMetrics = computeSlaMetrics(
        dealsForCategory,
        safeStageHistories,
        stageResult?.nameMap ?? {},
        activitiesByDeal,
        {
          categoryId: category,
          priceSharingStageId: priceStageIdForCategory,
          priceSharingDebugOut: priceSharingDebug,
          firstCommDebugOut: firstCommDebug,
          followUpOverrideIdToName,
          followUpMonthsDebugOut: followUpMonthsDebug,
          businessHours: bh,
        }
      );
    } catch {
      slaMetrics = {
        firstCommunication: {
          title: "First Communication on Time",
          onTimeCount: 0,
          totalCount: 0,
          rate: 0,
          poolCount: 0,
          rows: [],
        },
        followUp: {
          title: "Follow-up on Time",
          onTimeCount: 0,
          totalCount: 0,
          rate: 0,
          poolCount: 0,
          rows: [],
        },
        followUpMonths: {
          title: "Follow up in Months on Time",
          onTimeCount: 0,
          totalCount: 0,
          rate: 0,
          rows: [],
        },
        priceSharing: {
          title: "Price sharing to Patient on Time",
          onTimeCount: 0,
          totalCount: 0,
          rate: 0,
          rows: [],
        },
      };
    }

    const configuredPriceSharingStageId = priceStageIdForCategory;
    const priceSharingStageIds = configuredPriceSharingStageId
      ? [configuredPriceSharingStageId]
      : [];
    const priceSharingStageIdSet = new Set(priceSharingStageIds);
    const dealsCurrentlyInPriceSharing = dealsForCategory.filter((d) =>
      priceSharingStageIdSet.has(String(d.STAGE_ID ?? ""))
    );

    return NextResponse.json({
      result: dealsForCategory,
      total: dealsForCategory.length,
      commentFieldDebug: {
        category,
        startDate,
        endDate,
        totalDeals: dealsForCategory.length,
        nonEmptyCommentStageFieldDeals: dealsForCategory.filter((d) => {
          const raw = (d as any)[COMMENT_LIST_STAGE_FIELD_ID];
          if (raw == null || raw === "") return false;
          if (Array.isArray(raw)) return raw.some((v) => String(v ?? "").trim() !== "");
          if (typeof raw === "object") return Object.keys(raw as Record<string, unknown>).length > 0;
          return String(raw).trim() !== "";
        }).length,
        fieldOptionsSample: Object.entries(commentListStageIdToName).slice(0, 10),
        dealsWithFieldSample: dealsForCategory
          .filter((d) => {
            const raw = (d as any)[COMMENT_LIST_STAGE_FIELD_ID];
            if (raw == null || raw === "") return false;
            if (Array.isArray(raw)) return raw.some((v) => String(v ?? "").trim() !== "");
            if (typeof raw === "object") return Object.keys(raw as Record<string, unknown>).length > 0;
            return String(raw).trim() !== "";
          })
          .slice(0, 15)
          .map((d) => ({
            id: String(d.ID ?? ""),
            stage: String(d.STAGE_ID ?? ""),
            rawValue: (d as any)[COMMENT_LIST_STAGE_FIELD_ID],
          })),
      },
      stageNameMap: stageResult.nameMap,
      allStageIdsInOrder: stageResult.stageIdsInOrder,
      sourceIdToName,
      departmentIdToName,
      rejectionReasonIdToName,
      rejectionReasonFieldId: rejectionReasonsFieldId,
      commentListIdToName,
      commentListStageIdToName,
      commentListStageId: COMMENT_LIST_STAGE_ID,
      commentListStageFieldId: COMMENT_LIST_STAGE_FIELD_ID,
      countryIdToName,
      slaMetrics,
      priceSharingDebug,
      priceSharingValidationDebug: {
        stageConfig: PRICE_SHARING_STAGE_ID_BY_CATEGORY,
        selectedCategory: category,
        matchedStageIds: priceSharingStageIds,
        matchedStageNames: priceSharingStageIds.map(
          (id) => stageResult?.nameMap?.[id] ?? id
        ),
        dealsCurrentlyInMatchedStagesCount: dealsCurrentlyInPriceSharing.length,
        sampleDealsCurrentlyInMatchedStages: dealsCurrentlyInPriceSharing
          .slice(0, 15)
          .map((d) => ({
            id: String(d.ID ?? ""),
            stageId: String(d.STAGE_ID ?? ""),
            stageName: stageResult?.nameMap?.[String(d.STAGE_ID ?? "")] ?? String(d.STAGE_ID ?? ""),
          })),
        priceSharingMetricTotalCount: slaMetrics?.priceSharing?.totalCount ?? 0,
        priceSharingMetricOnTimeCount: slaMetrics?.priceSharing?.onTimeCount ?? 0,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch deals";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
