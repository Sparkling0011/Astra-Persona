<script setup lang="ts">
import { computed } from 'vue'

import { cn } from '@/utils/cn'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost'
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
  }>(),
  {
    variant: 'primary',
    type: 'button',
    disabled: false,
  },
)

const classes = computed(() =>
  cn(
    'inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-55',
    {
      'bg-primary text-primary-foreground shadow-sm hover:opacity-90':
        props.variant === 'primary',
      'border border-border bg-card text-card-foreground hover:bg-muted':
        props.variant === 'secondary',
      'text-foreground hover:bg-muted': props.variant === 'ghost',
    },
  ),
)
</script>

<template>
  <button :type="type" :disabled="disabled" :class="classes">
    <slot />
  </button>
</template>
