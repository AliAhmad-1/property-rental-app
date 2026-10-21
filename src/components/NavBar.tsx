'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface Props { role: string; email: string }

export default function NavBar({ role, email }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    toast.success('Signed out')
    router.push('/login')
    router.refresh()
  }

  const links =
    role === 'tenant'
      ? [{ href: '/dashboard/my-lease', label: 'My Lease' }]
      : [
          { href: '/dashboard', label: 'Dashboard' },
          { href: '/dashboard/leases', label: 'Leases' },
        ]

  return (
    <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur-sm">
      <div className="container mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-zinc-900 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <span className="font-semibold text-zinc-900 text-sm">RentCollect</span>
          </Link>

          <nav className="flex items-center gap-1">
            {links.map(link => {
              const active = link.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    active
                      ? 'bg-zinc-100 text-zinc-900'
                      : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
                  }`}
                >
                  {link.label}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* User */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-xs font-medium text-zinc-700">{email}</span>
            <span className="text-xs text-zinc-400 capitalize">{role}</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut} className="h-8 text-xs">
            Sign out
          </Button>
        </div>
      </div>
    </header>
  )
}
