export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="h-8 w-48 animate-pulse rounded bg-zinc-200" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-28 animate-pulse rounded-lg bg-zinc-100" />
        <div className="h-28 animate-pulse rounded-lg bg-zinc-100" />
      </div>
      <div className="h-64 animate-pulse rounded-lg bg-zinc-100" />
      <p className="text-sm text-zinc-400">Loading dashboard…</p>
    </div>
  )
}
