export default function LeaseDetailLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="h-8 w-56 animate-pulse rounded bg-zinc-200" />
      <div className="h-4 w-80 animate-pulse rounded bg-zinc-100" />
      <div className="h-64 animate-pulse rounded-lg bg-zinc-100" />
      <div className="h-48 animate-pulse rounded-lg bg-zinc-100" />
      <p className="text-sm text-zinc-400">Loading lease…</p>
    </div>
  )
}
