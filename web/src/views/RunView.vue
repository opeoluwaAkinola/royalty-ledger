<script setup lang="ts">
import { ref, watch } from 'vue'
import { get } from '../api/client'
import type { Page, Run, StatementSummary } from '../api/types'
import Pager from '../components/Pager.vue'
import { cents, count, micros, periodLabel } from '../format'

const props = defineProps<{ period: string }>()
const run = ref<Run | null>(null)
const page = ref<Page<StatementSummary> | null>(null)
const error = ref<string | null>(null)

async function load(p = 0) {
  try {
    ;[run.value, page.value] = await Promise.all([
      get<Run>(`/statement-runs/${props.period}`),
      get<Page<StatementSummary>>(`/statement-runs/${props.period}/statements?page=${p}&size=10`),
    ])
  } catch (e) {
    error.value = (e as Error).message
  }
}
watch(() => props.period, () => load(), { immediate: true })
</script>

<template>
  <p class="crumb"><RouterLink to="/runs">Statement runs</RouterLink></p>
  <h1 tabindex="-1">{{ periodLabel(period) }} statements</h1>
  <div v-if="error" class="alert" role="alert">{{ error }}</div>
  <template v-if="run && page">
    <p class="subtitle">Generated {{ new Date(run.createdAt).toLocaleString() }}</p>
    <div class="tiles">
      <div class="tile"><div class="label">Paid out</div><div class="value">{{ cents(run.allocatedCents) }}</div><div class="note">Matches the gross to the cent</div></div>
      <div class="tile"><div class="label">Gross</div><div class="value">{{ micros(run.grossMicros) }}</div><div class="note">{{ count(run.matchedPlays) }} matched plays</div></div>
      <div class="tile"><div class="label">Sub-cent residual</div><div class="value">${{ (run.residualNanos / 1e10).toFixed(4) }}</div><div class="note">Too small to allocate, carried forward</div></div>
      <div class="tile"><div class="label">In suspense</div><div class="value">{{ micros(run.unmatchedMicros) }}</div><div class="note">{{ count(run.unmatchedPlays) }} plays without rights data</div></div>
    </div>
    <section class="panel">
      <h2>By rights holder</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th scope="col">Rights holder</th><th scope="col" class="hide-sm">Type</th><th scope="col" class="num">Plays</th><th scope="col" class="num">Amount</th></tr></thead>
          <tbody>
            <tr v-for="s in page.items" :key="s.id">
              <td><RouterLink :to="{ name: 'statement', params: { id: s.id } }">{{ s.holderName }}</RouterLink></td>
              <td class="hide-sm secondary">{{ s.holderType.charAt(0) + s.holderType.slice(1).toLowerCase() }}</td>
              <td class="num">{{ count(s.plays) }}</td>
              <td class="num"><strong>{{ cents(s.totalCents) }}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
      <Pager :page="page.page" :size="page.size" :total="page.total" noun="statements" @go="load" />
    </section>
  </template>
</template>
