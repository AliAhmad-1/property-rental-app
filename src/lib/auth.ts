/**
 * Server-side auth helpers.
 * Always use getUser() — never getSession() for security.
 */
import { createClient } from './supabase/server'
import { prisma } from './prisma'
import { NextRequest, NextResponse } from 'next/server'

export type Role = 'manager' | 'staff' | 'tenant'

export interface AuthContext {
  userId: string
  orgId?: string
  role: Role
  tenantId?: string
}

/**
 * Resolves the caller from a request.
 * Accepts both cookie sessions and Authorization: Bearer <token>.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Check membership (staff/manager)
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
  })
  if (membership) {
    return {
      userId: user.id,
      orgId: membership.orgId,
      role: membership.role as Role,
    }
  }

  // Check tenant
  const tenant = await prisma.tenant.findFirst({
    where: { userId: user.id },
  })
  if (tenant) {
    return {
      userId: user.id,
      orgId: tenant.orgId,
      role: 'tenant',
      tenantId: tenant.id,
    }
  }

  return null
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
