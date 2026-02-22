"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import type { StageGroup } from "@/lib/dashboardData";
import { isRejectionStage } from "@/lib/dashboardData";

const COLORS = [
  "#f87171", // pastel red (rejections)
  "#6366f1", // indigo
  "#818cf8", // light indigo
  "#93c5fd", // light blue
  "#34d399", // emerald
  "#fbbf24", // amber
];

interface RequestsByStageDonutProps {
  stageGroups: StageGroup[];
}

export function RequestsByStageDonut({ stageGroups }: RequestsByStageDonutProps) {
  const total = stageGroups.reduce((s, g) => s + g.value, 0);
  
  // მონაცემების მომზადება და დახარისხება (ყველაზე დიდიდან პატარამდე)
  const data = stageGroups
    .map((g) => ({
      ...g,
      percentage: total > 0 ? ((g.value / total) * 100).toFixed(1) : "0.0",
      displayText: `${g.value} (${total > 0 ? ((g.value / total) * 100).toFixed(1) : "0.0"}%)`
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="border-b border-gray-200 pb-3 text-center text-base font-medium text-gray-900">
        Requests by Stage
      </h2>
      <div className="pt-6">
        <ResponsiveContainer width="100%" height={Math.max(300, data.length * 45)}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 80, left: 20, bottom: 5 }}
          >
            <XAxis type="number" hide />
            <YAxis
              dataKey="name"
              type="category"
              width={160}
              tick={{ fontSize: 11, fill: "#4b5563" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'transparent' }}
              formatter={(value: any, _name: string, props: any) => [
                props.payload.displayText,
                "Requests"
              ]}
              contentStyle={{
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                backgroundColor: "#fff",
              }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={25}>
              {data.map((entry, index) => (
                <Cell
                  key={entry.stageId}
                  fill={
                    isRejectionStage(entry.stageId) 
                      ? COLORS[0] 
                      : COLORS[(index % (COLORS.length - 1)) + 1]
                  }
                />
              ))}
              <LabelList
                dataKey="displayText"
                position="right"
                style={{ fontSize: "11px", fill: "#6b7280", fontWeight: 500 }}
                offset={10}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}