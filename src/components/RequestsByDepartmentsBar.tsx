"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { DepartmentGroup } from "@/lib/dashboardData";

const BAR_COLOR = "#93c5fd";

interface RequestsByDepartmentsBarProps {
  departmentGroups: DepartmentGroup[];
}

export function RequestsByDepartmentsBar({
  departmentGroups,
}: RequestsByDepartmentsBarProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="border-b border-gray-200 pb-3 text-base font-medium text-gray-900">
        Requests by Departments
      </h2>
      <div className="h-64 w-full pt-4">
        {departmentGroups.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-gray-500">
            No department data
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={departmentGroups}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11 }}
                stroke="#9ca3af"
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="#9ca3af"
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "6px",
                  backgroundColor: "#fff",
                }}
                formatter={(value: number) => [value, "Requests"]}
              />
              <Bar
                dataKey="count"
                name="Requests"
                fill={BAR_COLOR}
                radius={[4, 4, 0, 0]}
                label={{ position: "top", fill: "#374151", fontSize: 11 }}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
