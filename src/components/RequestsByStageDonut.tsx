"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { StageGroup } from "@/lib/dashboardData";
import { isRejectionStage } from "@/lib/dashboardData";

const COLORS = [
  "#f87171", // pastel red (rejections)
  "#86efac", // light green
  "#93c5fd", // light blue
  "#fde047", // yellow
  "#fdba74", // orange
  "#c4b5fd", // lavender
];

interface RequestsByStageDonutProps {
  stageGroups: StageGroup[];
}

export function RequestsByStageDonut({ stageGroups }: RequestsByStageDonutProps) {
  const total = stageGroups.reduce((s, g) => s + g.value, 0);
  const data = stageGroups.map((g) => ({
    ...g,
    percentage:
      total > 0 ? ((g.value / total) * 100).toFixed(2) : "0.00",
  }));

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="border-b border-gray-200 pb-3 text-center text-base font-medium text-gray-900">
        Requests by Stage
      </h2>
      <div className="flex items-center justify-center gap-4 pt-4">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="40%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={1}
              label={({ name, value, percentage }) =>
                `${value} (${percentage}%)`
              }
              labelLine
            >
              {data.map((entry, index) => (
                <Cell
                  key={entry.stageId}
                  fill={
                    isRejectionStage(entry.stageId) ? COLORS[0] : COLORS[(index % (COLORS.length - 1)) + 1]
                  }
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, _name: string, props: any) =>
                [`${value} (${props?.payload?.percentage ?? "0"}%)`, "Count"]
              }
              contentStyle={{
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                backgroundColor: "#fff",
              }}
            />
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              wrapperStyle={{ paddingLeft: 24 }}
              formatter={(value: string, entry: any) => (
                <span className="text-sm text-gray-600">
                  {entry?.payload?.name ?? value}
                </span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
