<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { get } from '../api/client'
import type { RightsHolder, StatementSummary } from '../api/types'
import { cents, count, periodLabel } from '../format'

const holders = ref<RightsHolder[]>([])
const selected = ref<number | null>(null)
const history = ref<StatementSummary[]>([])
const type = ref('')
const error = ref<string | null>(null)

const visible = computed(() => holders.value.filter((h) => !type.value || h.type === type.value))

onMounted(async () => {
  try {
    holders.value = await get<RightsHolder[]>('/rights-holders')
  } catch (e) {
    error.value = (e as Error).message
  }
})

async function select(h: RightsHolder) {
  selected.value = h.id
  history.value = await get<StatementSummary[]>(`/rights-holders/${h.id}/statements`)
}
</script>

<template>
  <h1 tabindex="-1">Rights holders</h1>
  <p class="subtitle">Artists, labels and publishers with a share in the catalog.</p>
  <div v-if="error" class="alert" role="alert">{{ error }}</div>
  <div class="grid-2">
    <section class="panel">
      <div class="row spread" style="margin-bottom: 8px">
        <h2 style="margin: 0">Directory</h2>
        <label>Type
          <select v-model="type"><option value="">All</option><option value="ARTIST">Artists</option><option value="LABEL">Labels</option><option value="PUBLISHER">Publishers</option></select>
        </label>
      </div>
      <ul class="holders">
        <li v-for="h in visible" :key="h.id">
          <button type="button" class="link" :aria-pressed="selected === h.id" @click="select(h)">{{ h.name }}</button>
          <span class="muted">{{ h.type.charAt(0) + h.type.slice(1).toLowerCase() }}</span>
        </li>
      </ul>
    </section>
    <section class="panel" aria-live="polite">
      <h2>Statement history</h2>
      <p v-if="selected === null" class="muted">Choose a rights holder to see their statements.</p>
      <p v-else-if="!history.length" class="muted">No statements yet.</p>
      <table v-else>
        <thead><tr><th scope="col">Period</th><th scope="col" class="num">Plays</th><th scope="col" class="num">Amount</th></tr></thead>
        <tbody>
          <tr v-for="s in history" :key="s.id">
            <td><RouterLink :to="{ name: 'statement', params: { id: s.id } }">{{ periodLabel(s.period) }}</RouterLink></td>
            <td class="num">{{ count(s.plays) }}</td>
            <td class="num">{{ cents(s.totalCents) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.holders { list-style: none; padding: 0; margin: 0; }
.holders li { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--grid); padding: 4px 0; font-size: 14px; }
.holders button[aria-pressed='true'] { font-weight: 700; }
</style>
