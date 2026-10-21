import { redirect } from 'next/navigation'
import Link from 'next/link'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { invoiceStatus } from '@/lib/billing'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const instant = false

function getMytDate(now: Date) {
  const myt = new Date(now.getTime() + 8 * 3600 * 1000)
  return `${myt.getUTCFullYear()}-${String(myt.getUTCMonth() + 1).padStart(2, '0')}-${String(myt.getUTCDate()).padStart(2, '0')}`
}

function fmt(sen: number) {
  return `RM ${(sen / 100).toLocaleString('en-MY', { minimumFractionDigits: 2 })}`
}

export default async function DashboardPage() {
  await connection()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const membership = await prisma.membership.findFirst({ where: { userId: user.id } })
  if (!membership) redirect('/dashboard/my-lease')

  const orgId = membership.orgId
  const now = new Date()

  // Count overdue + pending invoices
  const allInvoices = await prisma.invoice.findMany({
    where: { orgId },
    include: { allocations: true },
  })

  let overdueCount = 0
  let unpaidCount = 0
  for (const inv of allInvoices) {
    const paidSen = inv.allocations.reduce((s, a) => s + Number(a.amountSen), 0)
    const status = invoiceStatus({ dueDate: inv.dueDate.toISOString().slice(0, 10), amountSen: Number(inv.amountSen), paidSen }, now)
    if (status === 'overdue') overdueCount++
    if (status === 'unpaid' || status === 'partially_paid') unpaidCount++
  }

  // Pending payments count
  const pendingCount = await prisma.payment.count({
    where: { orgId, status: 'pending_verification' },
  })

  // Collections — last 6 months MYT
  const todayMyt = getMytDate(now)
  const [y, m] = todayMyt.split('-').map(Number)
  const months: string[] = []
  for (let i = 5; i >= 0; i--) {
    let mm = m - i, yy = y
    while (mm <= 0) { mm += 12; yy-- }
    months.push(`${yy}-${String(mm).padStart(2, '0')}`)
  }

  const rows = await prisma.$queryRaw<{ month: string; total: bigint }[]>`
    SELECT
      to_char(date_trunc('month', received_at AT TIME ZONE 'Asia/Kuala_Lumpur'), 'YYYY-MM') AS month,
      SUM(amount_sen) AS total
    FROM payments
    WHERE org_id = ${orgId}::uuid AND status = 'approved'
      AND to_char(received_at AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYY-MM') >= ${months[0]}
      AND to_char(received_at AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYY-MM') <= ${months[5]}
    GROUP BY 1 ORDER BY 1
  `
  const collMap = new Map(rows.map(r => [r.month, Number(r.total)]))
  const collections = months.map(month => ({ month, collectedSen: collMap.get(month) ?? 0 }))
  const maxSen = Math.max(...collections.map(c => c.collectedSen), 1)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Dashboard</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Overview for your organization</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-red-600 uppercase tracking-wide">Overdue invoices</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-3xl font-bold text-red-700">{overdueCount}</p>
            <Link href="/dashboard/leases" className="text-xs text-red-500 hover:underline mt-1 inline-block">View leases →</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Unpaid invoices</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-3xl font-bold text-zinc-900">{unpaidCount}</p>
          </CardContent>
        </Card>

        <Card className={pendingCount > 0 ? 'border-amber-200 bg-amber-50' : ''}>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className={`text-xs font-medium uppercase tracking-wide ${pendingCount > 0 ? 'text-amber-600' : 'text-zinc-500'}`}>
              Pending approvals
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className={`text-3xl font-bold ${pendingCount > 0 ? 'text-amber-700' : 'text-zinc-900'}`}>{pendingCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Collections chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Collections — Last 6 Months (MYT)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {collections.map(({ month, collectedSen }) => {
              const pct = maxSen > 0 ? (collectedSen / maxSen) * 100 : 0
              return (
                <div key={month} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500 w-16 flex-shrink-0">{month}</span>
                  <div className="flex-1 h-6 bg-zinc-100 rounded-md overflow-hidden">
                    {pct > 0 && (
                      <div
                        className="h-full bg-zinc-800 rounded-md flex items-center justify-end pr-2 transition-all"
                        style={{ width: `${pct}%` }}
                      >
                        {pct > 25 && (
                          <span className="text-xs text-white font-medium">{fmt(collectedSen)}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <span className={`text-sm font-medium w-28 text-right tabular-nums flex-shrink-0 ${collectedSen > 0 ? 'text-zinc-900' : 'text-zinc-300'}`}>
                    {fmt(collectedSen)}
                  </span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
