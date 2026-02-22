"use client";

import type { RejectionReasonRow } from "@/lib/dashboardData";

interface RejectionReasonsTableProps {
  rows: RejectionReasonRow[];
}

export function RejectionReasonsTable({ rows }: RejectionReasonsTableProps) {
  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h2 className="text-base font-medium text-gray-900">
          Rejection Reasons
        </h2>
        <span className="text-sm text-gray-500">Requests</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={2}
                  className="px-4 py-8 text-center text-gray-500"
                >
                  No rejection data for the selected period
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={row.reason}
                  className={
                    i % 2 === 0 ? "bg-gray-50/50" : "bg-white"
                  }
                >
                  <td className="px-4 py-2.5 text-gray-900">{row.reason}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">
                    {row.count}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-100 font-semibold">
                <td className="px-4 py-3 text-gray-900">Total</td>
                <td className="px-4 py-3 text-right text-gray-900">
                  {total}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
