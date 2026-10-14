<script setup lang="ts">
import { computed } from 'vue'
import { count } from '../format'

const props = defineProps<{ page: number; size: number; total: number; noun: string }>()
defineEmits<{ go: [page: number] }>()
const pages = computed(() => Math.max(1, Math.ceil(props.total / props.size)))
const from = computed(() => (props.total ? props.page * props.size + 1 : 0))
const to = computed(() => Math.min(props.total, (props.page + 1) * props.size))
</script>

<template>
  <nav class="pager" :aria-label="`${noun} pages`">
    <span>{{ count(from) }}–{{ count(to) }} of {{ count(total) }} {{ noun }}</span>
    <span class="row">
      <button class="ghost" type="button" :disabled="page === 0" @click="$emit('go', page - 1)">Previous</button>
      <button class="ghost" type="button" :disabled="page + 1 >= pages" @click="$emit('go', page + 1)">Next</button>
    </span>
  </nav>
</template>
