<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="topbar">
    <RouterLink to="/" class="brand" aria-label="Royalty Ledger home">
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="var(--series-1)"/><rect x="7" y="16" width="4" height="9" rx="1.5" fill="#fff"/><rect x="14" y="11" width="4" height="14" rx="1.5" fill="#fff"/><rect x="21" y="7" width="4" height="18" rx="1.5" fill="#fff"/></svg>
      Royalty Ledger
    </RouterLink>
    <nav aria-label="Primary">
      <RouterLink to="/" exact-active-class="active">Overview</RouterLink>
      <RouterLink to="/runs" active-class="active">Statements</RouterLink>
      <RouterLink to="/holders" active-class="active">Rights holders</RouterLink>
    </nav>
  </header>
  <main id="main">
    <RouterView />
  </main>
</template>
