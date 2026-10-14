import { describe, expect, it } from 'vitest'
import { cents, currentPeriod, micros, microsPrecise, percent, periodLabel, territoryName } from '../format'

describe('format', () => {
  it('formats money from integer units', () => {
    expect(cents(10408)).toBe('$104.08')
    expect(micros(104_082_350)).toBe('$104.08')
    expect(microsPrecise(4500)).toBe('$0.0045')
  })
  it('formats shares, periods and territories', () => {
    expect(percent(3500)).toBe('35%')
    expect(percent(1250)).toBe('12.50%')
    expect(periodLabel('2026-10')).toBe('October 2026')
    expect(currentPeriod(new Date('2026-10-14T12:00:00Z'))).toBe('2026-10')
    expect(territoryName('GB')).toBe('United Kingdom')
  })
})
