import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'overview', component: () => import('./views/OverviewView.vue'), meta: { title: 'Overview' } },
  { path: '/runs', name: 'runs', component: () => import('./views/RunsView.vue'), meta: { title: 'Statement runs' } },
  { path: '/runs/:period', name: 'run', component: () => import('./views/RunView.vue'), props: true, meta: { title: 'Statement run' } },
  { path: '/statements/:id', name: 'statement', component: () => import('./views/StatementView.vue'), props: true, meta: { title: 'Statement' } },
  { path: '/holders', name: 'holders', component: () => import('./views/HoldersView.vue'), meta: { title: 'Rights holders' } },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('./views/NotFoundView.vue'), meta: { title: 'Not found' } },
]

export const router = createRouter({ history: createWebHistory(), routes })

router.afterEach((to) => {
  document.title = `${to.meta.title ?? 'Royalty Ledger'} · Royalty Ledger`
  requestAnimationFrame(() => document.querySelector<HTMLElement>('main h1')?.focus())
})
