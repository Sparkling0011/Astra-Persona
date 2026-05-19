<script setup lang="ts">
import { Moon, Sun } from '@lucide/vue'
import { storeToRefs } from 'pinia'

import BaseButton from '@/components/ui/BaseButton.vue'
import { useThemeStore } from '@/stores/theme'

const themeStore = useThemeStore()
const { isDark } = storeToRefs(themeStore)
</script>

<template>
  <div class="h-dvh overflow-hidden bg-background text-foreground">
    <div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div class="absolute inset-0 bg-[linear-gradient(115deg,rgba(20,184,166,0.14),transparent_28%,rgba(129,140,248,0.1)_54%,transparent_78%),linear-gradient(180deg,rgba(2,6,23,0.12),rgba(2,6,23,0.76))]" />
      <div class="sci-grid absolute inset-0 opacity-45" />
    </div>

    <header class="relative z-30 border-b border-white/10 bg-background/70 backdrop-blur-xl">
      <div class="mx-auto flex min-h-16 max-w-[1800px] items-center justify-between gap-3 px-4">
        <RouterLink to="/" class="flex items-center gap-3 font-semibold">
          <span class="relative grid size-9 place-items-center overflow-hidden rounded-lg border border-white/15 bg-[radial-gradient(circle_at_28%_18%,rgba(255,255,255,0.9),transparent_18%),linear-gradient(135deg,#0f766e,#111827_54%,#6366f1)] text-white shadow-[0_0_30px_rgb(20_184_166/0.28)]">
            <span class="absolute inset-x-2 top-2 h-px rotate-[-28deg] bg-white/70" />
            <span class="text-[15px] font-semibold tracking-normal">A</span>
          </span>
          <span class="hidden leading-tight sm:grid">
            <span>Astra Persona</span>
            <span class="text-[11px] font-medium uppercase text-muted-foreground">AI Identity Studio</span>
          </span>
        </RouterLink>

        <nav class="flex items-center gap-2">
          <RouterLink class="hidden rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground sm:inline-flex" to="/">
            工作台
          </RouterLink>
          <RouterLink class="hidden rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground sm:inline-flex" to="/history">
            资产库
          </RouterLink>
          <BaseButton variant="secondary" :aria-label="isDark ? '切换浅色模式' : '切换深色模式'" @click="themeStore.toggleTheme">
            <Sun v-if="isDark" class="size-4" />
            <Moon v-else class="size-4" />
          </BaseButton>
        </nav>
      </div>
    </header>

    <main class="mx-auto h-[calc(100dvh-4rem)] max-w-[1800px] overflow-hidden px-3 py-3 sm:px-4 lg:py-4">
      <slot />
    </main>
  </div>
</template>
