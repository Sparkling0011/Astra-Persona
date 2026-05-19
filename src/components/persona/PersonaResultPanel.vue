<script setup lang="ts">
import BioVariantsCard from '@/components/persona/BioVariantsCard.vue'
import BrandIdentityCard from '@/components/persona/BrandIdentityCard.vue'
import TagCloudCard from '@/components/persona/TagCloudCard.vue'
import type { PersonaBrand } from '@/types/persona'

defineProps<{
  brand: PersonaBrand | undefined
  loading: boolean
}>()
</script>

<template>
  <aside class="subtle-scrollbar grid min-h-0 content-start gap-4 xl:h-full xl:overflow-y-auto xl:pr-1">
    <div class="glass-panel glow-card rounded-lg p-4">
      <p class="text-xs font-medium uppercase tracking-[0.24em] text-primary">Identity Kit</p>
      <h2 class="mt-2 text-xl font-semibold tracking-normal">资产概览</h2>
      <p class="mt-2 text-sm leading-6 text-muted-foreground">昵称、签名、简介与标签会在生成后自动整理。</p>
    </div>

    <template v-if="brand">
      <BrandIdentityCard :brand="brand" :loading="loading" />
      <BioVariantsCard :brand="brand" :loading="loading" />
      <TagCloudCard :tags="brand.tags" />
    </template>

    <div v-else class="glass-panel glow-card rounded-lg p-6 text-sm leading-6 text-muted-foreground">
      完成身份设定后，这里会展示可复制、可导出、可分享的品牌资产。
    </div>
  </aside>
</template>
