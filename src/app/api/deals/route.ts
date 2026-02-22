import { NextRequest, NextResponse } from "next/server";
import { fetchAllDealsInRange, fetchStageNameMap } from "@/lib/bitrix";

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
    const [deals, stageNameMap] = await Promise.all([
      fetchAllDealsInRange({ startDate, endDate }),
      fetchStageNameMap(),
    ]);
    return NextResponse.json({
      result: deals,
      total: deals.length,
      stageNameMap,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch deals";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
