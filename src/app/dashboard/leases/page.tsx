import { redirect } from 'next/navigation'
import Link from 'next/link'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { invoiceStatus } from '@/lib/billing'
import { Button } from '@/components/ui/button'

export const instant = false

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  overdue:        { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500' },
  partially_paid: { bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500' },
  unpaid:         { bg: 'bg-zinc-100',   text: 'text-zinc-600',   dot: 'bg-zinc-400' },
  paid:           { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500' },
}

export default async function LeasesPage() {
  await connection()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const membership = await prisma.membership.findFirst({ where: { userId: user.id } })
  if (!membership) redirect('/dashboard/my-lease')

  const leases = await prisma.lease.findMany({
    where: { orgId: membership.orgId },
    include: {
      unit: true,
      tenant: true,
      invoices: { include: { allocations: true } },
    },
    orderBy: { startDate: 'desc' },
  })

  const now = new Date()

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Leases</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{leases.length} lease{leases.length !== 1 ? 's' : ''} total</p>
        </div>
        {membership.role === 'manager' && (
          <Link href="/dashboard/leases/new">
            <Button size="sm" className="gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New lease
            </Button>
          </Link>
        )}
      </div>

      {leases.length === 0 ? (
        <div className="rounded-xl border bg-white p-12 text-center">
          <svg className="w-10 h-10 text-zinc-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-zinc-500 text-sm">No leases yet.</p>
          {membership.role === 'manager' && (
            <Link href="/dashboard/leases/new">
              <Button size="sm" variant="outline" className="mt-3">Create first lease</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 border-b text-xs text-zinc-500 uppercase tracking-wide">
                <th className="px-4 py-3 text-left font-medium">Unit</th>
                <th className="px-4 py-3 text-left font-medium">Tenant</th>
                <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Period</th>
                <th className="px-4 py-3 text-right font-medium">Rent/mo</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {leases.map(lease => {
                const worstStatus = (['overdue', 'partially_paid', 'unpaid', 'paid'] as const).find(s =>
                  lease.invoices.some(inv => {
                    const paid = inv.allocations.reduce((x, a) => x + Number(a.amountSen), 0)
                    return invoiceStatus({ dueDate: inv.dueDate.toISOString().slice(0, 10), amountSen: Number(inv.amountSen), paidSen: paid }, now) === s
                  })
                ) ?? 'paid'
                const style = STATUS_STYLES[worstStatus]

                return (
                  <tr key={lease.id} className="hover:bg-zinc-50/70 transition-colors cursor-pointer">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/leases/${lease.id}`} className="block">
                        <span className="font-semibold text-zinc-900">{lease.unit.name}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      <Link href={`/dashboard/leases/${lease.id}`} className="block">
                        {lease.tenant.fullName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs hidden sm:table-cell">
                      <Link href={`/dashboard/leases/${lease.id}`} className="block">
                        {lease.startDate.toISOString().slice(0, 10)} → {lease.endDate.toISOString().slice(0, 10)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-zinc-900">
                      <Link href={`/dashboard/leases/${lease.id}`} className="block">
                        RM {(Number(lease.monthlyRentSen) / 100).toFixed(2)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/leases/${lease.id}`} className="block">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style.bg} ${style.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                          {worstStatus.replace('_', ' ')}
                        </span>
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
