import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function updateSession(request) {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // We need to use `createServerClient` in middleware context to update session cookies securely
  const supabase = createServerClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // This will refresh the session if expired and valid refresh token exists
  const { data: { user } } = await supabase.auth.getUser()

  const url = request.nextUrl

  // Protect all /admin routes except the login page
  if (url.pathname.startsWith('/admin') && url.pathname !== '/admin/login') {
    if (!user) {
      const loginUrl = url.clone()
      loginUrl.pathname = '/admin/login'
      return NextResponse.redirect(loginUrl)
    }
  }

  // Redirect authenticated users away from the login page to the dashboard
  if (url.pathname === '/admin/login' && user) {
    const dashboardUrl = url.clone()
    dashboardUrl.pathname = '/admin/reservations'
    return NextResponse.redirect(dashboardUrl)
  }

  return supabaseResponse
}
