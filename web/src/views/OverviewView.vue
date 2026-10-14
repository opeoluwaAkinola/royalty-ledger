<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { get, post } from '../api/client'
import type { Reconciliation, Run, Summary } from '../api/types'
import BarChart from '../components/BarChart.vue'
import StatusBadge from '../components/StatusBadge.vue'
import TierSplit from '../components/TierSplit.vue'
import { compactCount, count, currentPeriod, micros, periodLabel, territoryName } from '../format'

const route = useRoute()
const router = useRouter()
const period = ref(typeof route.query.period === 'string' ? route.query.period : currentPeriod())
const summary = ref<Summary | null>(null)
const recon = ref<Reconciliation | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const running = ref(false)
const message = ref('')

async function load() {
  loading.value = true
  error.value = null
  try {
    ;[summary.value, recon.value] = await Promise.all([
      get<Summary>(`/periods/${period.value}/summary`),
      get<Reconciliation>(`/periods/${period.value}/reconciliation`),
    ])
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

watch(period, (p) => {
  router.replace({ query: { period: p } })
  load()
}, { immediate: true })

async function runStatements() {
  running.value = true
  message.value = ''
  try {
    const { status, body } = await post<Run>('/statement-runs', { period: period.value })
    message.value = status === 201
      ? `Statements generated: ${body.statementCount} rights holders, ${count(body.totalPlays)} plays.`
      : 'Statements for this period already exist. Showing the existing run.'
    await load()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    running.value = false
  }
}

const territoryRows = computed(() => (summary.value?.territories ?? []).map((t) => ({
  key: t.territory, label: territoryName(t.territory), value: t.plays, detail: `≈ ${micros(t.estimatedMicros)}`,
})))

const checks = computed(() => recon.value && [
  { label: 'Events accepted', value: recon.value.eventsAccepted },
  { label: 'Plays (running totals)', value: recon.value.playsInTotals },
  { label: 'Plays (aggregates)', value: recon.value.playsInAggregates },
  { label: 'Plays in statements', value: recon.value.playsInStatement },
])
</script>

<template>
  <div class="row spread" style="align-items: end; margin-bottom: 20px">
    <div>
      <h1 tabindex="-1">{{ periodLabel(period) }}</h1>
      <p class="subtitle" style="margin: 0">Live from the play pipeline. Estimates use the current rate card.</p>
    </div>
    <label>Period <input v-model="period" type="month" required /></label>
  </div>

  <p v-if="loading && !summary" class="muted" role="status">Loading…</p>
  <div v-if="error" class="alert" role="alert">{{ error }}</div>

  <template v-if="summary && recon">
    <div class="tiles">
      <div class="tile"><div class="label">Royalty-bearing plays</div><div class="value">{{ compactCount(summary.plays) }}</div><div class="note">{{ count(summary.plays) }} of {{ count(summary.streams) }} streams were 30s or longer</div></div>
      <div class="tile"><div class="label">Estimated gross</div><div class="value">{{ micros(summary.estimatedMicros) }}</div><div class="note">Before splits</div></div>
      <div class="tile"><div class="label">Territories</div><div class="value">{{ summary.territories.length }}</div><div class="note">with at least one play</div></div>
      <div class="tile"><div class="label">In suspense</div><div class="value">{{ compactCount(summary.unmatchedPlays) }}</div><div class="note">plays with no rights data</div></div>
    </div>

    <section class="panel stack" aria-labelledby="recon-h" style="margin-bottom: 16px">
      <div class="row spread">
        <div class="row">
          <h2 id="recon-h" style="margin: 0">Reconciliation</h2>
          <StatusBadge :status="recon.status" />
        </div>
        <div class="row">
          <RouterLink v-if="recon.playsInStatement !== null" :to="{ name: 'run', params: { period } }">View statements</RouterLink>
          <button v-else type="button" :disabled="running || summary.plays === 0" @click="runStatements">
            {{ running ? 'Running…' : 'Run statements' }}
          </button>
        </div>
      </div>
      <dl class="checks">
        <div v-for="c in checks" :key="c.label"><dt>{{ c.label }}</dt><dd>{{ c.value === null ? '—' : count(c.value) }}</dd></div>
      </dl>
      <ul class="findings"><li v-for="f in recon.findings" :key="f">{{ f }}</li></ul>
      <p class="visually-hidden" aria-live="polite">{{ message }}</p>
      <p v-if="message" class="secondary" style="margin: 0" aria-hidden="true">{{ message }}</p>
    </section>

    <div v-if="summary.plays > 0" class="grid-2">
      <section class="panel"><BarChart title="Plays by territory" :rows="territoryRows" :format="compactCount" /></section>
      <section class="panel stack">
        <TierSplit :plays-by-tier="summary.playsByTier" />
        <div>
          <h2>Top tracks</h2>
          <div class="table-wrap">
            <table>
              <thead><tr><th scope="col">Track</th><th scope="col" class="num">Plays</th><th scope="col" class="num hide-sm">Est. gross</th></tr></thead>
              <tbody>
                <tr v-for="t in summary.topTracks" :key="t.isrc">
                  <td>
                    <div>{{ t.title ?? 'Unknown track' }}</div>
                    <div class="muted" style="font-size: 12px">{{ t.artistName ?? 'No rights data' }} · {{ t.isrc }}</div>
                  </td>
                  <td class="num">{{ count(t.plays) }}</td>
                  <td class="num hide-sm">{{ micros(t.estimatedMicros) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
    <p v-else class="panel muted">No plays recorded for this period yet. Run the simulator to send some.</p>
  </template>
</template>

<style scoped>
.checks { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin: 0; }
.checks dt { font-size: 13px; color: var(--text-secondary); }
.checks dd { margin: 0; font-size: 20px; font-weight: 700; }
.findings { margin: 0; padding-left: 18px; color: var(--text-secondary); font-size: 14px; }
</style>
