<script setup lang="ts">
import { computed, ref } from 'vue'

/** Horizontal single-series bar chart: one hue, thin bars anchored at the baseline, hover tooltip, table view. */
const props = defineProps<{
  title: string
  rows: { key: string; label: string; value: number; detail?: string }[]
  format: (n: number) => string
}>()

const showTable = ref(false)
const hovered = ref<number | null>(null)
const BAR = 14
const GAP = 10
const LABEL_W = 132
const W = 560
const plotW = W - LABEL_W - 64

const dataMax = computed(() => Math.max(1, ...props.rows.map((r) => r.value)))
const step = computed(() => niceStep(dataMax.value / 4))
// The scale ends on a gridline at or above the largest bar.
const max = computed(() => Math.ceil(dataMax.value / step.value) * step.value)
const height = computed(() => props.rows.length * (BAR + GAP) + 24)
const ticks = computed(() => Array.from({ length: max.value / step.value + 1 }, (_, i) => i * step.value))
const x = (v: number) => (v / max.value) * plotW
const summary = computed(() => {
  const top = props.rows.slice(0, 3).map((r) => `${r.label} ${props.format(r.value)}`).join(', ')
  return `${props.title}. ${props.rows.length} bars. Highest: ${top}.`
})

function niceStep(raw: number) {
  const p = 10 ** Math.floor(Math.log10(raw || 1))
  const n = raw / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}
/** Rounded on the data end only, square at the baseline. */
function barPath(w: number, y: number) {
  const r = Math.min(4, w / 2, BAR / 2)
  return `M${LABEL_W},${y} h${w - r} a${r},${r} 0 0 1 ${r},${r} v${BAR - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(w - r)} z`
}
</script>

<template>
  <figure class="chart">
    <figcaption class="row spread">
      <h2 style="margin: 0">{{ title }}</h2>
      <button class="link" type="button" :aria-pressed="showTable" @click="showTable = !showTable">
        {{ showTable ? 'Show chart' : 'Show table' }}
      </button>
    </figcaption>

    <div v-if="!showTable" class="plot">
      <svg :viewBox="`0 0 ${W} ${height}`" role="img" :aria-label="summary" @mouseleave="hovered = null">
        <g aria-hidden="true">
          <line v-for="t in ticks" :key="t" :x1="LABEL_W + x(t)" :x2="LABEL_W + x(t)" y1="0" :y2="height - 20" class="grid" />
          <text v-for="t in ticks" :key="`l${t}`" :x="LABEL_W + x(t)" :y="height - 4" class="tick" text-anchor="middle">{{ format(t) }}</text>
        </g>
        <g v-for="(r, i) in rows" :key="r.key" @mouseenter="hovered = i">
          <!-- hit target taller than the bar -->
          <rect x="0" :y="i * (BAR + GAP)" :width="W" :height="BAR + GAP" fill="transparent" />
          <text :x="LABEL_W - 10" :y="i * (BAR + GAP) + BAR - 2" class="cat" text-anchor="end">{{ r.label }}</text>
          <path :d="barPath(Math.max(2, x(r.value)), i * (BAR + GAP) + GAP / 2 - 4)" class="bar" :class="{ dim: hovered !== null && hovered !== i }" />
          <text v-if="i === 0" :x="LABEL_W + x(r.value) + 6" :y="i * (BAR + GAP) + BAR - 2" class="val">{{ format(r.value) }}</text>
        </g>
      </svg>
      <div v-if="hovered !== null" class="tooltip" role="status" :style="{ top: `${(hovered * (BAR + GAP) / height) * 100}%` }">
        <strong>{{ rows[hovered].label }}</strong>
        <span>{{ format(rows[hovered].value) }}</span>
        <span v-if="rows[hovered].detail" class="muted">{{ rows[hovered].detail }}</span>
      </div>
    </div>

    <div v-else class="table-wrap">
      <table>
        <caption class="visually-hidden">{{ title }}</caption>
        <thead><tr><th scope="col">Name</th><th scope="col" class="num">Value</th><th v-if="rows.some((r) => r.detail)" scope="col" class="num">Detail</th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.key">
            <th scope="row" style="font-size: 14px; color: var(--text-primary); font-weight: 400">{{ r.label }}</th>
            <td class="num">{{ format(r.value) }}</td>
            <td v-if="rows.some((x) => x.detail)" class="num">{{ r.detail }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </figure>
</template>

<style scoped>
.chart { margin: 0; }
figcaption { margin-bottom: 12px; }
.plot { position: relative; }
svg { width: 100%; height: auto; display: block; overflow: visible; }
.grid { stroke: var(--grid); stroke-width: 1; }
.tick { font-size: 11px; fill: var(--text-muted); }
.cat { font-size: 12px; fill: var(--text-secondary); }
.val { font-size: 12px; fill: var(--text-primary); font-weight: 600; }
.bar { fill: var(--series-1); transition: opacity 0.12s; }
.bar.dim { opacity: 0.35; }
.tooltip { position: absolute; right: 0; transform: translateY(-4px); display: grid; gap: 2px; font-size: 13px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; box-shadow: 0 4px 16px rgb(0 0 0 / 0.12); pointer-events: none; min-width: 140px; }
</style>
