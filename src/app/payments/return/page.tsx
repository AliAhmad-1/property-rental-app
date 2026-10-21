import { connection } from 'next/server'
import { prisma } from '@/lib/prisma'

export const instant = false

interface Props {
  searchParams: Promise<{ bill_id?: string; paid?: string }>
}

export default async function PaymentReturnPage({ searchParams }: Props) {
  await connection()
  const { bill_id } = await searchParams

  if (!bill_id) {
    return <div className="p-8 text-center text-red-600">Invalid return URL.</div>
  }

  const bill = await prisma.gatewayBill.findUnique({ where: { id: bill_id } })

  if (!bill) {
    return <div className="p-8 text-center text-red-600">Bill not found.</div>
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <div className="rounded-xl border bg-white p-8 shadow-sm w-full max-w-sm text-center">
        <h1 className="text-xl font-semibold mb-4">Payment Status</h1>
        <p className="text-sm text-zinc-500 mb-2">Bill ID</p>
        <p className="font-mono text-xs mb-4 break-all">{bill.id}</p>
        <p className="text-sm text-zinc-500 mb-2">Amount</p>
        <p className="text-2xl font-semibold mb-4">
          RM {(Number(bill.amountSen) / 100).toFixed(2)}
        </p>
        <div className={`rounded-lg px-4 py-2 text-sm font-medium ${
          bill.status === 'paid'   ? 'bg-green-100 text-green-700' :
          bill.status === 'failed' ? 'bg-red-100 text-red-700' :
                                     'bg-yellow-100 text-yellow-700'
        }`}>
          {bill.status === 'paid' ? '✓ Payment confirmed' :
           bill.status === 'failed' ? '✗ Payment failed' :
           '⏳ Payment pending'}
        </div>
        <p className="mt-4 text-xs text-zinc-400">
          This page only shows the real status from our database.
        </p>
      </div>
    </div>
  )
}
