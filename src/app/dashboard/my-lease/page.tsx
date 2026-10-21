import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { invoiceStatus } from '@/lib/billing'
import TenantPhoneForm from '@/components/TenantPhoneForm'
import PayNowButton from '@/components/PayNowButton'

export const instant = false

function fmt(sen: number) {
  return `RM ${(sen / 100).toLocaleString('en-MY', { minimumFractionDigits: 2 })}`
}

function fmtMyt(date: Date) {
  return date.toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' })
}

function statusBadge(s: string) {
  const colors: Record<string, string> = {
    paid: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700',
    partially_paid: 'bg-yellow-100 text-yellow-700',
    unpaid: 'bg-zinc-100 text-zinc-600',
    pending_verification: 'bg-blue-100 text-blue-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    voided: 'bg-zinc-100 text-zinc-500',
  }
  return <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${colors[s] ?? 'bg-zinc-100'}`}>{s.replace(/_/g, ' ')}</span>
}

export default async function MyLeasePage() {
  await connection()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const tenant = await prisma.tenant.findFirst({ where: { userId: user.id } })
  if (!tenant) redirect('/dashboard')

  const lease = await prisma.lease.findFirst({
    where: { tenantId: tenant.id },
    include: {
      unit: true,
      invoices: { include: { allocations: true }, orderBy: [{ dueDate: 'asc' }, { kind: 'asc' }, { periodIndex: 'asc' }] },
      payments: { orderBy: { receivedAt: 'asc' } },
    },
    orderBy: { startDate: 'desc' },
  })

  const now = new Date()

  // Calculate amount due now (MYT)
  const myt = new Date(now.getTime() + 8 * 3600 * 1000)
  const todayMyt = `${myt.getUTCFullYear()}-${String(myt.getUTCMonth()+1).padStart(2,'0')}-${String(myt.getUTCDate()).padStart(2,'0')}`
  let amountDueNow = 0
  if (lease) {
    for (const inv of lease.invoices) {
      const dueDate = inv.dueDate.toISOString().slice(0, 10)
      if (dueDate > todayMyt) continue
      const paidSen = inv.allocations.reduce((s, a) => s + Number(a.amountSen), 0)
      const status = invoiceStatus({ dueDate, amountSen: Number(inv.amountSen), paidSen }, now)
      if (status !== 'paid') amountDueNow += Number(inv.amountSen) - paidSen
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">My Lease</h1>
          {lease && <p className="text-zinc-500 text-sm">{lease.unit.name} · {lease.startDate.toISOString().slice(0,10)} → {lease.endDate.toISOString().slice(0,10)}</p>}
        </div>
        <TenantPhoneForm tenantId={tenant.id} currentPhone={tenant.phone} />
      </div>

      {!lease ? (
        <p className="text-zinc-400">No active lease found.</p>
      ) : (
        <>
          {/* Amount due */}
          {amountDueNow > 0 && (
            <div className="rounded-lg border bg-amber-50 border-amber-200 p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-amber-800">Amount due now</p>
                <p className="text-2xl font-bold text-amber-900">{fmt(amountDueNow)}</p>
              </div>
              <PayNowButton leaseId={lease.id} />
            </div>
          )}

          {/* Invoices */}
          <section>
            <h2 className="text-base font-semibold mb-2">Invoices</h2>
            <div className="rounded-lg border bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-zinc-500 text-xs">
                  <tr>
                    <th className="px-4 py-2 text-left">Period</th>
                    <th className="px-4 py-2 text-left">Due</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-right">Paid</th>
                    <th className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lease.invoices.map(inv => {
                    const paidSen = inv.allocations.reduce((s, a) => s + Number(a.amountSen), 0)
                    const status = invoiceStatus({ dueDate: inv.dueDate.toISOString().slice(0,10), amountSen: Number(inv.amountSen), paidSen }, now)
                    const period = inv.kind === 'deposit' ? 'Deposit'
                      : inv.periodStart ? `${inv.periodStart.toISOString().slice(0,10)} – ${inv.periodEnd?.toISOString().slice(0,10)}`
                      : `Period ${inv.periodIndex}`
                    return (
                      <tr key={inv.id}>
                        <td className="px-4 py-2">{period}</td>
                        <td className="px-4 py-2">{inv.dueDate.toISOString().slice(0,10)}</td>
                        <td className="px-4 py-2 text-right">{fmt(Number(inv.amountSen))}</td>
                        <td className="px-4 py-2 text-right">{fmt(paidSen)}</td>
                        <td className="px-4 py-2">{statusBadge(status)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Payments */}
          <section>
            <h2 className="text-base font-semibold mb-2">Payments</h2>
            {lease.payments.length === 0 ? (
              <p className="text-sm text-zinc-400">No payments yet.</p>
            ) : (
              <div className="rounded-lg border bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 text-zinc-500 text-xs">
                    <tr>
                      <th className="px-4 py-2 text-left">Received (MYT)</th>
                      <th className="px-4 py-2 text-left">Method</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                      <th className="px-4 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lease.payments.map(p => (
                      <tr key={p.id}>
                        <td className="px-4 py-2">{fmtMyt(p.receivedAt)}</td>
                        <td className="px-4 py-2">{p.method.replace('_', ' ')}</td>
                        <td className="px-4 py-2 text-right">{fmt(Number(p.amountSen))}</td>
                        <td className="px-4 py-2">{statusBadge(p.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
