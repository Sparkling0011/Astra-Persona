<script setup lang="ts">
import { Search, Trash2 } from '@lucide/vue'
import { NButton, NDrawer, NDrawerContent, NInput, NModal, NVirtualList } from 'naive-ui'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { usePersonaStore } from '@/stores/persona'
import type { PersonaBrand } from '@/types/persona'

const personaStore = usePersonaStore()
const { brands, activeBrandId, isHistoryOpen } = storeToRefs(personaStore)
const searchKeyword = ref('')
const pendingBrand = ref<PersonaBrand | null>(null)

const filteredBrands = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()

  if (!keyword) {
    return brands.value
  }

  return brands.value.filter((brand) => {
    const searchableText = [
      brand.nickname,
      brand.username,
      brand.prompt,
      brand.signature,
      brand.bio,
      ...brand.tags,
      ...brand.bios.map((bio) => bio.content),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return searchableText.includes(keyword)
  })
})

const confirmationText = computed(() =>
  pendingBrand.value
    ? `当前工作区会切换为“${pendingBrand.value.nickname}”，现有输入、内容选择和参数配置将被这条历史记录替换。已保存的历史记录不会被删除。`
    : '',
)

function requestSelectBrand(brand: PersonaBrand) {
  if (brand.id === activeBrandId.value) {
    personaStore.closeHistory()
    return
  }

  pendingBrand.value = brand
}

function confirmSelectBrand() {
  if (!pendingBrand.value) {
    return
  }

  personaStore.selectBrand(pendingBrand.value.id)
  pendingBrand.value = null
}

function cancelSelectBrand() {
  pendingBrand.value = null
}

function handleHistoryVisibility(show: boolean) {
  if (!show) {
    personaStore.closeHistory()
  }
}

watch(isHistoryOpen, (open) => {
  if (!open) {
    pendingBrand.value = null
  }
})
</script>

<template>
  <NDrawer
    :show="isHistoryOpen"
    width="min(448px, 100vw)"
    placement="right"
    @update:show="handleHistoryVisibility"
  >
    <NDrawerContent title="历史记录" closable body-content-class="history-drawer-body">
      <div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-5">
        <div>
          <p class="mb-4 text-sm text-muted-foreground">搜索并恢复最近生成的个人品牌方案。</p>
          <NInput v-model:value="searchKeyword" type="text" clearable placeholder="搜索昵称、简述、签名、Bio 或标签">
            <template #prefix>
              <Search class="size-4 text-muted-foreground" />
            </template>
          </NInput>
        </div>

        <NVirtualList
          v-if="filteredBrands.length"
          class="min-h-0"
          :items="filteredBrands"
          :item-size="126"
          key-field="id"
          item-resizable
        >
          <template #default="{ item: brand }">
            <article
              class="mb-2 rounded-lg border p-3 transition"
              :class="brand.id === activeBrandId ? 'border-primary bg-primary/10' : 'border-border bg-card'"
            >
              <button class="flex min-h-14 w-full touch-manipulation items-center gap-3 text-left" @click="requestSelectBrand(brand)">
                <img class="size-14 rounded-md bg-muted p-1" :src="brand.avatars[0]?.url" :alt="brand.nickname" loading="lazy" decoding="async" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-medium">{{ brand.nickname }}</span>
                  <span class="mt-1 block truncate text-xs text-muted-foreground">{{ brand.prompt }}</span>
                </span>
              </button>
              <div class="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span class="truncate">{{ new Date(brand.createdAt).toLocaleString() }}</span>
                <NButton type="error" quaternary size="small" @click="personaStore.removeBrand(brand.id)">
                  <template #icon>
                    <Trash2 class="size-3.5" />
                  </template>
                  删除
                </NButton>
              </div>
            </article>
          </template>
        </NVirtualList>

        <div v-else-if="brands.length" class="self-start rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          没有匹配的历史记录。
        </div>

        <div v-else class="self-start rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          暂无历史记录。
        </div>
      </div>
    </NDrawerContent>
  </NDrawer>

  <NModal
    :show="Boolean(pendingBrand)"
    preset="dialog"
    type="warning"
    title="确认查看历史记录？"
    :content="confirmationText"
    positive-text="确认查看"
    negative-text="取消"
    :mask-closable="true"
    @positive-click="confirmSelectBrand"
    @negative-click="cancelSelectBrand"
    @mask-click="cancelSelectBrand"
    @close="cancelSelectBrand"
  />
</template>
