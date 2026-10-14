<script setup lang="ts">
import { ref, watch } from 'vue'
import { get } from '../api/client'
import type { Line, Page, StatementSummary } from '../api/types'
import Pager from '../components/Pager.vue'
import { cents, count, microsPrecise, percent, periodLabel, territoryName, tierLabel } from '../format'

const props = defineProps<{ id: string }>()
const statement = ref<StatementSummary | null>(null)
const lines = ref<Page<Line> | null>(null)
const error = ref<string | null>(null)

async function loadLines(p = 0) {
  lines.value = await get<Page<Line>>(`/statements/${props.id}/lines?page=${p}&size=25`)
}
watch(() => props.id, async (id) => {
  try {
    statement.value = await get<StatementSummary>(`/statements/${id}`)
    await loadLines()
  } catch (e) {
    error.value = (e as Error).message
  }
}, { immediate: true })
</script>

<template>
  <div v-if="error" class="alert" role="alert">{{ error }}</div>
  <template v-if="statement">
    <p class="crumb"><RouterLink :to="{ name: 'run', params: { period: statement.period } }">{{ periodLabel(statement.period) }} statements</RouterLink></p>
    <div class="row spread">
      <div>
        <h1 tabindex="-1">{{ statement.holderName }}</h1>
        <p class="subtitle">{{ periodLabel(statement.period) }} · {{ count(statement.plays) }} plays</p>
      </div>
      <div class="tile" style="min-width: 200px"><div class="label">Amount due</div><div class="value">{{ cents(statement.totalCents) }}</div></div>
    </div>
    <section v-if="lines" class="panel">
      <h2>Line items</h2>
      <p class="muted" style="margin-top: -6px; font-size: 14px">Each line is plays × per-play rate × this holder's share. Exact to 1/10,000 of a cent.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th scope="col">Track</th><th scope="col">Territory</th><th scope="col" class="hide-sm">Tier</th><th scope="col" class="num">Plays</th><th scope="col" class="num hide-sm">Rate</th><th scope="col" class="num">Share</th><th scope="col" class="num">Amount</th></tr></thead>
          <tbody>
            <tr v-for="(l, i) in lines.items" :key="i">
              <td>{{ l.title ?? l.isrc }}</td>
              <td>{{ territoryName(l.territory) }}</td>
              <td class="hide-sm">{{ tierLabel(l.tier) }}</td>
              <td class="num">{{ count(l.plays) }}</td>
              <td class="num hide-sm">{{ microsPrecise(l.rateMicros) }}</td>
              <td class="num">{{ percent(l.shareBps) }}</td>
              <td class="num">{{ microsPrecise(l.amountMicros) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <Pager :page="lines.page" :size="lines.size" :total="lines.total" noun="lines" @go="loadLines" />
    </section>
  </template>
</template>
