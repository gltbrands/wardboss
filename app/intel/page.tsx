'use client'
import { useState, useTransition, useEffect, useRef } from 'react'
import Link from 'next/link'
import { TOPICS, type TopicKey } from '@/lib/topics'
import type { IntelResult, TimelineEvent, ProximityAlert } from '@/app/api/intel/route'
import type { IntelSuggestion } from '@/app/api/intel-search/route'

const TYPE_ICON: Record<TimelineEvent['type'], string> = {
  contribution: '💰',
  activity:     '📋',
  gift:         '🎁',
  expenditure:  '💸',
  compensation: '📊',
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}
function fmtDate(d: string) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const SEV_COLOR = { critical: '#ef4444', high: '#f97316', medium: '#fbbf24' }

export default function IntelPage() {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<IntelResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'timeline' | 'proximity' | 'relationships'>('timeline')
  const [isPending, startTransition] = useTransition()
  const [suggestions, setSuggestions] = useState<IntelSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const q = params.get('q')
    if (q) { setQuery(q); runSearch(q) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounced typeahead - only when no result is showing
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2 || result) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }
    const timer = setTimeout(() => {
      fetch(`/api/intel-search?q=${encodeURIComponent(query.trim())}`)
        .then(r => r.json())
        .then((data: { suggestions: IntelSuggestion[] }) => {
          if (data.suggestions?.length) {
            setSuggestions(data.suggestions)
            setShowSuggestions(true)
          } else {
            setSuggestions([])
            setShowSuggestions(false)
          }
        })
        .catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  }, [query, result])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function runSearch(q: string) {
    if (!q.trim() || q.trim().length < 2) return
    setShowSuggestions(false)
    setSuggestions([])
    startTransition(() => {
      setError(null)
      setResult(null)
      fetch(`/api/intel?q=${encodeURIComponent(q.trim())}`)
        .then(r => r.json())
        .then((data: IntelResult | { error: string }) => {
          if ('error' in data) { setError(data.error); return }
          setResult(data)
          setTab('timeline')
        })
        .catch(() => setError('Failed to load. Try again.'))
    })
  }

  function clearSearch() {
    setQuery('')
    setResult(null)
    setError(null)
    setSuggestions([])
    setShowSuggestions(false)
  }

  const pbScore = result?.summary.powerBrokerScore ?? 0
  const pbColor = pbScore >= 70 ? '#ef4444' : pbScore >= 45 ? '#fbbf24' : 'var(--accent)'
  const pbLabel = pbScore >= 70 ? 'High Influence' : pbScore >= 45 ? 'Notable' : 'Registered'

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-black" style={{ color: 'var(--accent)' }}>🔍 Follow the Money</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          Enter any name: lobbyist, developer, client, firm, or alderman. Get the full money trail.
        </p>
      </div>

      {/* Search bar */}
      <div className="relative" ref={searchRef}>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); if (result) setResult(null) }}
            onKeyDown={e => {
              if (e.key === 'Enter') runSearch(query)
              if (e.key === 'Escape') setShowSuggestions(false)
            }}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder="Start typing a name to see matches..."
            className="flex-1 px-4 py-3 rounded-xl text-sm outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
          />
          {result && (
            <button
              onClick={clearSearch}
              className="px-4 py-3 rounded-xl text-sm font-medium shrink-0"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
            >
              ← Back
            </button>
          )}
          <button
            onClick={() => runSearch(query)}
            disabled={isPending}
            className="px-6 py-3 rounded-xl text-sm font-bold shrink-0"
            style={{ background: 'var(--accent)', color: '#000', opacity: isPending ? 0.7 : 1 }}
          >
            {isPending ? 'Searching…' : 'Investigate'}
          </button>
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div
            className="absolute left-0 right-0 mt-1 rounded-xl overflow-hidden z-50"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
          >
            {suggestions.map((s, i) => (
              <button
                key={i}
                onMouseDown={() => { setQuery(s.name); runSearch(s.name) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors"
                style={{ color: 'var(--foreground)', borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span
                  className="text-xs px-2 py-0.5 rounded-full shrink-0 font-medium"
                  style={{
                    background: s.type === 'lobbyist' ? 'rgba(0,174,239,0.12)' : 'rgba(167,139,250,0.12)',
                    color: s.type === 'lobbyist' ? 'var(--accent)' : 'var(--accent2)',
                  }}
                >
                  {s.type}
                </span>
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="card py-4 text-center" style={{ color: 'var(--danger)' }}>{error}</div>
      )}

      {isPending && (
        <div className="card flex items-center gap-3 py-8 justify-center">
          <div className="w-4 h-4 rounded-full border-2 animate-spin"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
          <span style={{ color: 'var(--muted)' }}>Pulling cross-dataset intelligence…</span>
        </div>
      )}

      {result && !isPending && (
        <>
          {/* Entity header */}
          <div className="card">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold uppercase"
                    style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--muted)' }}>
                    {result.entityType}
                  </span>
                  {result.summary.yearRange && (
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>{result.summary.yearRange}</span>
                  )}
                </div>
                <h2 className="text-xl font-black text-white">{result.entityName}</h2>
                {result.employerName && (
                  <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>{result.employerName}</p>
                )}
              </div>
              {result.lobbyistId && (
                <Link href={`/lobbyists/${result.lobbyistId}`}
                  className="text-xs px-3 py-2 rounded-lg shrink-0"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--foreground)' }}>
                  Full Lobbyist Profile →
                </Link>
              )}
            </div>

            {/* Power Broker + Fixer scores */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-xs font-bold" style={{ color: 'var(--muted)' }}>POWER BROKER SCORE</span>
                  <span className="text-xs font-black" style={{ color: pbColor }}>
                    {pbScore}/100 · {pbLabel}
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                  <div className="h-full rounded-full" style={{ width: `${pbScore}%`, background: pbColor }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-xs font-bold" style={{ color: 'var(--muted)' }}>FIXER INDEX</span>
                  <span className="text-xs font-black" style={{ color: '#a78bfa' }}>{result.summary.fixerIndex}/100</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                  <div className="h-full rounded-full" style={{ width: `${result.summary.fixerIndex}%`, background: '#a78bfa' }} />
                </div>
              </div>
            </div>

            {/* Financial summary row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              {[
                { label: 'Compensation', value: result.summary.totalCompensation, color: 'var(--success)' },
                { label: 'Contributions', value: result.summary.totalContributions, color: 'var(--warn)' },
                { label: 'Expenditures', value: result.summary.totalExpenditure, color: 'var(--danger)' },
                { label: 'Gifts', value: result.summary.totalGifts, color: 'var(--accent2)' },
              ].map(s => (
                <div key={s.label} className="rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>{s.label}</p>
                  <p className="text-base font-bold mt-0.5" style={{ color: s.value > 0 ? s.color : 'var(--muted)' }}>
                    {s.value > 0 ? fmt(s.value) : '-'}
                  </p>
                </div>
              ))}
            </div>

            {/* Sector pills */}
            {Object.keys(result.summary.sectorBreakdown).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {Object.entries(result.summary.sectorBreakdown)
                  .sort((a, b) => (b[1] as number) - (a[1] as number))
                  .slice(0, 6)
                  .map(([topic, count]) => {
                    const info = TOPICS[topic as TopicKey]
                    const total = result.summary.activityCount
                    const pct = Math.round((count as number) / total * 100)
                    return (
                      <div key={topic} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                        style={{ background: `${info.color}12`, border: `1px solid ${info.color}28` }}>
                        <span className="text-xs">{info.emoji}</span>
                        <span className="text-xs font-semibold" style={{ color: info.color }}>{info.label.split(' ')[0]}</span>
                        <span className="text-xs" style={{ color: info.color }}>{pct}%</span>
                      </div>
                    )
                  })}
              </div>
            )}

            {/* Proximity alert banner */}
            {result.proximityAlerts.length > 0 && (
              <div className="mt-4 px-3 py-2 rounded-lg flex items-center gap-2"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <span style={{ color: '#ef4444' }}>⏱</span>
                <span className="text-sm font-bold" style={{ color: '#ef4444' }}>
                  {result.proximityAlerts.filter(a => a.severity === 'critical').length} Critical
                </span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  proximity alerts - contributions followed by lobbying activity within 30 days
                </span>
                <button onClick={() => setTab('proximity')} className="ml-auto text-xs px-2 py-0.5 rounded"
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                  View →
                </button>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1">
            {(['timeline', 'proximity', 'relationships'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className="px-4 py-2 rounded-lg text-sm font-medium capitalize"
                style={{
                  background: tab === t ? 'rgba(0,174,239,0.12)' : 'var(--surface)',
                  color: tab === t ? 'var(--accent)' : 'var(--muted)',
                  border: `1px solid ${tab === t ? 'rgba(0,174,239,0.3)' : 'var(--border)'}`,
                }}>
                {t === 'proximity'
                  ? `⏱ Proximity (${result.proximityAlerts.length})`
                  : t === 'timeline'
                  ? `📅 Timeline (${result.timeline.length})`
                  : '🔗 Relationships'}
              </button>
            ))}
          </div>

          {/* Timeline tab */}
          {tab === 'timeline' && (
            <div className="space-y-2">
              {result.timeline.map(event => (
                <div key={event.id}
                  className="flex items-start gap-3 p-3 rounded-xl"
                  style={{
                    background: event.flagged ? 'rgba(239,68,68,0.05)' : 'var(--surface)',
                    border: `1px solid ${event.flagged ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
                  }}>
                  <span className="text-lg shrink-0 mt-0.5">{TYPE_ICON[event.type]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{event.description}</p>
                      <span className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>{fmtDate(event.date)}</span>
                    </div>
                    {event.amount && event.amount > 0 && (
                      <p className="text-sm font-bold mt-0.5" style={{ color: event.type === 'contribution' ? '#fbbf24' : 'var(--success)' }}>
                        {fmt(event.amount)}
                      </p>
                    )}
                    {event.department && <p className="text-xs mt-0.5" style={{ color: 'var(--accent)' }}>{event.department}</p>}
                    {event.clientName && event.type !== 'compensation' && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Client: {event.clientName}</p>
                    )}
                    {event.subtype && (
                      <span className={`badge badge-${event.subtype.toLowerCase()} mt-1`}>{event.subtype}</span>
                    )}
                    {event.flagged && event.proximityNote && (
                      <p className="text-xs mt-1 font-bold" style={{ color: '#ef4444' }}>
                        ⚠ {event.proximityNote}
                      </p>
                    )}
                    {event.entityRef && (
                      <Link href={event.entityRef} className="text-xs mt-1 inline-block hover:underline"
                        style={{ color: 'var(--accent)' }}>
                        View in dataset →
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Proximity tab */}
          {tab === 'proximity' && (
            <div className="space-y-3">
              {result.proximityAlerts.length === 0 && (
                <div className="card text-center py-8" style={{ color: 'var(--muted)' }}>
                  No proximity alerts for this entity.
                </div>
              )}
              {result.proximityAlerts.map((alert, i) => (
                <div key={i} className="card" style={{
                  background: `rgba(${alert.severity === 'critical' ? '239,68,68' : alert.severity === 'high' ? '249,115,22' : '251,191,36'},0.06)`,
                  border: `1px solid ${SEV_COLOR[alert.severity]}30`,
                }}>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold uppercase"
                      style={{ background: `${SEV_COLOR[alert.severity]}22`, color: SEV_COLOR[alert.severity] }}>
                      {alert.severity}
                    </span>
                    <span className="text-xs font-bold" style={{ color: SEV_COLOR[alert.severity] }}>
                      {alert.daysBetween}d window
                    </span>
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>{alert.note}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    <div className="px-3 py-2 rounded-lg"
                      style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.15)' }}>
                      <p className="font-bold mb-0.5" style={{ color: '#fbbf24' }}>💰 {fmtDate(alert.contribDate)}</p>
                      <p>${alert.contribAmount.toLocaleString()} → {alert.contribRecipient}</p>
                    </div>
                    <div className="px-3 py-2 rounded-lg"
                      style={{ background: 'rgba(0,174,239,0.06)', border: '1px solid rgba(0,174,239,0.15)' }}>
                      <p className="font-bold mb-0.5" style={{ color: 'var(--accent)' }}>📋 {fmtDate(alert.activityDate)}</p>
                      <p style={{ color: 'var(--foreground)' }}>{alert.activityDept}</p>
                      <p className="mt-0.5" style={{ color: 'var(--muted)' }}>{alert.activityClient}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Relationships tab */}
          {tab === 'relationships' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="card">
                <h3 className="font-bold mb-3">Top Political Recipients</h3>
                <div className="space-y-2">
                  {result.summary.topRecipients.map(r => (
                    <div key={r.name} className="flex items-center justify-between text-sm">
                      <Link href={`/contributions?q=${encodeURIComponent(r.name.split(',')[0] ?? r.name)}`}
                        className="truncate hover:underline" style={{ color: 'var(--foreground)' }}>
                        {r.name}
                      </Link>
                      <span className="shrink-0 ml-2 font-mono text-xs" style={{ color: '#fbbf24' }}>
                        {fmt(r.total)}
                      </span>
                    </div>
                  ))}
                  {result.summary.topRecipients.length === 0 && (
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>No contribution data</p>
                  )}
                </div>
              </div>

              <div className="card">
                <h3 className="font-bold mb-3">Clients ({result.summary.clients.length})</h3>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {result.summary.clients.slice(0, 20).map(c => (
                    <button key={c} onClick={() => { setQuery(c); runSearch(c) }}
                      className="text-sm block py-0.5 hover:underline truncate text-left w-full"
                      style={{ color: 'var(--foreground)' }}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="card">
                <h3 className="font-bold mb-3">Departments Lobbied ({result.summary.departments.length})</h3>
                <div className="flex flex-wrap gap-1">
                  {result.summary.departments.map(d => (
                    <Link key={d} href={`/departments?q=${encodeURIComponent(d)}`}>
                      <span className="text-xs px-2 py-1 rounded-full cursor-pointer"
                        style={{ background: 'rgba(167,139,250,0.1)', color: 'var(--accent2)', border: '1px solid rgba(167,139,250,0.2)' }}>
                        {d}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>

              {result.relatedClients.length > 0 && (
                <div className="card">
                  <h3 className="font-bold mb-3">Related Clients by Activity</h3>
                  <div className="space-y-1">
                    {result.relatedClients.map(c => (
                      <div key={c.id} className="flex items-center justify-between text-sm">
                        <button onClick={() => { setQuery(c.name); runSearch(c.name) }}
                          className="truncate hover:underline text-left"
                          style={{ color: 'var(--foreground)' }}>
                          {c.name}
                        </button>
                        <span className="shrink-0 ml-2 text-xs" style={{ color: 'var(--muted)' }}>
                          {c.count} actions
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!result && !isPending && !error && (
        <div className="card py-12 text-center space-y-3">
          <p className="text-4xl">🔍</p>
          <p className="font-bold text-lg">Enter any name to start investigating</p>
          <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--muted)' }}>
            Lobbyists, developers, clients, law firms, aldermen - any name that appears in Chicago Board of Ethics records will surface their full financial trail.
          </p>
          <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
            Start typing to see matching names from the dataset.
          </p>
        </div>
      )}
    </div>
  )
}
