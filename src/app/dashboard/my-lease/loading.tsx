export default function MyLeaseLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="h-8 w-40 animate-pulse rounded bg-zinc-200" />
      <div className="h-20 animate-pulse rounded-lg bg-amber-50" />
      <div className="h-64 animate-pulse rounded-lg bg-zinc-100" />
      <p className="text-sm text-zinc-400">Loading your lease…</p>
    </div>
  )
}
