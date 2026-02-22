"use client";

import React from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { SourceGroup } from "@/lib/dashboardData";

const BAR_COLOR = "#93c5fd";
const LINE_COLOR = "#86efac";

interface RequestsBySourceChartProps {
  sourceGroups: SourceGroup[];
}

export function RequestsBySourceChart({
  sourceGroups,
}: RequestsBySourceChartProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="border-b border-gray-200 pb-3 text-base font-medium text-gray-900">
        Requests by Source
      </h2>
      <div className="h-72 w-full pt-4">
        {sourceGroups.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-gray-500">
            No source data for the selected period
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={sourceGroups}
              margin={{ top: 24, right: 32, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11 }}
                stroke="#9ca3af"
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 12 }}
                stroke="#9ca3af"
                tickLine={false}
                allowDecimals={false}
                label={{
                  value: "Requests",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 11, fill: "#6b7280" },
                }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 12 }}
                stroke="#9ca3af"
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
                label={{
                  value: "Source Rate",
                  angle: 90,
                  position: "insideRight",
                  style: { fontSize: 11, fill: "#6b7280" },
                }}
              />
              <Tooltip
                contentStyle={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "6px",
                  backgroundColor: "#fff",
                }}
                formatter={(value: number, name: string) => {
                  if (name === "Requests") return [value, "Requests"];
                  return [`${Number(value).toFixed(1)}%`, "Source Rate"];
                }}
              />
              <Legend
                align="left"
                verticalAlign="top"
                wrapperStyle={{ paddingBottom: 8 }}
                formatter={(value) => (
                  <span className="text-sm text-gray-600">{value}</span>
                )}
              />
              <Bar
                yAxisId="left"
                dataKey="count"
                name="Requests"
                fill={BAR_COLOR}
                radius={[4, 4, 0, 0]}
                label={{
                  position: "top",
                  fill: "#374151",
                  fontSize: 11,
                  formatter: (v: number) => String(v),
                }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="sourceRate"
                name="Source Rate"
                stroke={LINE_COLOR}
                strokeWidth={2}
                dot={{ fill: LINE_COLOR, r: 4 }}
                label={{
                  position: "top",
                  fill: "#374151",
                  fontSize: 10,
                  formatter: (v: number) => `${Number(v).toFixed(1)}%`,
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
