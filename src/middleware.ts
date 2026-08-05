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
      const { error } = await supabase.auth.signInWithPassword(credentials)
      if (!error) {
        ;({
          data: { user }
        } = await supabase.auth.getUser())
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
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
  ]
}
