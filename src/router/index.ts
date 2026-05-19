import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
      meta: {
        title: 'Astra Persona | AI Identity Studio',
      },
    },
    {
      path: '/history',
      name: 'history',
      component: () => import('@/views/HistoryView.vue'),
      meta: {
        title: '资产库 | Astra Persona',
      },
    },
  ],
})

router.afterEach((to) => {
  document.title = String(to.meta.title ?? 'Astra Persona')
})
