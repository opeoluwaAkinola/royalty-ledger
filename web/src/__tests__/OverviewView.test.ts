import { flushPromises, mount } from '@vue/test-utils'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { routes } from '../router'
import OverviewView from '../views/OverviewView.vue'

const summary = {
  period: '2026-10', streams: 1200, plays: 1000, estimatedMicros: 3_210_000, unmatchedPlays: 12,
  playsByTier: { premium: 620, ad_supported: 380 },
  territories: [{ territory: 'US', plays: 600, estimatedMicros: 2_000_000 }, { territory: 'GB', plays: 400, estimatedMicros: 1_210_000 }],
  topTracks: [{ isrc: 'USRL12600001', title: 'Midnight Hearts', artistName: 'Nova Reyes', plays: 300, estimatedMicros: 900_000 }],
}
let recon: Record<string, unknown>

beforeEach(() => {
  recon = { period: '2026-10', status: 'NOT_RUN', eventsAccepted: 1200, playsInTotals: 1000, playsInAggregates: 1000, playsInStatement: null, findings: ['No statement run yet for 2026-10.'] }
  document.body.innerHTML = ''
  document.documentElement.lang = 'en'
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      recon = { ...recon, status: 'MATCH', playsInStatement: 1000, findings: ['Every accepted play is accounted for in the statement run.'] }
      return new Response(JSON.stringify({ id: 1, period: '2026-10', statementCount: 14, totalPlays: 1000 }), { status: 201 })
    }
    const body = url.includes('reconciliation') ? recon : summary
    return new Response(JSON.stringify(body), { status: 200 })
  }) as typeof fetch
})

async function mountView() {
  const router = createRouter({ history: createMemoryHistory(), routes })
  router.push('/?period=2026-10')
  await router.isReady()
  const w = mount(OverviewView, { attachTo: document.body.appendChild(document.createElement('main')), global: { plugins: [router] } })
  await flushPromises()
  return w
}

describe('OverviewView', () => {
  it('shows headline numbers and a labelled reconciliation status', async () => {
    const w = await mountView()
    expect(w.find('h1').text()).toBe('October 2026')
    expect(w.text()).toContain('$3.21')
    expect(w.find('.status').text()).toBe('Not run yet')
  })

  it('runs statements and shows the reconciled state', async () => {
    const w = await mountView()
    await w.find('button:not(.link)').trigger('click')
    await flushPromises()
    expect(w.find('.status').text()).toBe('Reconciled')
    expect(w.text()).toContain('Statements generated: 14 rights holders')
  })

  it('offers the chart data as a table', async () => {
    const w = await mountView()
    await w.findAll('button.link').find((b) => b.text() === 'Show table')!.trigger('click')
    expect(w.find('table caption').text()).toBe('Plays by territory')
    expect(w.text()).toContain('United Kingdom')
  })

  it('has no detectable accessibility violations', async () => {
    await mountView()
    const results = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})
