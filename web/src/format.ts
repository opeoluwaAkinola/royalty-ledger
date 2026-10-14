const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const usdPrecise = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 4 })
const num = new Intl.NumberFormat('en-US')
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const regions = new Intl.DisplayNames(['en'], { type: 'region' })

export const cents = (c: number) => usd.format(c / 100)
export const micros = (m: number) => usd.format(m / 1_000_000)
export const microsPrecise = (m: number) => usdPrecise.format(m / 1_000_000)
export const count = (n: number) => num.format(n)
export const compactCount = (n: number) => compact.format(n)
export const percent = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 2 : 0)}%`
export const territoryName = (code: string) => {
  try {
    return regions.of(code) ?? code
  } catch {
    return code
  }
}
export const tierLabel = (tier: string) => (tier === 'ad_supported' ? 'Ad-supported' : 'Premium')

export const periodLabel = (period: string) =>
  new Date(`${period}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export const currentPeriod = (now = new Date()) => now.toISOString().slice(0, 7)
