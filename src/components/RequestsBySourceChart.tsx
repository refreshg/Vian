"use client";

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import type { SourceGroup } from "@/lib/dashboardData";

const BAR_COLOR = "#93c5fd";

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
      <div className="min-h-[400px] w-full pt-4">
        {sourceGroups.length === 0 ? (
          <p className="flex min-h-[300px] items-center justify-center text-sm text-gray-500">
            No source data for the selected period
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              layout="vertical"
              data={sourceGroups}
              margin={{ top: 20, right: 100, left: 0, bottom: 20 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={280}
                tick={{ fontSize: 11 }}
                interval={0}
                stroke="#9ca3af"
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "6px",
                  backgroundColor: "#fff",
                }}
                formatter={(value: number) => [value, "Requests"]}
                labelFormatter={(label, payload) => {
                  if (payload?.[0]?.payload) {
                    const row = payload[0].payload as SourceGroup;
                    return `${label} — ${row.count} (${row.sourceRate.toFixed(1)}%)`;
                  }
                  return label;
                }}
              />
              <Bar
                dataKey="count"
                name="Requests"
                fill={BAR_COLOR}
                radius={[0, 4, 4, 0]}
                barSize={24}
              >
                <LabelList
                  dataKey="count"
                  content={(props: any) => {
                    const { x, y, width, height, value, payload } = props;
                    const xPos = (Number(x) || 0) + (Number(width) || 0) + 8;
                    const yPos = (Number(y) || 0) + (Number(height) || 0) / 2;
                    const rateStr =
                      payload?.sourceRate !== undefined
                        ? ` (${Number(payload.sourceRate).toFixed(1)}%)`
                        : "";
                    return (
                      <text
                        x={xPos}
                        y={yPos}
                        fill="#4b5563"
                        fontSize={12}
                        textAnchor="start"
                        dominantBaseline="middle"
                      >
                        {value}
                        {rateStr}
                      </text>
                    );
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
