"use client";

import type { SlaSummary } from "@/lib/slaMetrics";

interface SlaMetricsProps {
  metrics: SlaSummary | null;
}

export function SlaMetrics({ metrics }: SlaMetricsProps) {
  if (!metrics) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-500">
          SLA metrics will appear here once data is available for the selected range.
        </p>
      </div>
    );
  }

  const items = [
    metrics.firstCommunication,
    metrics.followUp,
    metrics.priceSharing,
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="grid gap-6 sm:grid-cols-3">
        {items.map((m) => (
          <div key={m.title} className="flex flex-col">
            <span className="text-3xl font-bold text-gray-900">
              {`${m.rate.toFixed(0)}%`}
            </span>
            <span className="mt-1 text-sm text-gray-600">
              {m.totalCount > 0
                ? `${m.onTimeCount} on time (out of ${m.totalCount})`
                : "No qualifying deals in range"}
            </span>
            <span className="mt-2 text-sm font-medium text-gray-900">
              {m.title}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
