import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import NavBar from '@/components/NavBar'

export const instant = false

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await connection()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const membership = await prisma.membership.findFirst({ where: { userId: user.id } })
  const tenant = !membership ? await prisma.tenant.findFirst({ where: { userId: user.id } }) : null

  if (!membership && !tenant) redirect('/login')

  const role = membership?.role ?? 'tenant'
  const orgId = membership?.orgId ?? tenant?.orgId ?? ''

  return (
    <div className="flex min-h-screen flex-col">
      <NavBar role={role} email={user.email ?? ''} />
      <main className="flex-1 container mx-auto px-4 py-6 max-w-5xl">
        {children}
      </main>
    </div>
  )
}
