'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { generateSchedule, parseRinggitToSen } from '@/lib/billing'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

interface Unit { id: string; name: string }
interface Tenant { id: string; fullName: string }
interface Props { units: Unit[]; tenants: Tenant[] }

export default function NewLeaseForm({ units, tenants }: Props) {
  const router = useRouter()
  const [unitId, setUnitId] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [rent, setRent] = useState('')
  const [deposit, setDeposit] = useState('')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<ReturnType<typeof generateSchedule> | null>(null)

  function updatePreview() {
    try {
      const monthlyRentSen = parseRinggitToSen(rent)
      const depositSen = deposit ? parseRinggitToSen(deposit) : 0
      const schedule = generateSchedule({ startDate, endDate, monthlyRentSen, depositSen })
      setPreview(schedule)
    } catch { setPreview(null) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    let monthlyRentSen: number, depositSen: number
    try {
      monthlyRentSen = parseRinggitToSen(rent)
      depositSen = deposit ? parseRinggitToSen(deposit) : 0
    } catch {
      toast.error('Invalid amount')
      setLoading(false)
      return
    }

    const res = await fetch('/api/leases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unitId, tenantId, startDate, endDate, monthlyRentSen, depositSen }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) {
      toast.error(data.error ?? 'Failed to create lease')
    } else {
      toast.success('Lease created')
      router.push(`/dashboard/leases/${data.id}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-white p-4">
      <div className="space-y-1">
        <Label>Unit</Label>
        <Select value={unitId} onValueChange={v => setUnitId(v ?? '')}>
          <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
          <SelectContent>{units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Tenant</Label>
        <Select value={tenantId} onValueChange={v => setTenantId(v ?? '')}>
          <SelectTrigger><SelectValue placeholder="Select tenant" /></SelectTrigger>
          <SelectContent>{tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.fullName}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="startDate">Start date</Label>
          <Input id="startDate" type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPreview(null) }} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="endDate">End date</Label>
          <Input id="endDate" type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPreview(null) }} required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="rent">Monthly rent (RM)</Label>
          <Input id="rent" value={rent} onChange={e => { setRent(e.target.value); setPreview(null) }} placeholder="1,500.00" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="deposit">Deposit (RM)</Label>
          <Input id="deposit" value={deposit} onChange={e => { setDeposit(e.target.value); setPreview(null) }} placeholder="0.00" />
        </div>
      </div>

      <Button type="button" variant="outline" size="sm" onClick={updatePreview}>Preview schedule</Button>

      {preview && (
        <div className="rounded border text-xs overflow-hidden">
          <table className="w-full">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-1 text-left">Kind</th>
                <th className="px-3 py-1 text-left">Due</th>
                <th className="px-3 py-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {preview.map((inv, i) => (
                <tr key={i}>
                  <td className="px-3 py-1">{inv.kind}</td>
                  <td className="px-3 py-1">{inv.dueDate}</td>
                  <td className="px-3 py-1 text-right">RM {(inv.amountSen / 100).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Button type="submit" disabled={loading || !unitId || !tenantId}>
        {loading ? 'Creating…' : 'Create lease'}
      </Button>
    </form>
  )
}
