<script setup lang="ts">
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
    <textarea
      :id="id"
      v-model="model"
      :placeholder="placeholder"
      rows="4"
      class="min-h-28 resize-y rounded-md border border-border bg-card px-3 py-2 text-sm text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
    />
  </label>
</template>
