<script setup lang="ts" generic="T extends { id: string }">
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    items: T[]
    itemHeight: number
    height: number
    overscan?: number
  }>(),
  {
    overscan: 4,
  },
)

const scrollTop = ref(0)

const totalHeight = computed(() => props.items.length * props.itemHeight)
const startIndex = computed(() => Math.max(0, Math.floor(scrollTop.value / props.itemHeight) - props.overscan))
const visibleCount = computed(() => Math.ceil(props.height / props.itemHeight) + props.overscan * 2)
const visibleItems = computed(() => props.items.slice(startIndex.value, startIndex.value + visibleCount.value))
const offsetY = computed(() => startIndex.value * props.itemHeight)

function handleScroll(event: Event) {
  scrollTop.value = (event.target as HTMLElement).scrollTop
}
</script>

<template>
  <div class="overflow-y-auto overscroll-contain pr-1" :style="{ height: `${height}px` }" @scroll="handleScroll">
    <div class="relative" :style="{ height: `${totalHeight}px` }">
      <div class="absolute inset-x-0 top-0 grid gap-3" :style="{ transform: `translateY(${offsetY}px)` }">
        <slot v-for="item in visibleItems" :key="item.id" :item="item" />
      </div>
    </div>
  </div>
</template>
