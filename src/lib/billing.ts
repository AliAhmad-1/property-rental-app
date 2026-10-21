// Pure billing logic — no I/O, no framework imports, no machine-timezone dependence.

export type InvoiceKind = 'deposit' | 'rent'

export interface ScheduledInvoice {
  kind: InvoiceKind
  periodIndex: number | null  // 0,1,2... for rent; null for deposit
  periodStart: string | null  // 'YYYY-MM-DD'; null for deposit
  periodEnd: string | null    // 'YYYY-MM-DD' inclusive; null for deposit
  dueDate: string             // 'YYYY-MM-DD'
  amountSen: number           // integer
}

// ----------------------------------------------------------------
// Validation helpers
// ----------------------------------------------------------------

function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  )
}

function dateToUtc(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function utcToDate(dt: Date): string {
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Add k calendar months to a date, anchored to the original start day.
 * If the target month is shorter, clamp to the last day.
 */
function addMonths(baseDate: string, k: number): string {
  const [y, m, d] = baseDate.split('-').map(Number)
  const targetYear = y + Math.floor((m - 1 + k) / 12)
  const targetMonth = ((m - 1 + k) % 12) + 1  // 1-based
  // Last day of the target month
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate()
  const clampedDay = Math.min(d, lastDay)
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
}

// ----------------------------------------------------------------
// generateSchedule
// ----------------------------------------------------------------

export function generateSchedule(lease: {
  startDate: string
  endDate: string
  monthlyRentSen: number
  depositSen: number
}): ScheduledInvoice[] {
  const { startDate, endDate, monthlyRentSen, depositSen } = lease

  if (!isValidDate(startDate)) throw new Error(`Invalid startDate: ${startDate}`)
  if (!isValidDate(endDate))   throw new Error(`Invalid endDate: ${endDate}`)
  if (endDate < startDate)     throw new Error('endDate must be on or after startDate')
  if (!Number.isInteger(monthlyRentSen) || monthlyRentSen <= 0)
    throw new Error('monthlyRentSen must be a positive integer')
  if (!Number.isInteger(depositSen) || depositSen < 0)
    throw new Error('depositSen must be a non-negative integer')

  const result: ScheduledInvoice[] = []

  // Deposit
  if (depositSen > 0) {
    result.push({
      kind: 'deposit',
      periodIndex: null,
      periodStart: null,
      periodEnd: null,
      dueDate: startDate,
      amountSen: depositSen,
    })
  }

  // Rent periods
  let k = 0
  while (true) {
    const anchorK = addMonths(startDate, k)
    if (anchorK > endDate) break  // anchor is past the lease end

    const anchorNext = addMonths(startDate, k + 1)
    // Period runs from anchorK to day before anchorNext, clamped by endDate
    const periodEndFull = utcToDate(
      new Date(dateToUtc(anchorNext).getTime() - 86_400_000)
    )
    const periodEnd = periodEndFull < endDate ? periodEndFull : endDate

    let amountSen: number
    if (periodEnd === periodEndFull) {
      // Full period
      amountSen = monthlyRentSen
    } else {
      // Partial last period: monthlyRentSen × daysUsed / daysInFullPeriod, rounded half-up
      const daysUsed =
        (dateToUtc(periodEnd).getTime() - dateToUtc(anchorK).getTime()) / 86_400_000 + 1
      const daysTotal =
        (dateToUtc(periodEndFull).getTime() - dateToUtc(anchorK).getTime()) / 86_400_000 + 1
      amountSen = Math.floor((monthlyRentSen * daysUsed) / daysTotal + 0.5)
    }

    result.push({
      kind: 'rent',
      periodIndex: k,
      periodStart: anchorK,
      periodEnd,
      dueDate: anchorK,
      amountSen,
    })

    k++
  }

  return result
}

// ----------------------------------------------------------------
// invoiceStatus
// ----------------------------------------------------------------

export type InvoiceStatus = 'paid' | 'partially_paid' | 'unpaid' | 'overdue'

export function invoiceStatus(
  invoice: { dueDate: string; amountSen: number; paidSen: number },
  now: Date,
): InvoiceStatus {
  const { dueDate, amountSen, paidSen } = invoice

  if (paidSen >= amountSen) return 'paid'

  // Convert now to Malaysia date (UTC+8)
  const myt = new Date(now.getTime() + 8 * 3600 * 1000)
  const todayMyt =
    `${myt.getUTCFullYear()}-` +
    `${String(myt.getUTCMonth() + 1).padStart(2, '0')}-` +
    `${String(myt.getUTCDate()).padStart(2, '0')}`

  // overdue if today's MYT date is strictly after dueDate
  if (todayMyt > dueDate) return 'overdue'

  if (paidSen > 0) return 'partially_paid'

  return 'unpaid'
}

// ----------------------------------------------------------------
// parseRinggitToSen
// ----------------------------------------------------------------

export function parseRinggitToSen(input: string): number {
  const trimmed = input.trim()

  // Pattern: optional comma-separated thousands, optional 1-2 decimal digits
  // Valid: "1,500.50"  "1.15"  "7"  "1,500"
  // Invalid: "RM 10"  "-5"  "1.234"  "1e3"  "1,23"  ""
  const pattern = /^(\d{1,3}(,\d{3})*|\d+)(\.\d{1,2})?$/
  if (!pattern.test(trimmed)) {
    throw new Error(`Invalid ringgit amount: "${input}"`)
  }

  // Remove commas
  const withoutCommas = trimmed.replace(/,/g, '')
  const [ringgit, sen = '0'] = withoutCommas.split('.')

  const senStr = sen.padEnd(2, '0')  // "5" → "50", "15" → "15"
  return parseInt(ringgit, 10) * 100 + parseInt(senStr, 10)
}
