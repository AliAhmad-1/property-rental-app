/**
 * Allocate an approved payment to the lease's invoices.
 * Called inside a serializable transaction to prevent double-allocation.
 *
 * Allocation order: due_date ASC, then deposit before rent, then period_index ASC.
 */

import type { PrismaClient } from '../../generated/prisma/client'

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

export async function allocate(tx: Tx, paymentId: string): Promise<void> {
  const payment = await tx.payment.findUniqueOrThrow({
    where: { id: paymentId },
  })

  // Get all invoices for the lease, ordered by allocation priority
  const invoices = await tx.invoice.findMany({
    where: { leaseId: payment.leaseId },
    orderBy: [
      { dueDate: 'asc' },
      // deposit (kind='deposit') sorts before rent for same dueDate
      { kind: 'asc' },
      { periodIndex: 'asc' },
    ],
  })

  // Calculate already-paid amounts per invoice
  const existingAllocations = await tx.paymentAllocation.groupBy({
    by: ['invoiceId'],
    where: { invoiceId: { in: invoices.map(i => i.id) } },
    _sum: { amountSen: true },
  })

  const paidMap = new Map<string, bigint>()
  for (const row of existingAllocations) {
    paidMap.set(row.invoiceId, row._sum.amountSen ?? 0n)
  }

  let remaining = payment.amountSen
  const newAllocations: { invoiceId: string; amountSen: bigint }[] = []

  for (const invoice of invoices) {
    if (remaining <= 0n) break
    const paid = paidMap.get(invoice.id) ?? 0n
    const unpaid = invoice.amountSen - paid
    if (unpaid <= 0n) continue

    const allocate = remaining < unpaid ? remaining : unpaid
    newAllocations.push({ invoiceId: invoice.id, amountSen: allocate })
    remaining -= allocate
  }

  if (newAllocations.length > 0) {
    await tx.paymentAllocation.createMany({
      data: newAllocations.map(a => ({
        orgId: payment.orgId,
        paymentId: payment.id,
        invoiceId: a.invoiceId,
        amountSen: a.amountSen,
      })),
    })
  }

  // Store unapplied amount (only online payments can have this)
  await tx.payment.update({
    where: { id: paymentId },
    data: { unappliedSen: remaining < 0n ? 0n : remaining },
  })
}
