import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthContext, unauthorized, forbidden } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (auth.role === 'tenant') return forbidden()

  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  if (!from || !to || !/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'Invalid range. Use YYYY-MM format.' }, { status: 400 })
  }
  if (from > to) {
    return NextResponse.json({ error: 'from must be before or equal to to' }, { status: 400 })
  }

  // Query payments grouped by month in Malaysia time (UTC+8)
  const rows = await prisma.$queryRaw<{ month: string; total: bigint }[]>`
    SELECT
      to_char(date_trunc('month', received_at AT TIME ZONE 'Asia/Kuala_Lumpur'), 'YYYY-MM') AS month,
      SUM(amount_sen) AS total
    FROM payments
    WHERE org_id = ${auth.orgId!}::uuid
      AND status = 'approved'
      AND to_char(received_at AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYY-MM') >= ${from}
      AND to_char(received_at AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYY-MM') <= ${to}
    GROUP BY 1
    ORDER BY 1
  `

  // Build map of month -> collected
  const map = new Map<string, number>()
  for (const row of rows) {
    map.set(row.month, Number(row.total))
  }

  // Fill in all months including zeros
  const result: { month: string; collectedSen: number }[] = []
  const [fromYear, fromMonth] = from.split('-').map(Number)
  const [toYear, toMonth]     = to.split('-').map(Number)

  let y = fromYear, m = fromMonth
  while (y < toYear || (y === toYear && m <= toMonth)) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    result.push({ month: key, collectedSen: map.get(key) ?? 0 })
    m++
    if (m > 12) { m = 1; y++ }
  }

  return NextResponse.json(result)
}
