"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import type { CountryGroup } from "@/lib/dashboardData";

const BAR_COLOR = "#93c5fd";

interface CountryChartProps {
  countryGroups: CountryGroup[];
}

export function CountryChart({ countryGroups }: CountryChartProps) {
  const height = Math.max(300, Math.min(500, countryGroups.length * 36));

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="border-b border-gray-200 pb-3 text-base font-medium text-gray-900">
        Request Rate by Country
      </h2>
      <div className="w-full pt-4" style={{ height: countryGroups.length === 0 ? 256 : height }}>
        {countryGroups.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-gray-500">
            No country data
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={countryGroups}
              margin={{ top: 8, right: 56, left: 0, bottom: 8 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#374151" }}
              />
              <Tooltip
                contentStyle={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "6px",
                  backgroundColor: "#fff",
                }}
                formatter={(value: any, name: any, props: any) => [
                  `${value}%`,
                  "Rate",
                ]}
              />
              <Bar
                dataKey="percentage"
                fill={BAR_COLOR}
                radius={[0, 4, 4, 0]}
              >
                <LabelList
                  dataKey="percentage"
                  position="right"
                  formatter={(val: any) => `${val}%`}
                  style={{ fontSize: "12px", fill: "#6b7280" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
