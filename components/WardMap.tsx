'use client'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import L from 'leaflet'
import Link from 'next/link'
import { TOPICS, type TopicKey, type WardIntelResponse, type WardTopicData } from '@/lib/topics'

interface Ward {
  ward: number
  alderman: string
  alderman_raw: string
  address: string
  city: string
  state: string
  zipcode: string
  phone: string
  email: string
  website: string
  photo_link: string
  lat: number | null
  lng: number | null
  geom: GeoJSON.MultiPolygon | GeoJSON.Polygon
}

const CHICAGO_CENTER: L.LatLngExpression = [41.8375, -87.6866]
const DEFAULT_ZOOM = 11

const TOPIC_KEYS = Object.keys(TOPICS) as TopicKey[]

function wardBaseColor(ward: number) {
  if (ward <= 10) return '#0ea5e9'
  if (ward <= 20) return '#818cf8'
  if (ward <= 30) return '#34d399'
  if (ward <= 40) return '#f472b6'
  return '#fb923c'
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { r, g, b }
}

function formatDollars(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString()}`
}

export default function WardMap({ wards }: { wards: Ward[] }) {
  const mapRef = useRef<L.Map | null>(null)
  const layerRefs = useRef<Map<number, L.GeoJSON>>(new Map())
  const containerRef = useRef<HTMLDivElement>(null)

  const [selected, setSelected] = useState<number | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [activeTopic, setActiveTopic] = useState<TopicKey | null>(null)
  const [wardIntel, setWardIntel] = useState<WardIntelResponse | null>(null)
  const [intelLoading, setIntelLoading] = useState(false)
  const [contributions, setContributions] = useState<{ total: number } | null>(null)

  const selectedWard = useMemo(() => wards.find(w => w.ward === selected), [wards, selected])

  // Load ward intel once
  useEffect(() => {
    setIntelLoading(true)
    fetch('/api/ward-intel')
      .then(r => r.json())
      .then((data: WardIntelResponse) => setWardIntel(data))
      .catch(console.error)
      .finally(() => setIntelLoading(false))
  }, [])

  // Compute max intensity for current topic (for gradient normalization)
  const maxTopicTotal = useMemo(() => {
    if (!wardIntel || !activeTopic) return 1
    return Math.max(
      1,
      ...Object.values(wardIntel.wardTopics).map(wt => wt[activeTopic]?.total ?? 0)
    )
  }, [wardIntel, activeTopic])

  // Ward fill style based on mode
  const wardStyle = useCallback((ward: number, isSelected: boolean, isHovered: boolean) => {
    if (activeTopic && wardIntel) {
      const intensity = (wardIntel.wardTopics[ward]?.[activeTopic]?.total ?? 0) / maxTopicTotal
      const { r, g, b } = hexToRgb(TOPICS[activeTopic].color)
      return {
        fillColor: TOPICS[activeTopic].color,
        fillOpacity: intensity > 0 ? 0.08 + intensity * 0.72 : 0.04,
        color: isSelected
          ? '#ffffff'
          : intensity > 0.2
          ? `rgba(${r},${g},${b},0.8)`
          : 'rgba(255,255,255,0.12)',
        weight: isSelected ? 2.5 : intensity > 0.1 ? 1.5 : 0.8,
      }
    }
    return {
      fillColor: isSelected ? '#00AEEF' : wardBaseColor(ward),
      fillOpacity: isSelected ? 0.55 : isHovered ? 0.3 : 0.18,
      color: isSelected ? '#00AEEF' : 'rgba(255,255,255,0.25)',
      weight: isSelected ? 2.5 : 1,
    }
  }, [activeTopic, wardIntel, maxTopicTotal])

  function centroid(ward: Ward): L.LatLngExpression | null {
    try {
      const geom = ward.geom
      const coords = geom.type === 'MultiPolygon'
        ? (geom as GeoJSON.MultiPolygon).coordinates[0][0]
        : (geom as GeoJSON.Polygon).coordinates[0]
      if (!coords?.length) return null
      const lats = coords.map(c => c[1])
      const lngs = coords.map(c => c[0])
      return [
        lats.reduce((a, b) => a + b, 0) / lats.length,
        lngs.reduce((a, b) => a + b, 0) / lngs.length,
      ]
    } catch { return null }
  }

  // Init map once
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return
    const map = L.map(containerRef.current, {
      center: CHICAGO_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
    })
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // Rebuild ward layers when wards, selection, hover, or heatmap changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !wards.length) return
    layerRefs.current.forEach(l => map.removeLayer(l))
    layerRefs.current.clear()

    for (const ward of wards) {
      const isSelected = ward.ward === selected
      const isHovered = ward.ward === hovered
      const style = wardStyle(ward.ward, isSelected, isHovered)

      const topicData = activeTopic && wardIntel
        ? wardIntel.wardTopics[ward.ward]?.[activeTopic]
        : null
      const intensity = activeTopic && wardIntel
        ? ((wardIntel.wardTopics[ward.ward]?.[activeTopic]?.total ?? 0) / maxTopicTotal * 100).toFixed(0)
        : null

      const layer = L.geoJSON(ward.geom as GeoJSON.GeoJsonObject, { style })

      layer.on('click', () => setSelected(prev => prev === ward.ward ? null : ward.ward))
      layer.on('mouseover', () => setHovered(ward.ward))
      layer.on('mouseout', () => setHovered(null))

      const tooltipContent = topicData
        ? `<div style="background:#111827;border:1px solid #1e293b;border-radius:6px;padding:6px 10px;color:#e2e8f0;font-size:12px">
            <span style="font-weight:700">Ward ${ward.ward}</span> · ${ward.alderman}<br/>
            <span style="color:${TOPICS[activeTopic!].color}">${TOPICS[activeTopic!].label}</span>: ${formatDollars(topicData.total)} · ${topicData.count} activities
          </div>`
        : `<div style="background:#111827;border:1px solid #1e293b;border-radius:6px;padding:6px 10px;color:#e2e8f0;font-size:12px;font-weight:600">
            Ward ${ward.ward} · ${ward.alderman}
          </div>`

      layer.bindTooltip(tooltipContent, { sticky: true, opacity: 1, className: 'leaflet-tooltip-custom' })
      layer.addTo(map)
      layerRefs.current.set(ward.ward, layer)
    }
  }, [wards, selected, hovered, wardStyle, activeTopic, wardIntel, maxTopicTotal])

  // Fly to selected ward + load contributions
  useEffect(() => {
    if (!selected || !mapRef.current) return
    const ward = wards.find(w => w.ward === selected)
    if (!ward) return
    const c = centroid(ward)
    if (c) mapRef.current.flyTo(c, 13, { duration: 0.8 })
    const lastName = ward.alderman_raw.split(',')[0]?.trim()
    if (lastName) {
      fetch(`/api/contributions?recipient=${encodeURIComponent(lastName)}&limit=200`)
        .then(r => r.json())
        .then((data: Array<{ amount: number }>) => {
          const total = data.reduce((s, c) => s + parseFloat(String(c.amount ?? 0)), 0)
          if (total > 0) setContributions({ total })
        })
        .catch(() => {})
    }
  }, [selected, wards])

  const filtered = useMemo(() =>
    wards.filter(w =>
      !search ||
      w.alderman.toLowerCase().includes(search.toLowerCase()) ||
      String(w.ward).includes(search)
    ), [wards, search])

  // Sorted list for heatmap mode
  const heatmapSortedWards = useMemo(() => {
    if (!activeTopic || !wardIntel) return []
    return [...wards]
      .map(w => ({
        ...w,
        topicData: wardIntel.wardTopics[w.ward]?.[activeTopic] ?? null,
      }))
      .filter(w => w.topicData)
      .sort((a, b) => (b.topicData!.total) - (a.topicData!.total))
  }, [activeTopic, wardIntel, wards])

  const topicInfo = activeTopic ? TOPICS[activeTopic] : null
  const topicTotals = activeTopic && wardIntel ? wardIntel.topicTotals[activeTopic] : null

  // Insight sentence for the selected topic
  const insightText = useMemo(() => {
    if (!activeTopic || !topicTotals || !wardIntel) return null
    const topWards = topicTotals.topWards.slice(0, 3)
    if (!topWards.length) return null
    const topNames = topWards.map(w => {
      const ward = wards.find(x => x.ward === w)
      return ward ? `Ward ${w} (${ward.alderman.split(' ').pop()})` : `Ward ${w}`
    })
    const total = topicTotals.total
    const wardsWithActivity = Object.values(wardIntel.wardTopics)
      .filter(wt => (wt[activeTopic]?.total ?? 0) > 0).length
    return `${topNames.join(', ')} concentrate ${Math.round((wardIntel.wardTopics[topWards[0]]?.[activeTopic]?.total ?? 0) / total * 100)}% of ${topicInfo!.label.toLowerCase()} lobbying. Active in ${wardsWithActivity} of 50 wards.`
  }, [activeTopic, topicTotals, wardIntel, wards, topicInfo])

  const selectedTopicData: WardTopicData | null = useMemo(() => {
    if (!selected || !activeTopic || !wardIntel) return null
    return wardIntel.wardTopics[selected]?.[activeTopic] ?? null
  }, [selected, activeTopic, wardIntel])

  return (
    <div className="flex h-full" style={{ background: 'var(--background)' }}>

      {/* ── Left panel ── */}
      <div
        className="flex flex-col shrink-0 overflow-hidden"
        style={{ width: 300, borderRight: '1px solid var(--border)', background: 'var(--surface)' }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-black text-sm">
            <span style={{ color: 'var(--accent)' }}>50 Wards</span>
            <span className="text-white"> · Chicago</span>
            {intelLoading && <span className="ml-2 text-xs font-normal" style={{ color: 'var(--muted)' }}>loading intel…</span>}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Click ward to select · toggle heatmap by topic</p>
        </div>

        {/* ── Heatmap topic selector ── */}
        <div className="px-3 pt-2 pb-1 border-b" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs font-bold tracking-widest mb-1.5" style={{ color: 'var(--muted)' }}>LOBBYING HEATMAP</p>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setActiveTopic(null)}
              className="px-2 py-0.5 rounded text-xs font-semibold transition-all"
              style={{
                background: !activeTopic ? 'rgba(0,174,239,0.2)' : 'rgba(255,255,255,0.05)',
                color: !activeTopic ? 'var(--accent)' : 'var(--muted)',
                border: `1px solid ${!activeTopic ? 'var(--accent)' : 'transparent'}`,
              }}
            >
              Off
            </button>
            {TOPIC_KEYS.filter(k => k !== 'OTHER' && k !== 'ETHICS').map(topic => (
              <button
                key={topic}
                onClick={() => setActiveTopic(prev => prev === topic ? null : topic)}
                title={TOPICS[topic].label}
                className="px-2 py-0.5 rounded text-xs font-semibold transition-all"
                style={{
                  background: activeTopic === topic
                    ? `${TOPICS[topic].color}33`
                    : 'rgba(255,255,255,0.05)',
                  color: activeTopic === topic ? TOPICS[topic].color : 'var(--muted)',
                  border: `1px solid ${activeTopic === topic ? TOPICS[topic].color : 'transparent'}`,
                }}
              >
                {TOPICS[topic].emoji} {TOPICS[topic].label.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Topic insight block */}
        {activeTopic && topicInfo && (
          <div className="px-3 py-2 border-b text-xs" style={{ borderColor: 'var(--border)', background: `${topicInfo.color}0d` }}>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-base">{topicInfo.emoji}</span>
              <span className="font-bold" style={{ color: topicInfo.color }}>{topicInfo.label}</span>
            </div>
            <p style={{ color: 'var(--muted)' }}>
              <span className="font-semibold" style={{ color: 'var(--foreground)' }}>{topicInfo.commissioner}</span>
            </p>
            <p className="mt-0.5" style={{ color: 'var(--muted)' }}>{topicInfo.dept}</p>
            <p className="mt-1 leading-relaxed" style={{ color: 'var(--muted)' }}>{topicInfo.approves}</p>
            {topicTotals && (
              <div className="mt-1.5 flex gap-3">
                <span style={{ color: topicInfo.color }}>{formatDollars(topicTotals.total)}</span>
                <span style={{ color: 'var(--muted)' }}>· {topicTotals.count} actions</span>
              </div>
            )}
            {insightText && (
              <p className="mt-1.5 leading-relaxed italic" style={{ color: 'var(--muted)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '6px' }}>
                {insightText}
              </p>
            )}
          </div>
        )}

        {/* Search (shown when heatmap off) */}
        {!activeTopic && (
          <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <input
              type="search"
              placeholder="Search alderman or ward #…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
            />
          </div>
        )}

        {/* Ward list */}
        <div className="flex-1 overflow-y-auto">
          {activeTopic && wardIntel ? (
            // Heatmap mode: sorted by topic intensity
            heatmapSortedWards.map((ward, idx) => {
              const data = ward.topicData!
              const pct = maxTopicTotal > 0 ? data.total / maxTopicTotal : 0
              const color = topicInfo!.color
              return (
                <button
                  key={ward.ward}
                  onClick={() => setSelected(prev => prev === ward.ward ? null : ward.ward)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left border-b transition-all"
                  style={{
                    borderColor: 'var(--border)',
                    background: selected === ward.ward ? `${color}1a` : 'transparent',
                    borderLeft: selected === ward.ward ? `3px solid ${color}` : '3px solid transparent',
                  }}
                >
                  <div
                    className="shrink-0 w-6 h-6 rounded text-xs flex items-center justify-center font-black"
                    style={{ background: `${color}22`, color }}
                  >
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-semibold truncate" style={{ color: selected === ward.ward ? color : 'var(--foreground)' }}>
                        W{ward.ward} · {ward.alderman.split(' ').slice(-1)[0]}
                      </p>
                      <span className="text-xs shrink-0" style={{ color }}>{formatDollars(data.total)}</span>
                    </div>
                    {/* Intensity bar */}
                    <div className="mt-0.5 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                      <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: color, opacity: 0.7 }} />
                    </div>
                  </div>
                </button>
              )
            })
          ) : (
            // Normal mode: alderman list
            filtered.map(ward => (
              <button
                key={ward.ward}
                onClick={() => setSelected(prev => prev === ward.ward ? null : ward.ward)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all border-b"
                style={{
                  borderColor: 'var(--border)',
                  background: selected === ward.ward ? 'rgba(0,174,239,0.1)' : 'transparent',
                  borderLeft: selected === ward.ward ? '3px solid var(--accent)' : '3px solid transparent',
                }}
              >
                <div
                  className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black"
                  style={{
                    background: selected === ward.ward ? 'rgba(0,174,239,0.2)' : 'rgba(255,255,255,0.06)',
                    color: wardBaseColor(ward.ward),
                  }}
                >
                  {ward.ward}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: selected === ward.ward ? 'var(--accent)' : 'var(--foreground)' }}>
                    {ward.alderman}
                  </p>
                  <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>Ward {ward.ward}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Map + info panel ── */}
      <div className="flex-1 flex flex-col relative">

        {/* Heatmap intensity legend (floating, top-right) */}
        {activeTopic && topicInfo && (
          <div
            className="absolute top-3 right-3 z-[1000] px-3 py-2 rounded-lg text-xs"
            style={{ background: 'rgba(15,20,30,0.92)', border: `1px solid ${topicInfo.color}44`, backdropFilter: 'blur(8px)', minWidth: 180 }}
          >
            <p className="font-bold mb-1.5" style={{ color: topicInfo.color }}>{topicInfo.emoji} {topicInfo.label}</p>
            <div className="flex items-center gap-2 mb-1">
              <div className="h-2 flex-1 rounded-full" style={{ background: `linear-gradient(to right, ${topicInfo.color}18, ${topicInfo.color})` }} />
            </div>
            <div className="flex justify-between" style={{ color: 'var(--muted)' }}>
              <span>Low</span><span>High intensity</span>
            </div>
            {topicTotals?.topWards?.length ? (
              <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                <p style={{ color: 'var(--muted)' }}>Top wards:</p>
                <p className="mt-0.5 font-semibold" style={{ color: topicInfo.color }}>
                  {topicTotals.topWards.slice(0, 5).join(', ')}
                </p>
              </div>
            ) : null}
          </div>
        )}

        {/* Selected ward info panel */}
        {selectedWard && (
          <div
            className="absolute bottom-0 left-0 right-0 z-[1000] px-4 py-3"
            style={{ background: 'rgba(15,20,30,0.97)', borderTop: '1px solid var(--border)', backdropFilter: 'blur(8px)' }}
          >
            <div className="flex items-start gap-4 max-w-4xl">
              {selectedWard.photo_link && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedWard.photo_link}
                  alt={selectedWard.alderman}
                  className="w-14 h-14 rounded-xl object-cover shrink-0"
                  style={{ border: '2px solid var(--accent)' }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(0,174,239,0.15)', color: 'var(--accent)' }}>
                    Ward {selectedWard.ward}
                  </span>
                  <h3 className="font-black text-sm text-white">{selectedWard.alderman}</h3>
                  <button onClick={() => setSelected(null)} className="ml-auto text-xs px-2 py-0.5 rounded" style={{ color: 'var(--muted)' }}>✕</button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div>
                    <p style={{ color: 'var(--muted)' }}>Office</p>
                    <p className="mt-0.5">{selectedWard.address || '—'}</p>
                  </div>
                  <div>
                    <p style={{ color: 'var(--muted)' }}>Phone</p>
                    <p className="mt-0.5">{selectedWard.phone || '—'}</p>
                  </div>
                  <div>
                    <p style={{ color: 'var(--muted)' }}>Email</p>
                    <a href={`mailto:${selectedWard.email}`} className="mt-0.5 block truncate" style={{ color: 'var(--accent)' }}>
                      {selectedWard.email || '—'}
                    </a>
                  </div>
                  <div>
                    <p style={{ color: 'var(--muted)' }}>Links</p>
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {selectedWard.website && (
                        <a href={selectedWard.website} target="_blank" rel="noopener noreferrer"
                          className="px-2 py-0.5 rounded text-xs" style={{ background: 'rgba(0,174,239,0.1)', color: 'var(--accent)' }}>
                          Website
                        </a>
                      )}
                      <Link href={`/contributions?q=${encodeURIComponent(selectedWard.alderman_raw.split(',')[0] ?? '')}`}
                        className="px-2 py-0.5 rounded text-xs" style={{ background: 'rgba(251,191,36,0.1)', color: 'var(--warn)' }}>
                        Contributions
                      </Link>
                      <Link href={`/activity?department=city+council`}
                        className="px-2 py-0.5 rounded text-xs" style={{ background: 'rgba(167,139,250,0.1)', color: 'var(--accent2)' }}>
                        Activity
                      </Link>
                    </div>
                    {contributions && (
                      <p className="mt-0.5 text-xs" style={{ color: 'var(--warn)' }}>
                        💰 ~{formatDollars(contributions.total)} in lobbyist contributions
                      </p>
                    )}
                  </div>
                </div>

                {/* Topic data for selected ward when heatmap is active */}
                {selectedTopicData && topicInfo && (
                  <div
                    className="mt-2 pt-2 text-xs"
                    style={{ borderTop: `1px solid ${topicInfo.color}33` }}
                  >
                    <div className="flex items-center gap-4 flex-wrap">
                      <span className="font-bold" style={{ color: topicInfo.color }}>
                        {topicInfo.emoji} {topicInfo.label} in Ward {selected}
                      </span>
                      <span style={{ color: 'var(--foreground)' }}>{formatDollars(selectedTopicData.total)} contributions</span>
                      <span style={{ color: 'var(--muted)' }}>{selectedTopicData.count} lobbying actions</span>
                    </div>
                    {selectedTopicData.topLobbyists.length > 0 && (
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <span style={{ color: 'var(--muted)' }}>Top lobbyists:</span>
                        {selectedTopicData.topLobbyists.map(name => (
                          <span key={name} className="px-1.5 py-0.5 rounded text-xs" style={{ background: `${topicInfo.color}1a`, color: topicInfo.color }}>
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                    {selectedTopicData.topClients.length > 0 && (
                      <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span style={{ color: 'var(--muted)' }}>Clients:</span>
                        {selectedTopicData.topClients.slice(0, 3).map(name => (
                          <span key={name} className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--foreground)' }}>
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="mt-1" style={{ color: 'var(--muted)' }}>
                      Approving authority: <span style={{ color: 'var(--foreground)' }}>{topicInfo.commissioner}</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Map */}
        <div ref={containerRef} className="flex-1" style={{ minHeight: 400 }} />
      </div>
    </div>
  )
}
