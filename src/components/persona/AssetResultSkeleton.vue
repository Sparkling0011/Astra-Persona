<script setup lang="ts">
import { FileText, ImageIcon, PenLine, Tags, UserRound } from '@lucide/vue'

import { assetRegistry } from '@/constants/assets'
import type { AssetType } from '@/types/persona'

const props = defineProps<{
  type: AssetType
}>()

const assetIcons = {
  identity: UserRound,
  avatar: ImageIcon,
  signature: PenLine,
  bio: FileText,
  tags: Tags,
} satisfies Record<AssetType, unknown>
</script>

<template>
  <article class="asset-result-card overflow-hidden" aria-live="polite" :aria-label="`${assetRegistry[props.type].label}生成中`">
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <span class="grid size-9 place-items-center rounded-md border border-primary/20 bg-primary/10 text-primary">
          <component :is="assetIcons[props.type]" class="size-4" />
        </span>
        <div>
          <h2 class="text-sm font-semibold text-foreground">{{ assetRegistry[props.type].label }}</h2>
          <p class="mt-1 text-xs text-muted-foreground">正在生成，请稍候</p>
        </div>
      </div>
      <span class="flex items-center gap-2 text-xs text-primary">
        <span class="size-1.5 animate-pulse rounded-full bg-primary" />
        处理中
      </span>
    </div>

    <div class="mt-4 grid animate-pulse gap-3" :class="props.type === 'avatar' ? 'grid-cols-3' : ''">
      <div v-if="props.type === 'avatar'" class="col-span-3 aspect-[16/7] rounded-lg bg-muted/55" />
      <template v-else-if="props.type === 'tags'">
        <div v-for="index in 6" :key="index" class="h-8 rounded-md bg-muted/55" :class="index % 3 === 0 ? 'w-24' : 'w-20'" />
      </template>
      <template v-else>
        <div class="h-4 w-4/5 rounded bg-muted/55" />
        <div class="h-4 w-full rounded bg-muted/45" />
        <div class="h-4 w-2/3 rounded bg-muted/45" />
      </template>
    </div>
  </article>
</template>
