'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface Props { tenantId: string; currentPhone: string }

export default function TenantPhoneForm({ tenantId, currentPhone }: Props) {
  const router = useRouter()
  const [phone, setPhone] = useState(currentPhone)
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('tenants')
      .update({ phone })
      .eq('id', tenantId)
    setLoading(false)
    if (error) {
      toast.error('Failed to update phone: ' + error.message)
    } else {
      toast.success('Phone updated')
      router.refresh()
    }
  }

  return (
    <div className="flex items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor="phone" className="text-xs">Phone number</Label>
        <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+60..." className="h-8 text-sm" />
      </div>
      <Button size="sm" variant="outline" onClick={handleSave} disabled={loading}>
        {loading ? 'Saving…' : 'Save'}
      </Button>
    </div>
  )
}
