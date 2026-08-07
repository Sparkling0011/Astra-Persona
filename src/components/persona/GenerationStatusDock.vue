<script setup lang="ts">
import { Loader2 } from '@lucide/vue'
import { NProgress } from 'naive-ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import { usePersonaStore } from '@/stores/persona'
import type { PersonaSection } from '@/types/persona'

const personaStore = usePersonaStore()
const { isGenerating, generatingSection, progress, loadingMessage } = storeToRefs(personaStore)

const sectionLabel = computed(() => {
  const labelMap: Record<PersonaSection | 'brand', string> = {
    brand: '生成内容',
    identity: '名称与用户名',
    avatar: '头像形象',
    signature: '签名',
    bio: '简介',
    tags: '关键词',
  }

  return generatingSection.value ? labelMap[generatingSection.value] : '待命'
})

const statusText = computed(() => loadingMessage.value || `正在生成${sectionLabel.value}`)

const visibleProgress = computed(() => Math.max(isGenerating.value ? 8 : 0, progress.value))
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="-translate-y-2 opacity-0 scale-[0.98]"
    enter-to-class="translate-y-0 opacity-100 scale-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="translate-y-0 opacity-100 scale-100"
    leave-to-class="-translate-y-2 opacity-0 scale-[0.98]"
  >
    <section
      v-if="isGenerating"
      class="fixed left-1/2 top-20 z-40 w-[calc(100vw-2rem)] max-w-[420px] -translate-x-1/2 overflow-hidden rounded-xl border border-primary/25 bg-card/86 px-3 py-2.5 shadow-[0_18px_64px_-36px_rgb(20_184_166/0.5)] backdrop-blur-xl"
      aria-live="polite"
    >
      <div class="flex items-center gap-3">
        <span class="grid size-8 shrink-0 place-items-center rounded-lg border border-primary/15 bg-background/45 text-primary">
          <Loader2 class="size-4 animate-spin" />
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-3">
            <span class="truncate text-sm font-semibold text-foreground">{{ sectionLabel }}</span>
            <span class="text-xs font-semibold tabular-nums text-primary">{{ Math.round(progress) }}%</span>
          </div>
          <p class="mt-0.5 truncate text-xs text-muted-foreground">{{ statusText }}</p>
        </div>
      </div>

      <NProgress class="mt-2" type="line" :percentage="visibleProgress" :height="6" :border-radius="999" :show-indicator="false" />
    </section>
  </Transition>
</template>
