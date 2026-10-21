'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { parseRinggitToSen } from '@/lib/billing'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

interface Props { leaseId: string; orgId: string; onSuccess?: () => void }

export default function RecordPaymentForm({ leaseId, orgId, onSuccess }: Props) {
  const router = useRouter()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'cash' | 'bank_transfer'>('cash')
  // Default receivedAt: current MYT time in datetime-local format.
  // Set in useEffect to avoid SSR/hydration mismatch (clock-dependent value).
  const [receivedAt, setReceivedAt] = useState('')
  useEffect(() => {
    setReceivedAt(new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 16))
  }, [])
  const [slip, setSlip] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    let amountSen: number
    try {
      amountSen = parseRinggitToSen(amount)
    } catch {
      toast.error('Invalid amount. Enter digits, e.g. 1,500.00')
      setLoading(false)
      return
    }

    // Convert MYT datetime-local to UTC ISO string (+8:00)
    const receivedAtUtc = new Date(receivedAt + ':00+08:00').toISOString()

    let slipPath: string | undefined
    if (method === 'bank_transfer') {
      if (!slip) {
        toast.error('Please upload a slip for bank transfer')
        setLoading(false)
        return
      }
      const supabase = createClient()
      const ext = slip.name.split('.').pop()
      const path = `${orgId}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('payment-slips').upload(path, slip)
      if (error) {
        toast.error('Slip upload failed: ' + error.message)
        setLoading(false)
        return
      }
      slipPath = path
    }

    const res = await fetch(`/api/leases/${leaseId}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountSen, method, receivedAt: receivedAtUtc, slipPath }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      // If API fails and we already uploaded slip, remove it
      if (slipPath) {
        const supabase = createClient()
        await supabase.storage.from('payment-slips').remove([slipPath])
      }
      toast.error(data.error ?? 'Failed to record payment')
    } else {
      toast.success(`Payment recorded (${data.status})`)
      setAmount('')
      setSlip(null)
      setReceivedAt(new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 16))
      if (onSuccess) onSuccess()
      else router.refresh()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-white p-4 space-y-4 max-w-md">
      <div className="space-y-1">
        <Label htmlFor="amount">Amount (RM)</Label>
        <Input id="amount" value={amount} onChange={e => setAmount(e.target.value)} placeholder="1,500.00" required />
      </div>

      <div className="space-y-1">
        <Label>Method</Label>
        <Select value={method} onValueChange={v => setMethod(v as 'cash' | 'bank_transfer')}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="receivedAt">Received at (Malaysia time)</Label>
        <Input id="receivedAt" type="datetime-local" value={receivedAt} onChange={e => setReceivedAt(e.target.value)} required />
      </div>

      {method === 'bank_transfer' && (
        <div className="space-y-1">
          <Label htmlFor="slip">Transfer slip (JPEG, PNG or PDF, max 5 MB)</Label>
          <Input
            id="slip"
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            onChange={e => setSlip(e.target.files?.[0] ?? null)}
          />
        </div>
      )}

      <Button type="submit" disabled={loading}>{loading ? 'Recording…' : 'Record payment'}</Button>
    </form>
  )
}
