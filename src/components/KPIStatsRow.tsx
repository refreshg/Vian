"use client";

import type { KpiStats } from "@/lib/dashboardData";

interface KPIStatsRowProps {
  kpi: KpiStats;
}

const metrics: { key: keyof KpiStats; label: string }[] = [
  { key: "totalRequests", label: "Total Requests" },
  { key: "totalRejections", label: "Total Rejections" },
  { key: "rejectionRate", label: "Rejection Rate" },
  { key: "avgDelayHours", label: "AVG Delay Time (Hours)" },
];

function formatValue(key: keyof KpiStats, value: number): string {
  if (key === "rejectionRate") return `${value}%`;
  return String(value);
}

export function KPIStatsRow({ kpi }: KPIStatsRowProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        {metrics.map(({ key, label }, i) => (
          <div
            key={key}
            className={`flex flex-col ${
              i > 0 ? "border-l border-gray-200 pl-6" : ""
            }`}
          >
            <span className="text-2xl font-bold text-gray-900">
              {formatValue(key, kpi[key])}
            </span>
            <span className="mt-1 text-sm text-gray-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
