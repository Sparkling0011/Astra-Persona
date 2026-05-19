<script setup lang="ts">
import { Copy, Download, RefreshCw, Share2 } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import { useClipboard } from '@/composables/useClipboard'
import { usePersonaStore } from '@/stores/persona'
import type { PersonaBrand } from '@/types/persona'

const props = defineProps<{
  brand: PersonaBrand
  loading: boolean
}>()

const personaStore = usePersonaStore()
const { shareQrCodeDataUrl, shareUrl } = storeToRefs(personaStore)
const { copied, copyText } = useClipboard()
const isExporting = ref(false)
const isSharing = ref(false)

function copyIdentity() {
  void copyText(`${props.brand.nickname}\n${props.brand.username}\n${props.brand.signature}`)
}

async function exportKit() {
  isExporting.value = true

  try {
    await personaStore.exportKit(props.brand.id)
  } finally {
    isExporting.value = false
  }
}

async function sharePersona() {
  isSharing.value = true

  try {
    const share = await personaStore.createShare(props.brand.id)

    if (share) {
      await copyText(share.url)
    }
  } finally {
    isSharing.value = false
  }
}
</script>

<template>
  <article class="glass-panel glow-card grid gap-4 rounded-lg p-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-sm font-semibold text-card-foreground">身份名片</h2>
      <div class="flex flex-wrap gap-2">
        <BaseButton variant="ghost" @click="copyIdentity">
          <Copy class="size-4" />
          {{ copied ? '已复制' : '复制' }}
        </BaseButton>
        <BaseButton variant="ghost" :disabled="isExporting" @click="exportKit">
          <Download class="size-4" />
          {{ isExporting ? '导出中' : '导出' }}
        </BaseButton>
        <BaseButton variant="ghost" :disabled="isSharing" @click="sharePersona">
          <Share2 class="size-4" />
          分享
        </BaseButton>
        <BaseButton variant="secondary" :disabled="loading" @click="personaStore.regenerateSection('signature')">
          <RefreshCw class="size-4" />
          重写签名
        </BaseButton>
      </div>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <div class="rounded-lg border border-white/10 bg-muted/20 p-4">
        <p class="text-xs text-muted-foreground">显示名称</p>
        <p class="mt-2 text-xl font-semibold text-foreground">{{ brand.nickname }}</p>
      </div>
      <div class="rounded-lg border border-white/10 bg-muted/20 p-4">
        <p class="text-xs text-muted-foreground">账号名称</p>
        <p class="mt-2 text-xl font-semibold text-primary">{{ brand.username }}</p>
      </div>
    </div>

    <div class="rounded-lg border border-white/10 bg-background/35 p-4">
      <p class="text-xs text-muted-foreground">签名</p>
      <p class="mt-2 text-base leading-7 text-foreground">{{ brand.signature }}</p>
    </div>

    <div v-if="shareUrl" class="grid gap-3 rounded-lg border border-white/10 bg-background/35 p-4 sm:grid-cols-[1fr_auto]">
      <div class="min-w-0">
        <p class="text-xs text-muted-foreground">公开链接</p>
        <p class="mt-2 truncate text-sm text-primary">{{ shareUrl }}</p>
      </div>
      <img v-if="shareQrCodeDataUrl" class="size-24 rounded-md bg-white p-2" :src="shareQrCodeDataUrl" alt="Persona 分享二维码" loading="lazy" decoding="async" />
    </div>
  </article>
</template>
