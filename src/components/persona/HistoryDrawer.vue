<script setup lang="ts">
import { Trash2, X } from '@lucide/vue'
import { storeToRefs } from 'pinia'

import BaseButton from '@/components/ui/BaseButton.vue'
import VirtualList from '@/components/ui/VirtualList.vue'
import { usePersonaStore } from '@/stores/persona'

const personaStore = usePersonaStore()
const { brands, activeBrandId, isHistoryOpen } = storeToRefs(personaStore)
</script>

<template>
  <Teleport to="body">
    <div v-if="isHistoryOpen" class="fixed inset-0 z-40">
      <button class="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" aria-label="关闭资产库" @click="personaStore.closeHistory" />

      <aside class="absolute right-0 top-0 h-full w-full max-w-md border-l border-border bg-background p-5 shadow-soft">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold">资产库</h2>
            <p class="mt-1 text-sm text-muted-foreground">本机保存，可随时恢复编辑。</p>
          </div>
          <BaseButton variant="secondary" @click="personaStore.closeHistory">
            <X class="size-4" />
          </BaseButton>
        </div>

        <div class="mt-5">
          <VirtualList v-if="brands.length" :items="brands" :item-height="118" :height="620">
            <template #default="{ item: brand }">
              <article
                class="rounded-lg border p-3 transition"
                :class="brand.id === activeBrandId ? 'border-primary bg-primary/10' : 'border-border bg-card'"
              >
                <button class="flex min-h-14 w-full touch-manipulation items-center gap-3 text-left" @click="personaStore.selectBrand(brand.id)">
                  <img class="size-14 rounded-md bg-muted p-1" :src="brand.avatars[0]?.url" :alt="brand.nickname" loading="lazy" decoding="async" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-medium">{{ brand.nickname }}</span>
                    <span class="mt-1 block truncate text-xs text-muted-foreground">{{ brand.prompt }}</span>
                  </span>
                </button>
                <div class="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{{ new Date(brand.createdAt).toLocaleString() }}</span>
                  <button class="inline-flex min-h-10 touch-manipulation items-center gap-1 text-red-500 hover:text-red-600" @click="personaStore.removeBrand(brand.id)">
                    <Trash2 class="size-3.5" />
                    删除
                  </button>
                </div>
              </article>
            </template>
          </VirtualList>

          <div v-if="!brands.length" class="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            暂无资产记录。
          </div>
        </div>
      </aside>
    </div>
  </Teleport>
</template>
