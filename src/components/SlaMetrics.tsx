"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SlaDealRow, SlaMetric, SlaSummary } from "@/lib/slaMetrics";

interface SlaMetricsProps {
  metrics: SlaSummary | null;
}

const FIRST_COMM_TITLE = "First Communication on Time";
const FOLLOW_UP_TITLE = "Follow-up on Time";

function metricSubtitle(m: SlaMetric): string {
  if (m.title === "Follow up in Months on Time") {
    return m.totalCount > 0
      ? `${m.onTimeCount} on time (out of ${m.totalCount} with scheduled activity + deadline)`
      : "No deals with a qualifying activity (Meeting / Action / User Action + deadline)";
  }
  if (m.title === "Price sharing to Patient on Time") {
    return m.totalCount > 0
      ? `${m.onTimeCount} on time (out of ${m.totalCount} ever on Proforma — ≤24 calendar hours)`
      : "No deals that reached Proforma";
  }
  const pool = m.poolCount ?? 0;
  const bh = m.totalCount;
  if (bh > 0 || pool > 0) {
    const parts: string[] = [];
    if (bh > 0) {
      parts.push(`${m.onTimeCount} on time (out of ${bh} created in business hours)`);
    } else if (pool > 0) {
      parts.push("0 deals created in business hours");
    }
    if (pool > 0) parts.push(`Total in range: ${pool}`);
    return parts.join(" · ");
  }
  return "No qualifying deals in range";
}

type BhCreationFilter = "all" | "inBh" | "outBh";

function bhFilterLabelGeorgian(f: BhCreationFilter): string {
  switch (f) {
    case "all":
      return "ყველა დილი (შექმნის დროით ფილტრი არ მოქმედებს)";
    case "inBh":
      return "მხოლოდ სამუშაო საათებში შექმნილი დილები";
    case "outBh":
      return "მხოლოდ სამუშაო საათების გარეთ შექმნილი დილები";
    default:
      return "";
  }
}

function filterRowsByBhCreation(
  rows: SlaDealRow[],
  f: BhCreationFilter
): SlaDealRow[] {
  if (f === "all") return rows;
  if (f === "inBh") return rows.filter((r) => r.createdInBusinessHours === true);
  return rows.filter((r) => r.createdInBusinessHours === false);
}

export function SlaMetrics({ metrics }: SlaMetricsProps) {
  const [openTitle, setOpenTitle] = useState<string | null>(null);
  const [pendingBhFilter, setPendingBhFilter] = useState<BhCreationFilter>("all");
  const [appliedBhFilter, setAppliedBhFilter] = useState<BhCreationFilter>("all");
  const [displayedRows, setDisplayedRows] = useState<SlaDealRow[]>([]);

  const items = useMemo((): SlaMetric[] | null => {
    if (!metrics) return null;
    return [
      metrics.firstCommunication,
      metrics.followUp,
      metrics.followUpMonths,
      metrics.priceSharing,
    ];
  }, [metrics]);

  const openMetric = useMemo(() => {
    if (!openTitle || !items) return null;
    return items.find((x) => x.title === openTitle) ?? null;
  }, [items, openTitle]);

  const showBhCreationFilter =
    openMetric?.title === FIRST_COMM_TITLE || openMetric?.title === FOLLOW_UP_TITLE;

  useEffect(() => {
    if (!openTitle || !openMetric) {
      setDisplayedRows([]);
      return;
    }
    const rows = openMetric.rows ?? [];
    if (showBhCreationFilter) {
      setDisplayedRows(filterRowsByBhCreation(rows, appliedBhFilter));
    } else {
      setDisplayedRows(rows);
    }
  }, [openTitle, openMetric, appliedBhFilter, showBhCreationFilter]);

  const close = useCallback(() => {
    setOpenTitle(null);
    setPendingBhFilter("all");
    setAppliedBhFilter("all");
    setDisplayedRows([]);
  }, []);

  const openMetricModal = useCallback((title: string) => {
    setPendingBhFilter("all");
    setAppliedBhFilter("all");
    setOpenTitle(title);
  }, []);

  useEffect(() => {
    if (!openTitle) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openTitle, close]);

  if (!metrics || !items) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-500">
          SLA metrics will appear here once data is available for the selected range.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((m) => (
            <button
              key={m.title}
              type="button"
              onClick={() => openMetricModal(m.title)}
              className="flex flex-col rounded-lg border border-transparent text-left transition hover:border-indigo-200 hover:bg-indigo-50/40 focus-visible:outline focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <span className="text-3xl font-bold text-gray-900">
                {`${m.rate.toFixed(0)}%`}
              </span>
              <span className="mt-1 text-sm text-gray-600">{metricSubtitle(m)}</span>
              <span className="mt-2 text-sm font-medium text-gray-900">{m.title}</span>
              <span className="mt-2 text-xs text-indigo-600">Click for deal list</span>
            </button>
          ))}
        </div>
      </div>

      {openTitle && openMetric && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={close}
        >
          <div
            role="dialog"
            aria-labelledby="sla-modal-title"
            className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-gray-200 px-4 py-3">
              <div>
                <h2 id="sla-modal-title" className="text-lg font-semibold text-gray-900">
                  {openMetric.title}
                </h2>
                <p className="mt-1 text-sm text-gray-600">{metricSubtitle(openMetric)}</p>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {showBhCreationFilter && (
              <div className="space-y-2 border-b border-gray-100 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-500">შექმნის დროით:</span>
                  {(
                    [
                      ["all", "ყველა"],
                      ["inBh", "სამუშაო საათებში"],
                      ["outBh", "სამუშაოს გარეთ"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPendingBhFilter(id)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        pendingBhFilter === id
                          ? "bg-indigo-100 text-indigo-900 ring-2 ring-indigo-500"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAppliedBhFilter(pendingBhFilter)}
                    className="ml-auto rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-indigo-700"
                  >
                    Apply
                  </button>
                </div>
                <p className="text-sm text-gray-800">
                  <span className="font-medium text-gray-900">სიაში მოქმედებს: </span>
                  {bhFilterLabelGeorgian(appliedBhFilter)}
                </p>
                {pendingBhFilter !== appliedBhFilter && (
                  <p className="text-xs text-amber-700">
                    არჩეულია სხვა ვარიანტი — სიის განახლებისთვის დააჭირეთ Apply.
                  </p>
                )}
              </div>
            )}

            <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
              {displayedRows.length === 0 ? (
                <p className="text-sm text-gray-500">
                  {showBhCreationFilter && appliedBhFilter !== "all"
                    ? "ამ ფილტრით დილი ვერ მოიძებნა."
                    : "ამ მეტრიკისთვის დილი არ არის არჩეულ დიაპაზონში."}
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {displayedRows.map((r: SlaDealRow) => (
                    <li key={r.dealId} className="py-3 first:pt-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-mono text-sm font-medium text-gray-900">{r.dealId}</span>
                        <span className="text-sm text-gray-700">{r.title || "(no title)"}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Stage: {r.stageName}
                        {r.stageId ? ` (${r.stageId})` : ""}
                      </p>
                      <p className="mt-1 text-sm text-gray-600">{r.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
