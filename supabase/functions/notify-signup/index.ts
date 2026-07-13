// Fires when a Postgres trigger (see supabase/schema.sql) posts here after a
// new row lands in public.profiles. Looks up the new user's email (not
// stored on profiles) via the Admin API, then emails a notification to the
// site owner through Resend.
//
// Required secrets (supabase secrets set ...):
//   RESEND_API_KEY   - from resend.com
//   WEBHOOK_SECRET   - shared secret also set as the `app.webhook_secret`
//                      Postgres setting; rejects any request that doesn't
//                      present it, since this URL is otherwise publicly
//                      reachable.
//   NOTIFY_EMAIL     - optional override for the notification recipient,
//                      defaults to mcole1008@outlook.com if unset.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by
// the Supabase platform into every Edge Function -- no need to set them.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DEFAULT_NOTIFY_EMAIL = 'mcole1008@outlook.com'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const expectedSecret = Deno.env.get('WEBHOOK_SECRET')
  const providedSecret = req.headers.get('x-webhook-secret')
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  let payload
  try {
    payload = await req.json()
  } catch {
    return new Response('Invalid JSON body', { status: 400 })
  }

  const record = payload?.record
  if (!record?.id) {
    return new Response('Missing record.id in payload', { status: 400 })
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!resendApiKey) {
    console.error('RESEND_API_KEY is not set')
    return new Response('Server not configured', { status: 500 })
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  let email = '(unknown)'
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(record.id)
    if (!error && data?.user?.email) email = data.user.email
  } catch (err) {
    console.error('Failed to look up user email:', err)
  }

  const name = [record.first_name, record.last_name].filter(Boolean).join(' ') || '(no name given)'
  const conference = record.conference || '(none given)'
  const notifyEmail = Deno.env.get('NOTIFY_EMAIL') || DEFAULT_NOTIFY_EMAIL

  const emailBody = {
    from: 'Officiate Better <onboarding@resend.dev>',
    to: [notifyEmail],
    subject: `New Officiate Better registration: ${name}`,
    text: [
      'A new user just registered for Officiate Better Rules Quiz.',
      '',
      `Name: ${name}`,
      `Email: ${email}`,
      `Officiating Conference: ${conference}`,
      `Signed up: ${record.created_at || new Date().toISOString()}`,
    ].join('\n'),
  }

  const resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailBody),
  })

  if (!resendResp.ok) {
    const errText = await resendResp.text()
    console.error('Resend API error:', resendResp.status, errText)
    return new Response('Failed to send notification email', { status: 502 })
  }

  return new Response('OK', { status: 200 })
})
