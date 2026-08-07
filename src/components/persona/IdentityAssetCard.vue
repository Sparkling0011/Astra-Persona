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

function copyIdentity() {
  void copyText(`${props.brand.nickname}\n${props.brand.username}`)
}
</script>

<template>
  <article class="asset-result-card grid gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-sm font-semibold text-card-foreground">名称与用户名</h2>
        <p class="mt-1 text-xs text-muted-foreground">用于社交主页和个人品牌识别。</p>
      </div>
      <div class="flex gap-2">
        <BaseButton variant="ghost" @click="copyIdentity">
          <Copy class="size-4" />
          {{ copied ? '已复制' : '复制' }}
        </BaseButton>
        <BaseButton variant="secondary" :disabled="loading" @click="personaStore.regenerateAsset('identity')">
          <RefreshCw class="size-4" />
          换一组
        </BaseButton>
      </div>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <div class="rounded-lg border border-white/10 bg-muted/20 p-4">
        <span class="text-[11px] text-muted-foreground">社交昵称</span>
        <p class="mt-2 text-lg font-semibold leading-7 text-foreground">{{ brand.nickname }}</p>
      </div>
      <div class="rounded-lg border border-white/10 bg-muted/20 p-4">
        <span class="text-[11px] text-muted-foreground">用户名</span>
        <p class="mt-2 break-all text-base font-medium leading-7 text-primary">{{ brand.username }}</p>
      </div>
    </div>

    <div v-if="brand.nicknames.length > 1" class="flex flex-wrap gap-2">
      <button
        v-for="candidate in brand.nicknames"
        :key="candidate"
        type="button"
        class="rounded-md border px-2.5 py-1.5 text-xs transition"
        :class="candidate === brand.nickname ? 'border-primary/50 bg-primary/10 text-primary' : 'border-white/10 bg-card/40 text-muted-foreground hover:text-foreground'"
        @click="personaStore.selectNickname(candidate)"
      >
        {{ candidate }}
      </button>
    </div>
  </article>
</template>
