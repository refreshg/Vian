"use client";

import { useCallback, useState, useEffect } from "react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { KPIStatsRow } from "@/components/KPIStatsRow";
import { RequestsByStageDonut } from "@/components/RequestsByStageDonut";
import { RequestsByDepartmentsBar } from "@/components/RequestsByDepartmentsBar";
import { RejectionReasonsTable } from "@/components/RejectionReasonsTable";
import { RequestRateByCountryPlaceholder } from "@/components/RequestRateByCountryPlaceholder";
import { computeDashboardData } from "@/lib/dashboardData";
import type { BitrixDeal } from "@/types/bitrix";

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return formatDate(d);
  });
  const [endDate, setEndDate] = useState(() => formatDate(new Date()));
  const [deals, setDeals] = useState<BitrixDeal[]>([]);
  const [stageNameMap, setStageNameMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDeals = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      const res = await fetch(`/api/deals?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch");
      setDeals(data.result ?? []);
      setStageNameMap(data.stageNameMap ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setDeals([]);
      setStageNameMap({});
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchDeals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dashboard = computeDashboardData(deals, stageNameMap);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">
            Analytics Dashboard
          </h1>
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onApply={fetchDeals}
            loading={loading}
          />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {error && (
          <div
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700"
            role="alert"
          >
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-gray-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            Loading deals…
          </div>
        )}

        {!loading && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[5fr_7fr]">
            {/* Left column */}
            <div className="flex flex-col gap-6">
              <RequestsByStageDonut stageGroups={dashboard.stageGroups} />
              <RejectionReasonsTable rows={dashboard.rejectionReasons} />
            </div>
            {/* Right column */}
            <div className="flex flex-col gap-6">
              <KPIStatsRow kpi={dashboard.kpi} />
              <RequestsByDepartmentsBar
                departmentGroups={dashboard.departmentGroups}
              />
              <RequestRateByCountryPlaceholder />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
