<script setup lang="ts">
import { History as HistoryIcon, Moon, Sun } from '@lucide/vue'
import { NBadge, NButton, NTooltip } from 'naive-ui'
import { storeToRefs } from 'pinia'

import BrandLogo from '@/components/brand/BrandLogo.vue'
import HistoryDrawer from '@/components/persona/HistoryDrawer.vue'
import { usePersonaStore } from '@/stores/persona'
import { useThemeStore } from '@/stores/theme'

const personaStore = usePersonaStore()
const themeStore = useThemeStore()
const { isDark } = storeToRefs(themeStore)
const { brands } = storeToRefs(personaStore)
</script>

<template>
  <div class="h-dvh overflow-hidden bg-background text-foreground">
    <div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div class="absolute inset-0 bg-[linear-gradient(115deg,rgba(20,184,166,0.14),transparent_28%,rgba(129,140,248,0.1)_54%,transparent_78%),linear-gradient(180deg,rgba(2,6,23,0.12),rgba(2,6,23,0.76))]" />
      <div class="sci-grid absolute inset-0 opacity-45" />
    </div>

    <div class="relative z-20 mx-auto flex h-full max-w-[1800px] flex-col px-3 sm:px-4">
      <header class="flex h-14 shrink-0 items-center justify-between gap-3">
        <RouterLink to="/" class="rounded-md outline-none transition hover:opacity-85 focus-visible:ring-2 focus-visible:ring-primary/40" aria-label="星格 AI 个人品牌生成器">
          <BrandLogo />
        </RouterLink>

        <nav class="flex items-center gap-2">
          <NBadge :value="brands.length" :max="99" :show="brands.length > 0" :offset="[-4, 5]">
            <NButton circle quaternary class="sm:hidden" aria-label="历史记录" @click="personaStore.toggleHistory">
              <HistoryIcon class="size-4" />
            </NButton>
            <NButton class="hidden sm:inline-flex" quaternary @click="personaStore.toggleHistory">
              <template #icon><HistoryIcon class="size-4" /></template>
              最近生成
            </NButton>
          </NBadge>
          <NTooltip trigger="hover">
            <template #trigger>
              <NButton circle quaternary size="large" :aria-label="isDark ? '切换浅色模式' : '切换深色模式'" @click="themeStore.toggleTheme">
                <Sun v-if="isDark" class="size-4" />
                <Moon v-else class="size-4" />
              </NButton>
            </template>
            {{ isDark ? '切换浅色模式' : '切换深色模式' }}
          </NTooltip>
        </nav>
      </header>

      <main class="min-h-0 flex-1 overflow-hidden pb-3 lg:pb-4">
        <slot />
      </main>
    </div>

    <HistoryDrawer />
  </div>
</template>
