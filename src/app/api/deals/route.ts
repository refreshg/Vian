import { NextRequest, NextResponse } from "next/server";
import {
  fetchAllDealsInRange,
  fetchStageNameMap,
  fetchSourceNameMap,
  fetchDealFieldOptions,
} from "@/lib/bitrix";

const DEPARTMENT_FIELD_ID = "UF_CRM_1758023694929";
const REJECTION_REASONS_FIELD_ID = "UF_CRM_1753862633986";
const COMMENT_LIST_FIELD_ID = "UF_CRM_1768995573895";

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
    const [
      deals,
      stageNameMap,
      sourceIdToName,
      departmentIdToName,
      rejectionReasonIdToName,
      commentListIdToName,
    ] = await Promise.all([
      fetchAllDealsInRange({ startDate, endDate }),
      fetchStageNameMap(),
      fetchSourceNameMap(),
      fetchDealFieldOptions(DEPARTMENT_FIELD_ID),
      fetchDealFieldOptions(REJECTION_REASONS_FIELD_ID),
      fetchDealFieldOptions(COMMENT_LIST_FIELD_ID),
    ]);
    return NextResponse.json({
      result: deals,
      total: deals.length,
      stageNameMap,
      sourceIdToName,
      departmentIdToName,
      rejectionReasonIdToName,
      commentListIdToName,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch deals";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
