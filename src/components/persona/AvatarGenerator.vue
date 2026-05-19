<script setup lang="ts">
import { ImagePlus, RefreshCcw } from '@lucide/vue'
import { computed, ref } from 'vue'

import ImageEditor from '@/components/persona/ImageEditor.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { usePersonaStore } from '@/stores/persona'
import type { PersonaBrand } from '@/types/persona'

const props = defineProps<{
  brand: PersonaBrand
  loading: boolean
}>()

const personaStore = usePersonaStore()
const showEditor = ref(true)

const selectedAvatar = computed(
  () => props.brand.avatars.find((avatar) => avatar.id === props.brand.selectedAvatarId) ?? props.brand.avatars[0],
)

function saveCurrent(dataUrl: string) {
  if (!selectedAvatar.value) {
    return
  }

  personaStore.updateAvatar(selectedAvatar.value.id, dataUrl)
}

function createVariant(dataUrl: string) {
  personaStore.addAvatarVariant(dataUrl, '编辑版')
}
</script>

<template>
  <article class="rounded-lg border border-border bg-card p-4 shadow-soft">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-sm font-semibold text-card-foreground">头像工作区</h2>
        <p class="mt-1 text-xs text-muted-foreground">生成变体、局部重绘，并完成基础后期处理。</p>
      </div>
      <div class="flex gap-2">
        <BaseButton variant="ghost" @click="showEditor = !showEditor">
          <ImagePlus class="size-4" />
          {{ showEditor ? '收起' : '编辑' }}
        </BaseButton>
        <BaseButton variant="secondary" :disabled="loading" @click="personaStore.regenerateSection('avatar')">
          <RefreshCcw class="size-4" />
          变体
        </BaseButton>
      </div>
    </div>

    <div class="mt-5 grid gap-4 lg:grid-cols-[280px_1fr]">
      <div class="grid gap-3">
        <div class="grid place-items-center rounded-lg border border-border bg-muted/50 p-5">
          <img v-if="selectedAvatar" class="size-48 rounded-lg bg-background p-3" :src="selectedAvatar.url" :alt="selectedAvatar.label" loading="eager" decoding="async" />
        </div>

        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="avatar in brand.avatars"
            :key="avatar.id"
            class="grid gap-2 rounded-lg border p-2 text-left transition hover:-translate-y-0.5 hover:bg-muted"
            :class="avatar.id === brand.selectedAvatarId ? 'border-primary bg-primary/10' : 'border-border bg-card'"
            @click="personaStore.selectAvatar(avatar.id)"
          >
            <img class="aspect-square w-full rounded-md bg-muted p-1.5" :src="avatar.url" :alt="avatar.label" loading="lazy" decoding="async" />
            <span class="truncate text-center text-xs text-muted-foreground">{{ avatar.label }}</span>
          </button>
        </div>
      </div>

      <ImageEditor
        v-if="showEditor && selectedAvatar"
        :brand="brand"
        :image-url="selectedAvatar.url"
        :disabled="loading"
        @save="saveCurrent"
        @create-variant="createVariant"
      />
    </div>
  </article>
</template>
