"use client";

import type { SlaSummary } from "@/lib/slaMetrics";

interface SlaMetricsProps {
  metrics: SlaSummary | null;
  /** Debug: number of stage history records fetched for the current deals. */
  historyRecordCount?: number;
  /** Debug: first stage history record (raw JSON) to inspect field names. */
  historySample?: Record<string, unknown> | null;
}

export function SlaMetrics({
  metrics,
  historyRecordCount,
  historySample,
}: SlaMetricsProps) {
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
      <div className="mb-4 text-sm text-gray-600">
        Debug: Fetched {historyRecordCount ?? 0} history records for these deals.
      </div>
      <div className="mb-4 break-words text-xs text-gray-500">
        JSON: {JSON.stringify(historySample ?? {})}
      </div>
      <div className="grid gap-6 sm:grid-cols-3">
        {items.map((m) => (
          <div key={m.title} className="flex flex-col">
            <span className="text-3xl font-bold text-gray-900">
              {`${m.rate.toFixed(0)}%`}
            </span>
            <span className="mt-1 text-sm text-gray-600">
              {m.totalCount > 0
                ? `${m.onTimeCount} / ${m.totalCount} deals on time`
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

