import { PATRON_CODIGO } from '../../../lib/invitaciones'
export const runtime = 'nodejs'

// Short invitation link for the QR. Opening it records nothing: it only keeps
// the public code in the address so the browser can remember who invited it.
// Link previews and bots therefore never count as visitors.
export async function GET(req, { params }) {
  const { codigo } = await params
  const destino = new URL('/expo', req.url)
  if (PATRON_CODIGO.test(codigo || '')) destino.searchParams.set('ref', codigo)
  return new Response(null, { status: 307, headers: { Location: destino.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
}
