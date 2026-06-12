'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import type { Permit } from '@/app/api/permits/route'

type PermitData = { permits: Permit[]; total: number; page: number; limit: number }

const PERMIT_TYPES = [
  'PERMIT - NEW CONSTRUCTION',
  'PERMIT - RENOVATION/ALTERATION',
  'PERMIT - DEMOLITION',
  'PERMIT - ELECTRIC WIRING',
  'PERMIT - EASY PERMIT PROCESS',
  'PERMIT - REINSTATE CONDEMNED BUILDING',
]

function fmt(n: string | number) {
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (!num || isNaN(num)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num)
}
function fmtDate(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function address(p: Permit) {
  return [p.street_number, p.street_direction, p.street_name].filter(Boolean).join(' ')
}
function shortType(t: string) {
  return t.replace(/^PERMIT - /, '')
}

export default function PermitsPage() {
  const [q, setQ] = useState('')
  const [ward, setWard] = useState('')
  const [type, setType] = useState('')
  const [year, setYear] = useState('2025')
  const [page, setPage] = useState(0)
  const [data, setData] = useState<PermitData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  function load(overridePage = page) {
    setLoading(true)
    setError(false)
    const params = new URLSearchParams({
      page: String(overridePage),
      ...(q ? { q } : {}),
      ...(ward ? { ward } : {}),
      ...(type ? { type } : {}),
      ...(year ? { year } : {}),
    })
    fetch(`/api/permits?${params}`)
      .then(r => r.json())
      .then((d: PermitData) => { setData(d); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => { setPage(0); load(0) }, 400)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, ward, type, year])

  useEffect(() => { load() }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-black">🔨 Building Permits</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          Chicago DOB permit data — cross-reference applicants with lobbyist clients on the Ward Map.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search applicant, address, description…"
          className="flex-1 min-w-48 px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
        />
        <input
          type="text"
          value={ward}
          onChange={e => setWard(e.target.value)}
          placeholder="Ward #"
          className="w-24 px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
        />
        <select
          value={type}
          onChange={e => setType(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--foreground)' }}>
          <option value="">All Types</option>
          {PERMIT_TYPES.map(t => <option key={t} value={t}>{shortType(t)}</option>)}
        </select>
        <div className="flex gap-1">
          {['2025', '2024', '2023', '2022'].map(y => (
            <button key={y} onClick={() => setYear(y)}
              className="px-3 py-2 rounded-lg text-sm font-medium"
              style={{
                background: year === y ? 'rgba(0,174,239,0.15)' : 'var(--surface)',
                color: year === y ? 'var(--accent)' : 'var(--muted)',
                border: '1px solid var(--border)',
              }}>
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      {data && !loading && (
        <div className="flex items-center justify-between text-xs" style={{ color: 'var(--muted)' }}>
          <span>{data.total.toLocaleString()} permits found</span>
          {totalPages > 1 && (
            <span>Page {page + 1} of {totalPages}</span>
          )}
        </div>
      )}

      {loading && (
        <div className="card flex items-center gap-3 py-8 justify-center">
          <div className="w-4 h-4 rounded-full border-2 animate-spin"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
          <span style={{ color: 'var(--muted)' }}>Loading permits…</span>
        </div>
      )}

      {error && (
        <div className="card py-8 text-center" style={{ color: 'var(--danger)' }}>
          Failed to load permit data.
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div className="space-y-2">
            {data.permits.map(p => (
              <div key={p.id ?? p.permit_} className="card">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {p.permit_type && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                          style={{ background: 'rgba(0,174,239,0.1)', color: 'var(--accent)', border: '1px solid rgba(0,174,239,0.2)' }}>
                          {shortType(p.permit_type)}
                        </span>
                      )}
                      {p.ward && (
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(167,139,250,0.1)', color: 'var(--accent2)', border: '1px solid rgba(167,139,250,0.2)' }}>
                          Ward {p.ward}
                        </span>
                      )}
                      {p.zoning_district && (
                        <span className="text-xs" style={{ color: 'var(--muted)' }}>{p.zoning_district}</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold">{address(p) || '—'}</p>
                    {p.work_description && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                        {p.work_description.slice(0, 180)}{p.work_description.length > 180 ? '…' : ''}
                      </p>
                    )}
                    {p.contact_1_name && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs" style={{ color: 'var(--muted)' }}>Applicant:</span>
                        <Link
                          href={`/intel?q=${encodeURIComponent(p.contact_1_name)}`}
                          className="text-xs font-medium hover:underline"
                          style={{ color: 'var(--accent)' }}>
                          {p.contact_1_name}
                        </Link>
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="text-sm font-bold" style={{ color: 'var(--success)' }}>
                      {fmt(p.reported_cost)}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      Issued: {fmtDate(p.issue_date)}
                    </p>
                    {p.permit_ && (
                      <p className="text-xs font-mono" style={{ color: 'var(--muted)' }}>#{p.permit_}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {data.permits.length === 0 && (
              <div className="card text-center py-10" style={{ color: 'var(--muted)' }}>
                No permits match the selected filters.
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: page === 0 ? 'var(--muted)' : 'var(--foreground)', opacity: page === 0 ? 0.5 : 1 }}>
                ← Prev
              </button>
              <span className="px-4 py-2 text-sm" style={{ color: 'var(--muted)' }}>
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: page >= totalPages - 1 ? 'var(--muted)' : 'var(--foreground)', opacity: page >= totalPages - 1 ? 0.5 : 1 }}>
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
