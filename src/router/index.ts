import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
      meta: {
        title: '星格身份 | Astra Persona',
      },
    },
    {
      path: '/history',
      name: 'history',
      component: () => import('@/views/HistoryView.vue'),
      meta: {
        title: '历史记录 | 星格身份',
      },
    },
  ],
})

router.afterEach((to) => {
  document.title = String(to.meta.title ?? '星格身份 | Astra Persona')
})
