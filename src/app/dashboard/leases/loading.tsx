export default function LeasesLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-8 w-32 animate-pulse rounded bg-zinc-200" />
      <div className="space-y-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-zinc-100" />
        ))}
      </div>
      <p className="text-sm text-zinc-400">Loading leases…</p>
    </div>
  )
}
