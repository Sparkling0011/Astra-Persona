<script setup lang="ts">
import { Copy, RefreshCcw } from '@lucide/vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import { useClipboard } from '@/composables/useClipboard'
import { usePersonaStore } from '@/stores/persona'
import type { PersonaBrand } from '@/types/persona'

const props = defineProps<{
  brand: PersonaBrand
  loading: boolean
}>()

const personaStore = usePersonaStore()
const { copied, copyText } = useClipboard()

function copyBios() {
  void copyText(props.brand.bio || props.brand.bios[0]?.content || '')
}
</script>

<template>
  <article class="glass-panel glow-card grid gap-4 rounded-lg p-4">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h2 class="text-sm font-semibold text-card-foreground">个人简介</h2>
        <p class="mt-1 text-xs text-muted-foreground">适用于主页、作品集与社交账号。</p>
      </div>
      <div class="flex gap-2">
        <BaseButton variant="ghost" @click="copyBios">
          <Copy class="size-4" />
          {{ copied ? '已复制' : '复制' }}
        </BaseButton>
        <BaseButton variant="secondary" :disabled="loading" @click="personaStore.regenerateSection('bio')">
          <RefreshCcw class="size-4" />
          重写
        </BaseButton>
      </div>
    </div>

    <div class="rounded-lg border border-white/10 bg-muted/20 p-4">
      <p class="text-xs font-medium text-primary">Profile Bio</p>
      <p class="mt-2 text-sm leading-7 text-foreground">{{ brand.bio || brand.bios[0]?.content }}</p>
    </div>
  </article>
</template>
