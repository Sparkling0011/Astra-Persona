<script setup lang="ts">
import { History, RotateCcw, WandSparkles, X } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'
import { personaStyles } from '@/constants/persona'
import { usePersonaStore } from '@/stores/persona'

const personaStore = usePersonaStore()
const { form, params, promptHistory, isGenerating, generatingSection, errorMessage, brands } = storeToRefs(personaStore)

const canGenerate = computed(() => form.value.prompt.trim().length > 0 && !isGenerating.value)

function reusePrompt(prompt: string) {
  personaStore.setPrompt(prompt)
}
</script>

<template>
  <section class="glass-panel glow-card grid gap-4 rounded-lg p-4">
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.24em] text-primary">Identity Brief</p>
        <h1 class="mt-2 text-2xl font-semibold tracking-normal text-card-foreground">身份设定</h1>
        <p class="mt-2 text-sm leading-6 text-muted-foreground">输入定位与气质，生成可直接使用的个人品牌素材。</p>
      </div>
      <BaseButton variant="secondary" @click="personaStore.toggleHistory">
        <History class="size-4" />
        {{ brands.length }}
      </BaseButton>
    </div>

    <BaseTextarea
      id="brand-prompt"
      v-model="form.prompt"
      label="品牌简述"
      placeholder="例如：独立 AI 产品顾问，关注效率系统与审美表达，希望呈现专业、清晰、有温度的个人形象。"
    />

    <BaseSelect id="brand-style" v-model="form.style" label="表达风格" :options="personaStyles" />

    <div class="grid gap-3 rounded-lg border border-white/10 bg-background/35 p-3">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-foreground">输出设置</span>
        <span class="text-xs text-muted-foreground">随资产自动保存</span>
      </div>
      <div class="grid gap-3 sm:grid-cols-3">
        <label class="grid gap-2 text-xs font-medium text-muted-foreground">
          <span>头像组数</span>
          <input
            v-model.number="params.imageCount"
            min="1"
            max="6"
            type="number"
            class="h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
        <label class="grid gap-2 text-xs font-medium text-muted-foreground">
          <span>画面尺寸</span>
          <select v-model="params.imageSize" class="h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground outline-none focus:border-primary">
            <option value="512x512">512x512</option>
            <option value="1024x1024">1024x1024</option>
            <option value="1024x1536">1024x1536</option>
          </select>
        </label>
        <label class="grid gap-2 text-xs font-medium text-muted-foreground">
          <span>生成强度 {{ params.creativity.toFixed(2) }}</span>
          <input v-model.number="params.creativity" min="0.1" max="1" step="0.05" type="range" class="h-9 accent-primary" />
        </label>
      </div>
    </div>

    <div v-if="promptHistory.length" class="grid gap-2 rounded-lg border border-white/10 bg-background/35 p-3">
      <div class="flex items-center justify-between gap-3">
        <span class="text-sm font-medium text-foreground">最近简述</span>
        <button class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" @click="personaStore.clearPromptHistory">
          <X class="size-3.5" />
          清空
        </button>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="item in promptHistory.slice(0, 5)"
          :key="item.id"
          class="max-w-full truncate rounded-md border border-border bg-card px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          @click="reusePrompt(item.prompt)"
        >
          {{ item.prompt }}
        </button>
      </div>
    </div>

    <p v-if="errorMessage" class="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
      {{ errorMessage }}
    </p>

    <div class="flex flex-wrap gap-3">
      <BaseButton :disabled="!canGenerate" @click="personaStore.createPersona">
        <WandSparkles class="size-4" />
        {{ isGenerating && generatingSection === 'brand' ? '生成中' : '生成身份资产' }}
      </BaseButton>
      <BaseButton variant="secondary" :disabled="isGenerating" @click="personaStore.resetForm">
        <RotateCcw class="size-4" />
        重置
      </BaseButton>
    </div>
  </section>
</template>
