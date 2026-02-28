"use client";

import type { KpiStats } from "@/lib/dashboardData";

interface KPIStatsRowProps {
  kpi: KpiStats;
}

export function KPIStatsRow({ kpi }: KPIStatsRowProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex justify-center">
        <div className="flex flex-col items-center">
          <span className="text-2xl font-bold text-gray-900">
            {kpi.totalRequests}
          </span>
          <span className="mt-1 text-sm text-gray-500">Total Requests</span>
        </div>
      </div>
    </div>
  );
}
