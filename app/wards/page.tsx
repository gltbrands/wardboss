export const revalidate = 3600
import WardMapLoader from '@/components/WardMapLoader'

interface RawBoundary {
  ward: string
  the_geom: GeoJSON.MultiPolygon | GeoJSON.Polygon
}

interface RawOffice {
  ward: string
  alderman: string
  address?: string
  city?: string
  state?: string
  zipcode?: string
  ward_phone?: string
  email?: string
  website?: string
  photo_link?: string
  latitude?: string
  longitude?: string
}

async function getWards() {
  const base = 'https://data.cityofchicago.org/resource'
  const headers = { Accept: 'application/json' }

  try {
    const [rawBoundaries, rawOffices] = await Promise.all([
      fetch(`${base}/p293-wvbd.json?$limit=55`, { next: { revalidate: 86400 }, headers }).then(r => r.json()),
      fetch(`${base}/htai-wnw4.json?$limit=55&$order=ward%20ASC`, { next: { revalidate: 3600 }, headers }).then(r => r.json()),
    ])

    const boundaries: RawBoundary[] = Array.isArray(rawBoundaries) ? rawBoundaries : []
    const offices: RawOffice[] = Array.isArray(rawOffices) ? rawOffices : []

    const officeMap = new Map<number, RawOffice>()
    for (const o of offices) officeMap.set(parseInt(o.ward, 10), o)

    return boundaries
      .filter(b => b.the_geom)
      .map(b => {
        const wardNum = parseInt(b.ward, 10)
        const office = officeMap.get(wardNum)

        // "Last, First" → "First Last"
        let alderman = office?.alderman ?? `Ward ${wardNum}`
        const commaIdx = alderman.indexOf(',')
        if (commaIdx > -1) {
          const last = alderman.slice(0, commaIdx).trim()
          const first = alderman.slice(commaIdx + 1).trim()
          alderman = `${first} ${last}`
        }

        return {
          ward: wardNum,
          alderman,
          alderman_raw: office?.alderman ?? '',
          address: office?.address ?? '',
          city: office?.city ?? 'Chicago',
          state: office?.state ?? 'IL',
          zipcode: office?.zipcode ?? '',
          phone: office?.ward_phone ?? '',
          email: office?.email ?? '',
          website: office?.website ?? '',
          photo_link: office?.photo_link ?? '',
          lat: office?.latitude ? parseFloat(office.latitude) : null,
          lng: office?.longitude ? parseFloat(office.longitude) : null,
          geom: b.the_geom,
        }
      })
      .sort((a, b) => a.ward - b.ward)
  } catch (e) {
    console.error('Ward fetch error:', e)
    return []
  }
}

export default async function WardsPage() {
  const wards = await getWards()

  return (
    <div className="-m-6 lg:-m-8 flex flex-col" style={{ height: 'calc(100vh - 0px)' }}>
      <WardMapLoader wards={wards} />
    </div>
  )
}
