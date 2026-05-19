<script setup lang="ts">
import { storeToRefs } from 'pinia'

import FloatingActions from '@/components/persona/FloatingActions.vue'
import GenerationStatusDock from '@/components/persona/GenerationStatusDock.vue'
import HistoryDrawer from '@/components/persona/HistoryDrawer.vue'
import PersonaCanvas from '@/components/persona/PersonaCanvas.vue'
import PersonaResultPanel from '@/components/persona/PersonaResultPanel.vue'
import PromptComposer from '@/components/persona/PromptComposer.vue'
import { usePersonaStore } from '@/stores/persona'

const personaStore = usePersonaStore()
const { activeBrand, isGenerating } = storeToRefs(personaStore)
</script>

<template>
  <div class="subtle-scrollbar h-full min-h-0 overflow-y-auto xl:overflow-hidden">
    <GenerationStatusDock />

    <div class="grid min-h-0 gap-4 xl:h-full xl:grid-cols-[minmax(280px,28fr)_minmax(420px,45fr)_minmax(300px,27fr)]">
      <aside class="subtle-scrollbar min-h-0 xl:overflow-y-auto xl:pr-1">
        <PromptComposer />
      </aside>

      <PersonaCanvas :brand="activeBrand" :loading="isGenerating" />

      <PersonaResultPanel :brand="activeBrand" :loading="isGenerating" />
    </div>

    <HistoryDrawer />
    <FloatingActions />
  </div>
</template>
