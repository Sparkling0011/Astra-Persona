<script setup lang="ts">
import { storeToRefs } from 'pinia'

import { usePersonaStore } from '@/stores/persona'

const personaStore = usePersonaStore()
const { brands, activeBrandId } = storeToRefs(personaStore)
</script>

<template>
  <section class="grid gap-4">
    <div>
      <h1 class="text-2xl font-semibold tracking-normal">历史记录</h1>
      <p class="mt-2 text-sm text-muted-foreground">已生成的个人品牌方案会保存在本机，可随时切换、导出或继续编辑。</p>
    </div>

    <div v-if="brands.length" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <article
        v-for="brand in brands"
        :key="brand.id"
        class="rounded-lg border bg-card p-4 transition"
        :class="brand.id === activeBrandId ? 'border-primary' : 'border-border'"
      >
        <button class="flex w-full items-center gap-3 text-left" @click="personaStore.selectBrand(brand.id)">
          <img class="size-14 rounded-md border border-border bg-muted p-1" :src="brand.avatars[0]?.url" :alt="brand.nickname" loading="lazy" decoding="async" />
          <span class="min-w-0">
            <span class="block truncate font-medium">{{ brand.nickname }}</span>
            <span class="mt-1 block text-xs text-muted-foreground">{{ brand.username }}</span>
          </span>
        </button>
        <p class="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{{ brand.signature }}</p>
      </article>
    </div>

    <div v-else class="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
      暂无历史记录。
    </div>
  </section>
</template>
