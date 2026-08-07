<script setup lang="ts">
import { Copy, RefreshCw } from '@lucide/vue'

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

function copySignature() {
  void copyText(props.brand.signature)
}
</script>

<template>
  <article class="asset-result-card grid gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-sm font-semibold text-card-foreground">社交签名</h2>
        <p class="mt-1 text-xs text-muted-foreground">适用于主页签名、状态栏和简介首句。</p>
      </div>
      <div class="flex gap-2">
        <BaseButton variant="ghost" @click="copySignature">
          <Copy class="size-4" />
          {{ copied ? '已复制' : '复制' }}
        </BaseButton>
        <BaseButton variant="secondary" :disabled="loading" @click="personaStore.regenerateAsset('signature')">
          <RefreshCw class="size-4" />
          重写
        </BaseButton>
      </div>
    </div>

    <div class="rounded-lg border border-white/10 bg-muted/20 p-4">
      <p class="text-base leading-7 text-foreground">{{ brand.signature }}</p>
    </div>
  </article>
</template>
