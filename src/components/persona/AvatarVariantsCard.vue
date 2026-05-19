<script setup lang="ts">
import { RefreshCcw } from '@lucide/vue'
import { computed } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import { usePersonaStore } from '@/stores/persona'
import type { PersonaBrand } from '@/types/persona'

const props = defineProps<{
  brand: PersonaBrand
  loading: boolean
}>()

const personaStore = usePersonaStore()

const selectedAvatar = computed(
  () => props.brand.avatars.find((avatar) => avatar.id === props.brand.selectedAvatarId) ?? props.brand.avatars[0],
)
</script>

<template>
  <article class="rounded-lg border border-border bg-card p-4 shadow-soft">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h2 class="text-sm font-semibold text-card-foreground">头像变体</h2>
        <p class="mt-1 text-xs text-muted-foreground">选择主视觉，或重新生成一组头像。</p>
      </div>
      <BaseButton variant="secondary" :disabled="loading" @click="personaStore.regenerateSection('avatar')">
        <RefreshCcw class="size-4" />
        重新生成
      </BaseButton>
    </div>

    <div class="mt-5 grid gap-4 md:grid-cols-[1fr_1.1fr]">
      <div class="grid place-items-center rounded-lg border border-border bg-muted/50 p-5">
        <img v-if="selectedAvatar" class="size-44 rounded-lg bg-background p-3" :src="selectedAvatar.url" :alt="selectedAvatar.label" loading="eager" decoding="async" />
      </div>

      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="avatar in brand.avatars"
          :key="avatar.id"
          class="grid gap-2 rounded-lg border p-2 text-left transition hover:-translate-y-0.5 hover:bg-muted"
          :class="avatar.id === brand.selectedAvatarId ? 'border-primary bg-primary/10' : 'border-border bg-card'"
          @click="personaStore.selectAvatar(avatar.id)"
        >
          <img class="aspect-square w-full rounded-md bg-muted p-2" :src="avatar.url" :alt="avatar.label" loading="lazy" decoding="async" />
          <span class="text-center text-xs text-muted-foreground">{{ avatar.label }}</span>
        </button>
      </div>
    </div>
  </article>
</template>
