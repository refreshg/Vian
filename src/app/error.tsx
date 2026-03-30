"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep this minimal; helps surface the real runtime error.
    console.error("App error boundary:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <h2 className="text-lg font-semibold text-red-900">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-red-800">
          {error.message || "Unexpected error"}
        </p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Reload page
          </button>
        </div>
      </div>
    </div>
  );
}

