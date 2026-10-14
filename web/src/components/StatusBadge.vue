<script setup lang="ts">
import { computed } from 'vue'
import type { ReconciliationStatus } from '../api/types'

const props = defineProps<{ status: ReconciliationStatus }>()

// Status always ships with an icon and a label, never color alone.
const META: Record<ReconciliationStatus, { label: string; tone: string; icon: string }> = {
  MATCH: { label: 'Reconciled', tone: 'good', icon: 'M3 8.5l3 3 7-7' },
  LATE_PLAYS: { label: 'Late plays', tone: 'warning', icon: 'M8 4v5M8 12v.5' },
  PIPELINE_DRIFT: { label: 'Pipeline drift', tone: 'critical', icon: 'M4 4l8 8M12 4l-8 8' },
  NOT_RUN: { label: 'Not run yet', tone: 'neutral', icon: 'M8 4v4l3 2' },
}
const meta = computed(() => META[props.status])
</script>

<template>
  <span class="status" :class="meta.tone">
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path :d="meta.icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
    {{ meta.label }}
  </span>
</template>
