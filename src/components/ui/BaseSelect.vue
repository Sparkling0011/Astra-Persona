<script setup lang="ts">
import { NSelect } from 'naive-ui'

defineProps<{
  id: string
  label: string
  options: Array<{ label: string; value: string; hint?: string }>
}>()

const model = defineModel<string>({ required: true })
</script>

<template>
  <label class="grid gap-2 text-sm font-medium text-foreground">
    <span>{{ label }}</span>
    <NSelect
      :id="id"
      v-model:value="model"
      :options="options.map((option) => ({ ...option, label: `${option.label}${option.hint ? ` - ${option.hint}` : ''}` }))"
      size="large"
    />
  </label>
</template>
