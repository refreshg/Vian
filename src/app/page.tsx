"use client";

import { useCallback, useState, useEffect } from "react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { KPIStatsRow } from "@/components/KPIStatsRow";
import { RequestsByStageDonut } from "@/components/RequestsByStageDonut";
import { RequestsByDepartmentsBar } from "@/components/RequestsByDepartmentsBar";
import { RequestsBySourceChart } from "@/components/RequestsBySourceChart";
import { RejectionReasonsTable } from "@/components/RejectionReasonsTable";
import { CommentListTable } from "@/components/CommentListTable";
import { CountryChart } from "@/components/CountryChart";
import { SlaMetrics } from "@/components/SlaMetrics";
import { computeDashboardData } from "@/lib/dashboardData";
import type { SlaSummary } from "@/lib/slaMetrics";
import type { BitrixDeal } from "@/types/bitrix";

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const PIPELINES: { id: string; name: string }[] = [
  { id: "1", name: "Caucasus Medical Centre" },
  { id: "2", name: "M.Iashvili Children's Central Hospital" },
  { id: "3", name: "Iv.Bokeria University Hospital" },
  { id: "4", name: "Caraps Medline" },
  { id: "5", name: "Krystyna Kiel Oncology Center" },
];

export default function DashboardPage() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return formatDate(d);
  });
  const [endDate, setEndDate] = useState(() => formatDate(new Date()));
  const [selectedCategory, setSelectedCategory] = useState("1");
  const [deals, setDeals] = useState<BitrixDeal[]>([]);
  const [stageNameMap, setStageNameMap] = useState<Record<string, string>>({});
  const [allStageIdsInOrder, setAllStageIdsInOrder] = useState<string[]>([]);
  const [departmentIdToName, setDepartmentIdToName] = useState<
    Record<string, string>
  >({});
  const [rejectionReasonIdToName, setRejectionReasonIdToName] = useState<
    Record<string, string>
  >({});
  const [commentListIdToName, setCommentListIdToName] = useState<
    Record<string, string>
  >({});
  const [sourceIdToName, setSourceIdToName] = useState<
    Record<string, string>
  >({});
  const [countryIdToName, setCountryIdToName] = useState<
    Record<string, string>
  >({});
  const [slaMetrics, setSlaMetrics] = useState<SlaSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDeals = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        category: selectedCategory,
      });
      const res = await fetch(`/api/deals?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch");
      setDeals(data.result ?? []);
      setStageNameMap(data.stageNameMap ?? {});
      setAllStageIdsInOrder(data.allStageIdsInOrder ?? []);
      setDepartmentIdToName(data.departmentIdToName ?? {});
      setRejectionReasonIdToName(data.rejectionReasonIdToName ?? {});
      setCommentListIdToName(data.commentListIdToName ?? {});
      setSourceIdToName(data.sourceIdToName ?? {});
      setCountryIdToName(data.countryIdToName ?? {});
      setSlaMetrics(data.slaMetrics ?? null);
      if (Array.isArray(data.priceSharingDebug)) {
        console.log("SLA Verification - Price Sharing:", data.priceSharingDebug);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setDeals([]);
      setStageNameMap({});
      setAllStageIdsInOrder([]);
      setDepartmentIdToName({});
      setRejectionReasonIdToName({});
      setCommentListIdToName({});
      setSourceIdToName({});
      setCountryIdToName({});
      setSlaMetrics(null);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedCategory]);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  const handlePipelineChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCategory(e.target.value);
  };

  const dashboard = computeDashboardData(
    deals,
    stageNameMap,
    departmentIdToName,
    rejectionReasonIdToName,
    commentListIdToName,
    sourceIdToName,
    countryIdToName,
    allStageIdsInOrder
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">
            Analytics Dashboard
          </h1>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-500">
              <span>Pipeline</span>
              <select
                value={selectedCategory}
                onChange={handlePipelineChange}
                className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {PIPELINES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
              onApply={fetchDeals}
              loading={loading}
            />
          </div>
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
          <>
            <div className="mb-6">
              <SlaMetrics metrics={slaMetrics} />
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[5fr_7fr]">
              {/* Left column */}
              <div className="flex flex-col gap-6">
                <RequestsByStageDonut stageGroups={dashboard.stageGroups} />
                <RejectionReasonsTable rows={dashboard.rejectionReasons} />
                <CommentListTable rows={dashboard.commentListRows} />
              </div>
              {/* Right column */}
              <div className="flex flex-col gap-6">
                <KPIStatsRow kpi={dashboard.kpi} />
                <RequestsByDepartmentsBar
                  departmentGroups={dashboard.departmentGroups}
                />
                <RequestsBySourceChart sourceGroups={dashboard.sourceGroups} />
                <CountryChart countryGroups={dashboard.countryGroups} />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
