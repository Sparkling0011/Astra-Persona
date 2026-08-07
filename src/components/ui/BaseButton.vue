<script setup lang="ts">
import { NButton } from 'naive-ui'
import { computed } from 'vue'

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

const naiveType = computed(() => (props.variant === 'primary' ? 'primary' : 'default'))
const secondary = computed(() => props.variant === 'secondary')
const quaternary = computed(() => props.variant === 'ghost')
</script>

<template>
  <NButton
    :type="naiveType"
    :secondary="secondary"
    :quaternary="quaternary"
    :native-type="type"
    :disabled="disabled"
    size="large"
    class="touch-manipulation"
  >
    <slot />
  </NButton>
</template>
