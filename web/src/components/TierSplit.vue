<script setup lang="ts">
import { computed } from 'vue'
import { count, tierLabel } from '../format'

/** Part-to-whole for two categories: one 100% bar, 2px surface gap between segments, direct labels. */
const props = defineProps<{ playsByTier: Record<string, number> }>()

const ORDER = ['premium', 'ad_supported']
const total = computed(() => ORDER.reduce((n, t) => n + (props.playsByTier[t] ?? 0), 0))
const segments = computed(() => ORDER.map((tier, i) => {
  const plays = props.playsByTier[tier] ?? 0
  return { tier, plays, share: total.value ? plays / total.value : 0, color: `var(--series-${i + 1})` }
}))
</script>

<template>
  <figure class="tier">
    <figcaption><h2>Plays by tier</h2></figcaption>
    <div class="bar" role="img" :aria-label="segments.map((s) => `${tierLabel(s.tier)} ${Math.round(s.share * 100)}%`).join(', ')">
      <span v-for="s in segments" :key="s.tier" :style="{ flexGrow: s.share, background: s.color }" :title="`${tierLabel(s.tier)}: ${count(s.plays)} plays`" />
    </div>
    <ul class="legend">
      <li v-for="s in segments" :key="s.tier">
        <span class="swatch" :style="{ background: s.color }" aria-hidden="true" />
        <span>{{ tierLabel(s.tier) }}</span>
        <strong>{{ Math.round(s.share * 100) }}%</strong>
        <span class="muted">{{ count(s.plays) }} plays</span>
      </li>
    </ul>
  </figure>
</template>

<style scoped>
.tier { margin: 0; }
.bar { display: flex; gap: 2px; height: 16px; border-radius: 4px; overflow: hidden; background: var(--surface-1); }
.bar span { min-width: 2px; }
.legend { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 6px; font-size: 14px; }
.legend li { display: flex; align-items: center; gap: 8px; }
.swatch { width: 10px; height: 10px; border-radius: 3px; flex: none; }
</style>
