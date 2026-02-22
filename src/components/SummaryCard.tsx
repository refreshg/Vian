"use client";

interface SummaryCardProps {
  count: number;
}

export function SummaryCard({ count }: SummaryCardProps) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
      <p className="text-sm font-medium uppercase tracking-wider text-[var(--text-muted)]">
        Total Deals
      </p>
      <p className="mt-2 text-3xl font-bold text-white">{count}</p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        For the selected date range
      </p>
    </div>
  );
}
