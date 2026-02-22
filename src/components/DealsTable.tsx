"use client";

import type { BitrixDeal } from "@/types/bitrix";

interface DealsTableProps {
  deals: BitrixDeal[];
}

function formatMoney(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

export function DealsTable({ deals }: DealsTableProps) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-lg font-semibold text-white">Top 10 Recent Deals</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Opportunity</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {deals.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  No deals in the selected range. Pick dates and click Apply.
                </td>
              </tr>
            ) : (
              deals.map((deal) => (
                <tr
                  key={deal.ID}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-elevated)]/50"
                >
                  <td className="px-4 py-3 font-mono text-white">{deal.ID}</td>
                  <td className="px-4 py-3 text-white">{deal.TITLE || "—"}</td>
                  <td className="px-4 py-3 text-white">
                    {formatMoney(deal.OPPORTUNITY ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">
                    {deal.STAGE_ID || "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
