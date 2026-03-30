"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-100">
        <div className="mx-auto max-w-3xl px-6 py-10">
          <div className="rounded-lg border border-red-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Fatal error
            </h2>
            <p className="mt-2 text-sm text-gray-700">
              {error.message || "Unexpected error"}
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

