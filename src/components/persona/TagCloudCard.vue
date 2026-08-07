<script setup lang="ts">
import { Copy, RefreshCw } from '@lucide/vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import { useClipboard } from '@/composables/useClipboard'
import { usePersonaStore } from '@/stores/persona'

const props = defineProps<{
  tags: string[]
  format?: 'plain' | 'hashtag'
  loading?: boolean
}>()

const personaStore = usePersonaStore()
const { copied, copyText } = useClipboard()

function displayTag(tag: string) {
  const normalized = tag.replace(/^#+/, '')
  return props.format === 'hashtag' ? `#${normalized}` : normalized
}
</script>

<template>
  <article class="asset-result-card">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-sm font-semibold text-card-foreground">关键词标签</h2>
        <p class="mt-1 text-xs text-muted-foreground">用于内容定位、主页标签和标签云。</p>
      </div>
      <div class="flex gap-2">
        <BaseButton variant="ghost" @click="copyText(tags.map(displayTag).join(' '))">
          <Copy class="size-4" />
          {{ copied ? '已复制' : '复制' }}
        </BaseButton>
        <BaseButton variant="secondary" :disabled="loading" @click="personaStore.regenerateAsset('tags')">
          <RefreshCw class="size-4" />
          重写
        </BaseButton>
      </div>
    </div>
    <div class="mt-4 flex flex-wrap gap-2">
      <span
        v-for="tag in tags"
        :key="tag"
        class="rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
      >
        {{ displayTag(tag) }}
      </span>
    </div>
  </article>
</template>
