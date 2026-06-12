import { NextRequest, NextResponse } from 'next/server'
import { sodaFetch } from '@/lib/chicago-api'
import type { LobbyistCombination } from '@/lib/types'

export const dynamic = 'force-dynamic'

function esc(s: string) { return s.replace(/'/g, "''").toUpperCase() }

export type IntelSuggestion = { name: string; type: 'lobbyist' | 'client' }

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (!q || q.length < 2) {
    return NextResponse.json({ suggestions: [] })
  }

  const Q = esc(q)

  const combos = await sodaFetch<LobbyistCombination>('combinations', {
    $where: `upper(lobbyist_first_name) like '%${Q}%' OR upper(lobbyist_last_name) like '%${Q}%' OR upper(client_name) like '%${Q}%'`,
    $limit: 200,
  })

  const lobbyistMap = new Map<string, true>()
  const clientMap = new Map<string, true>()

  for (const c of combos) {
    const fullname = `${c.lobbyist_first_name ?? ''} ${c.lobbyist_last_name ?? ''}`.trim()
    if (fullname.toUpperCase().includes(Q)) lobbyistMap.set(fullname, true)
    if ((c.client_name ?? '').toUpperCase().includes(Q)) clientMap.set(c.client_name, true)
  }

  const suggestions: IntelSuggestion[] = [
    ...[...lobbyistMap.keys()].sort().map(name => ({ name, type: 'lobbyist' as const })),
    ...[...clientMap.keys()].sort().map(name => ({ name, type: 'client' as const })),
  ]

  return NextResponse.json({ suggestions: suggestions.slice(0, 15) })
}
