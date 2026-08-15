<script setup lang="ts">
import { AlertCircle, ArrowLeft, Download, FileText, ImageIcon, PenLine, Share2, Sparkles, Tags, UserRound } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import AssetResultSkeleton from '@/components/persona/AssetResultSkeleton.vue'
import AvatarAssetCard from '@/components/persona/AvatarAssetCard.vue'
import BioVariantsCard from '@/components/persona/BioVariantsCard.vue'
import IdentityAssetCard from '@/components/persona/IdentityAssetCard.vue'
import SignatureAssetCard from '@/components/persona/SignatureAssetCard.vue'
import TagCloudCard from '@/components/persona/TagCloudCard.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { assetRegistry } from '@/constants/assets'
import { usePersonaStore } from '@/stores/persona'
import type { AssetType, PersonaBrand } from '@/types/persona'

const props = defineProps<{
  active: boolean
  brand: PersonaBrand | undefined
  errorMessage: string
  failed: boolean
  loading: boolean
}>()

const emit = defineEmits<{
  focusPanel: []
  configure: []
}>()

const personaStore = usePersonaStore()
const { completedAssetTypes, generatingSection, selectedAssetTypes } = storeToRefs(personaStore)

const assetIcons = {
  identity: UserRound,
  avatar: ImageIcon,
  signature: PenLine,
  bio: FileText,
  tags: Tags,
} satisfies Record<AssetType, unknown>

const visibleAssetTypes = computed<AssetType[]>(() => {
  if (props.loading && generatingSection.value === 'brand') {
    return selectedAssetTypes.value
  }

  if (!props.brand) {
    return []
  }

  return props.brand.assetTypes?.length ? props.brand.assetTypes : inferAssetTypes(props.brand)
})

const hasPendingSelection = computed(() => {
  if (!props.brand || props.loading || props.failed) {
    return false
  }

  return !isSameAssetSet(selectedAssetTypes.value, visibleAssetTypes.value)
})

const generatedTime = computed(() => {
  if (!props.brand) {
    return ''
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(props.brand.updatedAt))
})

function isAssetLoading(type: AssetType) {
  if (!props.loading) {
    return false
  }

  if (generatingSection.value === 'brand') {
    return !completedAssetTypes.value.includes(type)
  }

  return generatingSection.value === type
}

function inferAssetTypes(brand: PersonaBrand): AssetType[] {
  const inferredTypes: AssetType[] = []

  if (brand.nickname || brand.username) inferredTypes.push('identity')
  if (brand.avatars.length || brand.avatarUrl) inferredTypes.push('avatar')
  if (brand.signature) inferredTypes.push('signature')
  if (brand.bio || brand.bios.length) inferredTypes.push('bio')
  if (brand.tags.length) inferredTypes.push('tags')

  return inferredTypes.length ? inferredTypes : ['identity', 'avatar', 'signature', 'bio', 'tags']
}

function isSameAssetSet(left: AssetType[], right: AssetType[]) {
  return left.length === right.length && left.every((type) => right.includes(type))
}
</script>

<template>
  <aside
    class="workspace-panel subtle-scrollbar grid min-h-0 content-start gap-4 p-4 xl:h-full xl:overflow-y-auto"
    :class="{ 'workspace-panel-active': active }"
    @click="emit('focusPanel')"
    @focusin="emit('focusPanel')"
  >
    <div class="relative z-10 flex items-start justify-between gap-4">
      <div class="flex min-w-0 items-start gap-3">
        <span class="workspace-step">03</span>
        <div class="min-w-0">
          <p class="text-xs font-medium tracking-[0.18em] text-primary">方案预览</p>
          <h2 class="mt-2 whitespace-nowrap text-xl font-semibold tracking-normal">生成结果</h2>
          <p class="mt-2 text-sm leading-6 text-muted-foreground">
            {{ failed ? '本次请求失败，未生成或覆盖任何内容。' : brand ? `最近更新于 ${generatedTime}` : '生成后可在此管理、下载和分享内容。' }}
          </p>
        </div>
      </div>
      <span class="workspace-status" :class="failed ? 'border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-300' : ''">
        {{ loading ? '生成中' : failed ? '生成失败' : brand ? '已生成' : '待生成' }}
      </span>
    </div>

    <div v-if="brand && !loading && !failed" class="relative z-10 flex items-center justify-between gap-3 border-y border-white/10 py-3">
      <div class="min-w-0">
        <p class="text-xs font-medium text-foreground">本次生成结果</p>
        <p class="mt-1 truncate text-[11px] text-muted-foreground">{{ visibleAssetTypes.length }} 项内容可用</p>
      </div>
      <div class="flex shrink-0 gap-2">
        <BaseButton variant="ghost" :disabled="loading" @click="personaStore.createShare(brand.id)">
          <Share2 class="size-4" />
          <span class="hidden sm:inline">分享</span>
        </BaseButton>
        <BaseButton variant="secondary" :disabled="loading" @click="personaStore.exportKit(brand.id)">
          <Download class="size-4" />
          <span class="hidden sm:inline">导出套装</span>
        </BaseButton>
      </div>
    </div>

    <div v-if="hasPendingSelection" class="relative z-10 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-xs leading-5 text-primary">
      生成内容已变更。当前仍展示上次结果，重新生成后将更新为新的内容组合。
    </div>

    <div v-if="failed && !loading" class="result-empty-state relative z-10 border-red-500/15 bg-red-500/[0.04]">
      <span class="grid size-12 place-items-center rounded-lg border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-300">
        <AlertCircle class="size-5" />
      </span>
      <div>
        <h3 class="text-base font-semibold text-foreground">本次生成未完成</h3>
        <p class="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
          {{ errorMessage || 'AI 服务暂时不可用，请检查配置后重试。' }}
        </p>
        <p v-if="brand" class="mt-2 text-xs leading-5 text-muted-foreground">
          上一次成功结果仍保存在“最近生成”中，本次失败没有写入历史记录。
        </p>
      </div>
      <BaseButton variant="secondary" @click="emit('configure')">
        <ArrowLeft class="size-4" />
        返回参数配置
      </BaseButton>
    </div>

    <template v-else-if="brand || loading">
      <template v-for="type in visibleAssetTypes" :key="type">
        <AssetResultSkeleton v-if="isAssetLoading(type)" :type="type" />
        <IdentityAssetCard v-else-if="type === 'identity' && brand" :brand="brand" :loading="loading" />
        <AvatarAssetCard v-else-if="type === 'avatar' && brand" :brand="brand" :loading="loading" />
        <SignatureAssetCard v-else-if="type === 'signature' && brand" :brand="brand" :loading="loading" />
        <BioVariantsCard v-else-if="type === 'bio' && brand" :brand="brand" :loading="loading" />
        <TagCloudCard
          v-else-if="type === 'tags' && brand"
          :tags="brand.tags"
          :format="brand.assetConfigs?.tags.format ?? 'plain'"
          :loading="loading"
        />
      </template>
    </template>

    <div v-else class="result-empty-state relative z-10">
      <span class="grid size-12 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
        <Sparkles class="size-5" />
      </span>
      <div>
        <h3 class="text-base font-semibold text-foreground">准备创建第一套个人品牌方案</h3>
        <p class="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">已选择 {{ selectedAssetTypes.length }} 项内容，完成参数配置后即可生成。</p>
      </div>
      <div class="flex flex-wrap justify-center gap-2">
        <span v-for="type in selectedAssetTypes" :key="type" class="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-card/50 px-2.5 py-1.5 text-xs text-muted-foreground">
          <component :is="assetIcons[type]" class="size-3.5 text-primary" />
          {{ assetRegistry[type].label }}
        </span>
      </div>
      <BaseButton variant="secondary" @click="emit('configure')">
        <ArrowLeft class="size-4" />
        前往参数配置
      </BaseButton>
    </div>
  </aside>
</template>
