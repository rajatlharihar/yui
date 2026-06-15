import { createClient } from '../utils/supabase/server.js'
// Standard Web Response API

export async function POST(request) {
  const supabase = createClient()
  await supabase.auth.signOut()

  return Response.redirect(new URL('/admin/login', request.url), 302)
}
