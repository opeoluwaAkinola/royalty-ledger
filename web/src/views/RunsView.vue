<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { get } from '../api/client'
import type { Run } from '../api/types'
import { cents, count, periodLabel } from '../format'

const runs = ref<Run[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
onMounted(async () => {
  try {
    runs.value = await get<Run[]>('/statement-runs')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <h1 tabindex="-1">Statement runs</h1>
  <p class="subtitle">One run per period. Re-running a period returns the original run unchanged.</p>
  <p v-if="loading" class="muted" role="status">Loading…</p>
  <div v-if="error" class="alert" role="alert">{{ error }}</div>
  <div v-else-if="!loading && !runs.length" class="panel muted">No statement runs yet. Generate one from the <RouterLink to="/">overview</RouterLink>.</div>
  <div v-else class="panel table-wrap">
    <table>
      <thead><tr><th scope="col">Period</th><th scope="col" class="num">Plays</th><th scope="col" class="num">Paid out</th><th scope="col" class="num hide-sm">Rights holders</th><th scope="col" class="num hide-sm">In suspense</th></tr></thead>
      <tbody>
        <tr v-for="r in runs" :key="r.id">
          <td><RouterLink :to="{ name: 'run', params: { period: r.period } }">{{ periodLabel(r.period) }}</RouterLink></td>
          <td class="num">{{ count(r.totalPlays) }}</td>
          <td class="num">{{ cents(r.allocatedCents) }}</td>
          <td class="num hide-sm">{{ r.statementCount }}</td>
          <td class="num hide-sm">{{ count(r.unmatchedPlays) }} plays</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
