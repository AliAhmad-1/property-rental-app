'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface Props { leaseId: string }

export default function PayNowButton({ leaseId }: Props) {
  const [loading, setLoading] = useState(false)
  const [bill, setBill] = useState<{ billId: string; amountSen: number } | null>(null)

  async function handlePayNow() {
    setLoading(true)
    const res = await fetch(`/api/leases/${leaseId}/gateway-bills`, { method: 'POST' })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) {
      toast.error(data.error ?? 'Failed to create bill')
    } else {
      setBill(data)
    }
  }

  if (bill) {
    return (
      <div className="text-right">
        <p className="text-xs text-zinc-500 mb-1">Bill created</p>
        <p className="font-mono text-xs text-zinc-700 break-all mb-1">{bill.billId}</p>
        <p className="text-sm font-medium text-amber-800">RM {(bill.amountSen / 100).toFixed(2)}</p>
        <p className="text-xs text-zinc-400 mt-1">Awaiting gateway payment…</p>
      </div>
    )
  }

  return (
    <Button onClick={handlePayNow} disabled={loading}>
      {loading ? 'Creating bill…' : 'Pay now'}
    </Button>
  )
}
