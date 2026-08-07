<script setup lang="ts">
withDefaults(
  defineProps<{
    compact?: boolean
  }>(),
  {
    compact: false,
  },
)
</script>

<template>
  <span class="flex min-w-0 items-center gap-2.5">
    <svg
      class="size-9 shrink-0 text-primary drop-shadow-[0_0_14px_hsl(var(--primary)/0.28)]"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path d="M9.5 30.5L20 7.5L30.5 30.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M14.8 22H25.2" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" />
      <path d="M6.8 18.2C10.2 11.7 26.2 8.7 33 15.1" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" opacity="0.46" />
      <path d="M8.8 27.8C14.9 34.2 25.1 34.3 31.5 28.1" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" opacity="0.46" />
      <circle cx="7.3" cy="18" r="1.8" fill="currentColor" opacity="0.72" />
      <path d="M32.5 7.8V12.6M30.1 10.2H34.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </svg>

    <span v-if="!compact" class="grid min-w-0 leading-tight">
      <span class="truncate text-[15px] font-semibold text-foreground">星格</span>
      <span class="truncate text-[11px] text-muted-foreground">AI 个人品牌生成器</span>
    </span>
  </span>
</template>
