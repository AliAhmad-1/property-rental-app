import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthContext, unauthorized, forbidden, notFound } from '@/lib/auth'
import { allocate } from '@/lib/allocation'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/utils'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (auth.role === 'tenant') return forbidden()

  const { leaseId } = await params
  if (!isUuid(leaseId)) return notFound()

  const lease = await prisma.lease.findUnique({ where: { id: leaseId } })
  if (!lease || lease.orgId !== auth.orgId) return notFound()

  let body: { amountSen: number; method: string; receivedAt: string; slipPath?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { amountSen, method, receivedAt, slipPath } = body

  if (!amountSen || !method || !receivedAt) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (!['cash', 'bank_transfer'].includes(method)) {
    return NextResponse.json({ error: 'Invalid method' }, { status: 400 })
  }
  if (method === 'bank_transfer' && !slipPath) {
    return NextResponse.json({ error: 'slipPath required for bank_transfer' }, { status: 400 })
  }
  if (!Number.isInteger(amountSen) || amountSen <= 0) {
    return NextResponse.json({ error: 'amountSen must be a positive integer' }, { status: 400 })
  }

  // receivedAt must be a valid ISO 8601 instant
  const receivedDate = new Date(receivedAt)
  if (Number.isNaN(receivedDate.getTime())) {
    return NextResponse.json({ error: 'Invalid receivedAt' }, { status: 400 })
  }

  // Validate slipPath belongs to this org
  if (slipPath && !slipPath.startsWith(`${auth.orgId}/`)) {
    return NextResponse.json({ error: 'Invalid slip path' }, { status: 400 })
  }

  // Validate the slip file actually exists in this org's folder
  if (slipPath) {
    const supabase = await createClient()
    const lastSlash = slipPath.lastIndexOf('/')
    const folder = slipPath.slice(0, lastSlash)
    const fileName = slipPath.slice(lastSlash + 1)
    const { data: files, error: listErr } = await supabase.storage
      .from('payment-slips')
      .list(folder, { search: fileName })
    if (listErr || !files?.some(f => f.name === fileName)) {
      return NextResponse.json({ error: 'Slip file not found' }, { status: 400 })
    }
  }

  const isManager = auth.role === 'manager'
  const status = isManager ? 'approved' : 'pending_verification'

  // Cap check — must be done inside a transaction with a lock
  const payment = await prisma.$transaction(async (tx) => {
    // Lock the lease row to prevent concurrent cap violations
    await tx.$executeRaw`SELECT id FROM leases WHERE id = ${leaseId}::uuid FOR UPDATE`

    // Calculate remaining balance
    const invoices = await tx.invoice.findMany({ where: { leaseId } })
    const totalInvoiced = invoices.reduce((s, i) => s + Number(i.amountSen), 0)

    const allocs = await tx.paymentAllocation.findMany({
      where: { orgId: auth.orgId!, payment: { leaseId } },
    })
    const totalAllocated = allocs.reduce((s, a) => s + Number(a.amountSen), 0)

    const pendingPayments = await tx.payment.findMany({
      where: { leaseId, status: 'pending_verification' },
    })
    const totalPending = pendingPayments.reduce((s, p) => s + Number(p.amountSen), 0)

    const remaining = totalInvoiced - totalAllocated - totalPending
    if (amountSen > remaining) {
      throw { code: 'OVER_CAP' }
    }

    const p = await tx.payment.create({
      data: {
        orgId:      auth.orgId!,
        leaseId,
        amountSen:  BigInt(amountSen),
        method,
        status,
        receivedAt: receivedDate,
        slipPath:   slipPath ?? null,
        recordedBy: auth.userId,
      },
    })

    if (isManager) {
      await allocate(tx, p.id)
      await tx.auditLog.create({
        data: {
          orgId: auth.orgId!, actorId: auth.userId,
          action: 'payment_approved', entityId: p.id,
          details: { amountSen, method, note: 'auto-approved by manager' },
        },
      })
    }

    return p
  }, { timeout: 10000 }).catch((e) => {
    if (e?.code === 'OVER_CAP') return null
    throw e
  })

  if (!payment) {
    return NextResponse.json({ error: 'Payment exceeds remaining balance' }, { status: 422 })
  }

  return NextResponse.json({ id: payment.id, status: payment.status }, { status: 201 })
}
