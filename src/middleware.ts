import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

import { openOperatorCredentials } from '@/lib/open-operator'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export async function middleware(request: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({
      request: { headers: request.headers }
    })
  }

  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request: { headers: request.headers } })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      }
    }
  })

  let {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    const credentials = openOperatorCredentials()
    if (credentials) {
      const { data, error } = await supabase.auth.signInWithPassword(credentials)
      if (!error && data.user) {
        user = data.user
      }
    }
  }

  if (user && request.nextUrl.pathname === '/login') {
    const redirect = NextResponse.redirect(new URL('/home', request.url))
    response.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set(cookie.name, cookie.value)
    })
    return redirect
  }

  return response
}

export const config = {
  // Skip API + static assets. API routes already call requirePortalAccess /
  // their own auth — middleware getUser() on every /api/* call was doubling
  // Supabase Auth round-trips and made the console feel stuck.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
  ]
}
