"use client";

export function RequestRateByCountryPlaceholder() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="border-b border-gray-200 pb-3 text-base font-medium text-gray-900">
        Request Rate by Country
      </h2>
      <div className="flex h-64 flex-col items-center justify-center gap-2 pt-4 text-gray-400">
        <svg
          className="h-12 w-12"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0h.5a2.5 2.5 0 0010.5-4.935V3.935M12 12v.001"
          />
        </svg>
        <p className="text-sm">No data available</p>
        <p className="text-xs">Add country data to see request rate by country</p>
      </div>
    </div>
  );
}
