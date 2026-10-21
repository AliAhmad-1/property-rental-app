'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface Props { slipPath: string }

export default function SlipLink({ slipPath }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleView() {
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase.storage
      .from('payment-slips')
      .createSignedUrl(slipPath, 60) // 60 seconds
    setLoading(false)
    if (error || !data) {
      toast.error('Could not load slip')
    } else {
      window.open(data.signedUrl, '_blank')
    }
  }

  return (
    <button
      onClick={handleView}
      disabled={loading}
      className="text-xs text-blue-600 hover:underline disabled:opacity-50"
    >
      {loading ? 'Loading…' : 'View slip'}
    </button>
  )
}
