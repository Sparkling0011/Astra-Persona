<script setup lang="ts">
defineProps<{
  tags: string[]
}>()
</script>

<template>
  <article class="glass-panel glow-card rounded-lg p-4">
    <h2 class="text-sm font-semibold text-card-foreground">关键词</h2>
    <div class="mt-4 flex flex-wrap gap-2">
      <span
        v-for="tag in tags"
        :key="tag"
        class="rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
      >
        #{{ tag }}
      </span>
    </div>
  </article>
</template>
