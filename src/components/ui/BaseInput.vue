<script setup lang="ts">
import { NInput } from 'naive-ui'

defineProps<{
  id: string
  label: string
  placeholder?: string
}>()

const model = defineModel<string>({ required: true })
</script>

<template>
  <label :for="id" class="grid gap-2 text-sm font-medium text-foreground">
    <span>{{ label }}</span>
    <NInput
      v-model:value="model"
      :placeholder="placeholder ?? ''"
      :input-props="{ id }"
      size="large"
      clearable
    />
  </label>
</template>
