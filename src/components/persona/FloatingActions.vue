<script setup lang="ts">
import { Download, Share2, WandSparkles } from '@lucide/vue'
import { storeToRefs } from 'pinia'

import { usePersonaStore } from '@/stores/persona'

const personaStore = usePersonaStore()
const { activeBrand, isGenerating } = storeToRefs(personaStore)
</script>

<template>
  <div class="fixed bottom-5 right-5 z-40 flex flex-col gap-3">
    <button
      class="grid size-12 touch-manipulation place-items-center rounded-md border border-primary/30 bg-primary text-primary-foreground shadow-[0_18px_60px_-24px_rgb(20_184_166/0.9)] transition hover:-translate-y-0.5 disabled:opacity-50"
      :disabled="isGenerating"
      aria-label="生成所选内容"
      @click="personaStore.createPersona()"
    >
      <WandSparkles class="size-5" />
    </button>
    <button
      class="grid size-12 touch-manipulation place-items-center rounded-md border border-white/10 bg-card/80 text-foreground shadow-soft backdrop-blur-xl transition hover:-translate-y-0.5 disabled:opacity-50"
      :disabled="!activeBrand"
      aria-label="导出品牌套装"
      @click="activeBrand && personaStore.exportKit(activeBrand.id)"
    >
      <Download class="size-5" />
    </button>
    <button
      class="grid size-12 touch-manipulation place-items-center rounded-md border border-white/10 bg-card/80 text-foreground shadow-soft backdrop-blur-xl transition hover:-translate-y-0.5 disabled:opacity-50"
      :disabled="!activeBrand"
      aria-label="分享个人品牌方案"
      @click="activeBrand && personaStore.createShare(activeBrand.id)"
    >
      <Share2 class="size-5" />
    </button>
  </div>
</template>
