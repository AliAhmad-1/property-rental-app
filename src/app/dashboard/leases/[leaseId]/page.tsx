'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import PaymentActions from '@/components/PaymentActions'
import RecordPaymentForm from '@/components/RecordPaymentForm'
import SlipLink from '@/components/SlipLink'

interface InvoiceRow {
  id: string
  kind: string
  periodIndex: number | null
  periodStart: string | null
  periodEnd: string | null
  dueDate: string
  amountSen: number
  paidSen: number
  status: string
}

interface PaymentRow {
  id: string
  amountSen: number
  unappliedSen: number
  method: string
  status: string
  receivedAt: string
  slipPath?: string
}

interface LeaseData {
  id: string
  orgId: string
  unitId: string
  tenantId: string
  startDate: string
  endDate: string
  monthlyRentSen: number
  depositSen: number
  unit: { id: string; name: string }
  tenant: { id: string; fullName: string }
}

function fmt(sen: number) {
  return `RM ${(sen / 100).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtMyt(date: string) {
  return new Date(date).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-green-100 text-green-700 border-green-200',
  overdue: 'bg-red-100 text-red-700 border-red-200',
  partially_paid: 'bg-amber-100 text-amber-700 border-amber-200',
  unpaid: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  pending_verification: 'bg-blue-100 text-blue-700 border-blue-200',
  approved: 'bg-green-100 text-green-700 border-green-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  voided: 'bg-zinc-100 text-zinc-500 border-zinc-200',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-zinc-100 text-zinc-600'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-zinc-200 rounded" />
      <div className="h-4 w-72 bg-zinc-100 rounded" />
      <div className="h-48 bg-zinc-100 rounded-lg" />
      <div className="h-32 bg-zinc-100 rounded-lg" />
    </div>
  )
}

export default function LeaseDetailPage() {
  const { leaseId } = useParams() as { leaseId: string }
  const [lease, setLease] = useState<LeaseData | null>(null)
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [role, setRole] = useState<string>('staff')

  // Get user role from Supabase session
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        // Role comes from memberships — we detect via API response or store in session
        // We use a lightweight check: try to fetch the org role
        fetch('/api/me').then(r => r.ok ? r.json() : null).then(d => {
          if (d?.role) setRole(d.role)
        })
      }
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/leases/${leaseId}`)
    if (res.ok) {
      const data = await res.json()
      setLease(data.lease)
      setInvoices(data.invoices)
      setPayments(data.payments)
    } else {
      setError('Lease not found or access denied.')
    }
    setLoading(false)
  }, [leaseId])

  // Defer the initial load one tick so setState isn't called synchronously
  // inside the effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    const id = setTimeout(load, 0)
    return () => clearTimeout(id)
  }, [load])

  if (loading) return <Skeleton />

  if (error || !lease) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-700 font-medium">{error ?? 'Lease not found'}</p>
      </div>
    )
  }

  const isManager = role === 'manager'
  const isStaff = role === 'staff' || role === 'manager'

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">{lease.unit.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {lease.tenant.fullName} &nbsp;·&nbsp;
            {lease.startDate} → {lease.endDate} &nbsp;·&nbsp;
            {fmt(Number(lease.monthlyRentSen))}/mo
            {Number(lease.depositSen) > 0 && ` · Deposit ${fmt(Number(lease.depositSen))}`}
          </p>
        </div>
      </div>

      {/* Invoices */}
      <section>
        <h2 className="text-base font-semibold text-zinc-900 mb-3">Invoices</h2>
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 border-b text-xs text-zinc-500 uppercase tracking-wide">
                <th className="px-4 py-3 text-left font-medium">Period</th>
                <th className="px-4 py-3 text-left font-medium">Due date</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 text-right font-medium">Paid</th>
                <th className="px-4 py-3 text-right font-medium">Balance</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {invoices.map(inv => {
                const balance = Number(inv.amountSen) - Number(inv.paidSen)
                const period = inv.kind === 'deposit'
                  ? 'Security Deposit'
                  : inv.periodStart && inv.periodEnd
                    ? `${inv.periodStart} – ${inv.periodEnd}`
                    : `Period ${inv.periodIndex}`
                return (
                  <tr key={inv.id} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-zinc-800">{period}</td>
                    <td className="px-4 py-3 text-zinc-600">{inv.dueDate}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(Number(inv.amountSen))}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-green-700">{fmt(Number(inv.paidSen))}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-500">{balance > 0 ? fmt(balance) : '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Payments */}
      <section>
        <h2 className="text-base font-semibold text-zinc-900 mb-3">Payments</h2>
        {payments.length === 0 ? (
          <div className="rounded-xl border bg-white p-8 text-center text-zinc-400 text-sm">
            No payments recorded yet.
          </div>
        ) : (
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 border-b text-xs text-zinc-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left font-medium">Received (MYT)</th>
                  <th className="px-4 py-3 text-left font-medium">Method</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Slip</th>
                  {isManager && <th className="px-4 py-3 text-left font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {payments.map(p => (
                  <tr key={p.id} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="px-4 py-3 text-zinc-700">{fmtMyt(p.receivedAt)}</td>
                    <td className="px-4 py-3 text-zinc-600 capitalize">{p.method.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(Number(p.amountSen))}</td>
                    <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3">
                      {p.method === 'bank_transfer' && p.slipPath
                        ? <SlipLink slipPath={p.slipPath} />
                        : <span className="text-zinc-300">—</span>}
                    </td>
                    {isManager && (
                      <td className="px-4 py-3">
                        <PaymentActions paymentId={p.id} status={p.status} onDone={load} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Record payment — only staff and managers */}
      {isStaff && (
        <section>
          <h2 className="text-base font-semibold text-zinc-900 mb-3">Record Payment</h2>
          <RecordPaymentForm leaseId={leaseId} orgId={lease.orgId} onSuccess={load} />
        </section>
      )}
    </div>
  )
}
