import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthContext, unauthorized, forbidden, notFound } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/utils'

// Short-lived signed URL for a bank-transfer slip.
// Only staff/managers of the payment's organization may read slips.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const auth = await getAuthContext()
  if (!auth) return unauthorized()
  if (auth.role === 'tenant') return forbidden()

  const { paymentId } = await params
  if (!isUuid(paymentId)) return notFound()

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } })
  if (!payment || payment.orgId !== auth.orgId) return notFound()

  if (!payment.slipPath || !payment.slipPath.startsWith(`${auth.orgId}/`)) {
    return NextResponse.json({ error: 'No slip for this payment' }, { status: 404 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from('payment-slips')
    .createSignedUrl(payment.slipPath, 60) // 60 seconds

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Could not sign slip URL' }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl, expiresIn: 60 })
}
