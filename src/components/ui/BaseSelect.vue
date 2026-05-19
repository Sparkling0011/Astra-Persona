<script setup lang="ts">
defineProps<{
  id: string
  label: string
  options: Array<{ label: string; value: string; hint?: string }>
}>()

const model = defineModel<string>({ required: true })
</script>

<template>
  <label :for="id" class="grid gap-2 text-sm font-medium text-foreground">
    <span>{{ label }}</span>
    <select
      :id="id"
      v-model="model"
      class="h-11 rounded-md border border-border bg-card px-3 text-sm text-card-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
    >
      <option v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}{{ option.hint ? ` - ${option.hint}` : '' }}
      </option>
    </select>
  </label>
</template>
