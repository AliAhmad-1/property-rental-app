import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import NewLeaseForm from '@/components/NewLeaseForm'

export const instant = false

export default async function NewLeasePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const membership = await prisma.membership.findFirst({ where: { userId: user.id } })
  if (!membership || membership.role !== 'manager') redirect('/dashboard/leases')

  const [units, tenants] = await Promise.all([
    prisma.unit.findMany({ where: { orgId: membership.orgId }, orderBy: { name: 'asc' } }),
    prisma.tenant.findMany({ where: { orgId: membership.orgId }, orderBy: { fullName: 'asc' } }),
  ])

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold">New Lease</h1>
      <NewLeaseForm units={units} tenants={tenants} />
    </div>
  )
}
