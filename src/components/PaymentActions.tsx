'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

interface Props { paymentId: string; status: string; onDone?: () => void }

export default function PaymentActions({ paymentId, status, onDone }: Props) {
  const router = useRouter()
  const [dialog, setDialog] = useState<'reject' | 'void' | null>(null)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  async function doAction(action: 'approve' | 'reject' | 'void') {
    setLoading(true)
    const body = action === 'approve' ? {} : { reason }
    const res = await fetch(`/api/payments/${paymentId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) {
      toast.error(data.error ?? 'Something went wrong')
    } else {
      toast.success(`Payment ${action}d`)
      setDialog(null)
      setReason('')
      if (onDone) onDone()
      else router.refresh()
    }
  }

  return (
    <>
      <div className="flex gap-1">
        {status === 'pending_verification' && (
          <>
            <Button size="sm" variant="outline" className="text-green-700 border-green-300" onClick={() => doAction('approve')} disabled={loading}>Approve</Button>
            <Button size="sm" variant="outline" className="text-red-600 border-red-300" onClick={() => setDialog('reject')}>Reject</Button>
          </>
        )}
        {status === 'approved' && (
          <Button size="sm" variant="outline" className="text-zinc-600" onClick={() => setDialog('void')}>Void</Button>
        )}
      </div>

      <Dialog open={!!dialog} onOpenChange={() => { setDialog(null); setReason('') }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === 'reject' ? 'Reject payment' : 'Void payment'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (min 5 characters)</Label>
            <Textarea id="reason" value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Enter reason..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 5 || loading}
              onClick={() => dialog && doAction(dialog)}
            >
              Confirm {dialog}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
