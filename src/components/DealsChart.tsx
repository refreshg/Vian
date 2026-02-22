"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { BitrixDeal } from "@/types/bitrix";

interface DealsChartProps {
  deals: BitrixDeal[];
}

type GroupBy = "day" | "month";

function groupDeals(deals: BitrixDeal[], groupBy: GroupBy): { name: string; count: number }[] {
  const map = new Map<string, number>();

  for (const d of deals) {
    const date = d.DATE_CREATE ? new Date(d.DATE_CREATE) : null;
    if (!date || isNaN(date.getTime())) continue;
    const key =
      groupBy === "day"
        ? date.toISOString().slice(0, 10)
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  const entries = Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return entries;
}

const BAR_COLORS = ["#6366f1", "#818cf8", "#a5b4fc", "#c7d2fe"];

export function DealsChart({ deals }: DealsChartProps) {
  const isLongRange =
    deals.length > 0 &&
    (() => {
      const dates = deals
        .map((d) => (d.DATE_CREATE ? new Date(d.DATE_CREATE).getTime() : 0))
        .filter(Boolean);
      if (dates.length < 2) return false;
      const span = Math.max(...dates) - Math.min(...dates);
      return span > 35 * 24 * 60 * 60 * 1000; // ~35 days
    })();

  const data = groupDeals(deals, isLongRange ? "month" : "day");

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="text-lg font-semibold text-white">Deals by {isLongRange ? "Month" : "Day"}</h2>
        <p className="mt-4 text-[var(--text-muted)]">No data for the selected range.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <h2 className="text-lg font-semibold text-white">
        Deals by {isLongRange ? "Month" : "Day"}
      </h2>
      <div className="mt-4 h-64 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="name"
              stroke="#a3a3a3"
              tick={{ fontSize: 12 }}
              tickLine={false}
            />
            <YAxis
              stroke="#a3a3a3"
              tick={{ fontSize: 12 }}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--surface-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
              }}
              labelStyle={{ color: "var(--text)" }}
              formatter={(value: number) => [value, "Deals"]}
            />
            <Bar dataKey="count" name="Deals" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
