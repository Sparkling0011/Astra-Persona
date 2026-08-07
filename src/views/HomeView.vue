<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { ref, watch } from 'vue'

import AssetConfigPanel from '@/components/persona/AssetConfigPanel.vue'
import GenerationStatusDock from '@/components/persona/GenerationStatusDock.vue'
import PersonaResultPanel from '@/components/persona/PersonaResultPanel.vue'
import PromptComposer from '@/components/persona/PromptComposer.vue'
import { usePersonaStore } from '@/stores/persona'

const personaStore = usePersonaStore()
const { activeBrand, errorMessage, generationOutcome, isGenerating } = storeToRefs(personaStore)
const activePanel = ref<'select' | 'config' | 'preview'>('select')

const mobileSteps = [
  { id: 'select', index: '01', label: '选择内容' },
  { id: 'config', index: '02', label: '配置参数' },
  { id: 'preview', index: '03', label: '查看结果' },
] as const

watch(isGenerating, (value) => {
  if (value) {
    activePanel.value = 'preview'
  }
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <GenerationStatusDock />

    <nav class="mb-3 grid grid-cols-3 gap-1 rounded-lg border border-white/10 bg-card/55 p-1 backdrop-blur-xl xl:hidden" aria-label="创建步骤">
      <button
        v-for="step in mobileSteps"
        :key="step.id"
        type="button"
        class="flex min-w-0 items-center justify-center gap-2 rounded-md px-2 py-2 text-xs transition"
        :class="activePanel === step.id ? 'bg-primary/12 font-medium text-primary' : 'text-muted-foreground'"
        @click="activePanel = step.id"
      >
        <span class="hidden tabular-nums sm:inline">{{ step.index }}</span>
        <span class="truncate">{{ step.label }}</span>
      </button>
    </nav>

    <div class="workspace-grid grid min-h-0 flex-1 gap-4" :data-active="activePanel">
      <aside class="subtle-scrollbar min-h-0 overflow-y-auto xl:pr-1" :class="activePanel !== 'select' ? 'hidden xl:block' : ''">
        <PromptComposer
          :active="activePanel === 'select'"
          @focus-panel="activePanel = 'select'"
          @next="activePanel = 'config'"
        />
      </aside>

      <AssetConfigPanel
        :active="activePanel === 'config'"
        :class="activePanel !== 'config' ? 'hidden xl:grid' : ''"
        @focus-panel="activePanel = 'config'"
      />

      <PersonaResultPanel
        :active="activePanel === 'preview'"
        :brand="activeBrand"
        :error-message="errorMessage"
        :failed="generationOutcome === 'failed'"
        :loading="isGenerating"
        :class="activePanel !== 'preview' ? 'hidden xl:grid' : ''"
        @focus-panel="activePanel = 'preview'"
        @configure="activePanel = 'config'"
      />
    </div>
  </div>
</template>
