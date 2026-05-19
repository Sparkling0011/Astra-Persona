<script setup lang="ts">
import { Crosshair, LocateFixed, Minus, Plus, RefreshCw, ScanSearch } from '@lucide/vue'
import { computed, ref } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import { usePersonaStore } from '@/stores/persona'
import type { PersonaBrand } from '@/types/persona'

interface Point {
  x: number
  y: number
}

interface Selection {
  x: number
  y: number
  width: number
  height: number
}

const props = defineProps<{
  brand: PersonaBrand | undefined
  loading: boolean
}>()

const personaStore = usePersonaStore()
const stageRef = ref<HTMLElement | null>(null)
const pan = ref<Point>({ x: 0, y: 0 })
const zoom = ref(1)
const isPanning = ref(false)
const isSelecting = ref(false)
const lastPoint = ref<Point>({ x: 0, y: 0 })
const selectStart = ref<Point>({ x: 0, y: 0 })
const selection = ref<Selection | null>(null)

const selectedAvatar = computed(() => props.brand?.avatars.find((avatar) => avatar.id === props.brand?.selectedAvatarId) ?? props.brand?.avatars[0])

const canvasTransform = computed(() => ({
  transform: `translate(-50%, -50%) translate(${pan.value.x}px, ${pan.value.y}px) scale(${zoom.value})`,
  transformOrigin: 'center center',
}))

function zoomIn() {
  zoom.value = Math.min(zoom.value + 0.12, 2.2)
}

function zoomOut() {
  zoom.value = Math.max(zoom.value - 0.12, 0.55)
}

function resetView() {
  zoom.value = 1
  pan.value = { x: 0, y: 0 }
  selection.value = null
}

function handleWheel(event: WheelEvent) {
  event.preventDefault()
  zoom.value = Math.min(2.2, Math.max(0.55, zoom.value - event.deltaY * 0.0012))
}

function onPointerDown(event: PointerEvent) {
  const point = getPoint(event)
  lastPoint.value = { x: event.clientX, y: event.clientY }

  if (event.altKey || event.button === 1) {
    isPanning.value = true
    return
  }

  isSelecting.value = true
  selectStart.value = point
  selection.value = { x: point.x, y: point.y, width: 1, height: 1 }
}

function onPointerMove(event: PointerEvent) {
  const point = getPoint(event)

  if (isPanning.value) {
    pan.value = {
      x: pan.value.x + event.clientX - lastPoint.value.x,
      y: pan.value.y + event.clientY - lastPoint.value.y,
    }
    lastPoint.value = { x: event.clientX, y: event.clientY }
    return
  }

  if (isSelecting.value) {
    selection.value = normalizeSelection(selectStart.value, point)
  }
}

function onPointerUp() {
  isPanning.value = false
  isSelecting.value = false
}

async function inpaintSelection() {
  if (!props.brand || !selectedAvatar.value || !selection.value) {
    return
  }

  const dataUrl = await createSelectionVariant()
  personaStore.addAvatarVariant(dataUrl, '局部重绘')
  selection.value = null
}

async function createSelectionVariant() {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = selectedAvatar.value?.url ?? ''
  await image.decode()

  const canvas = document.createElement('canvas')
  canvas.width = 960
  canvas.height = 960
  const ctx = canvas.getContext('2d')

  if (!ctx || !selection.value) {
    return selectedAvatar.value?.url ?? ''
  }

  ctx.fillStyle = '#020617'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const rect = stageSelectionToImage(selection.value)
  const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height)
  gradient.addColorStop(0, 'rgba(45, 212, 191, 0.92)')
  gradient.addColorStop(1, 'rgba(129, 140, 248, 0.86)')
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = gradient
  roundRect(ctx, rect.x, rect.y, rect.width, rect.height, 28)
  ctx.fill()
  ctx.globalAlpha = 0.28
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(rect.x + rect.width * 0.2, rect.y + rect.height * 0.68)
  ctx.bezierCurveTo(rect.x + rect.width * 0.35, rect.y + rect.height * 0.22, rect.x + rect.width * 0.68, rect.y + rect.height * 0.88, rect.x + rect.width * 0.84, rect.y + rect.height * 0.24)
  ctx.stroke()
  ctx.restore()

  return canvas.toDataURL('image/png')
}

function stageSelectionToImage(rect: Selection) {
  const stage = stageRef.value?.getBoundingClientRect()
  const baseSize = Math.min(stage?.width ?? 960, stage?.height ?? 960) * 0.72
  const renderedSize = baseSize * zoom.value
  const left = ((stage?.width ?? 0) - renderedSize) / 2 + pan.value.x
  const top = ((stage?.height ?? 0) - renderedSize) / 2 + pan.value.y
  const scale = 960 / renderedSize

  return {
    x: clamp((rect.x - left) * scale, 0, 960),
    y: clamp((rect.y - top) * scale, 0, 960),
    width: clamp(rect.width * scale, 16, 960),
    height: clamp(rect.height * scale, 16, 960),
  }
}

function getPoint(event: PointerEvent): Point {
  const rect = stageRef.value?.getBoundingClientRect()

  return {
    x: event.clientX - (rect?.left ?? 0),
    y: event.clientY - (rect?.top ?? 0),
  }
}

function normalizeSelection(start: Point, end: Point): Selection {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
</script>

<template>
  <section class="glass-panel glow-card relative grid h-full min-h-[620px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg xl:min-h-0">
    <div class="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:42px_42px] opacity-40" />
    <div class="pointer-events-none absolute inset-x-8 top-8 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />

    <div class="relative z-10 flex items-center justify-between gap-3 border-b border-white/10 p-4">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.24em] text-primary">Visual Canvas</p>
        <h1 class="mt-1 text-xl font-semibold tracking-normal text-foreground">主视觉画布</h1>
      </div>
      <div class="flex items-center gap-2">
        <BaseButton variant="ghost" @click="zoomOut">
          <Minus class="size-4" />
        </BaseButton>
        <span class="w-12 text-center text-xs tabular-nums text-muted-foreground">{{ Math.round(zoom * 100) }}%</span>
        <BaseButton variant="ghost" @click="zoomIn">
          <Plus class="size-4" />
        </BaseButton>
        <BaseButton variant="secondary" @click="resetView">
          <LocateFixed class="size-4" />
        </BaseButton>
      </div>
    </div>

    <div
      ref="stageRef"
      class="relative z-10 min-h-[520px] cursor-crosshair touch-none overflow-hidden xl:min-h-0"
      @wheel="handleWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onPointerUp"
    >
      <div v-if="selectedAvatar" class="absolute left-1/2 top-1/2 grid aspect-square w-[72%] max-w-[680px] place-items-center transition-transform duration-100" :style="canvasTransform">
        <div class="absolute inset-0 rounded-lg border border-primary/30 bg-primary/5 blur-sm" />
        <img class="relative z-10 aspect-square w-full rounded-lg border border-white/10 bg-slate-950/50 p-4 shadow-[0_30px_120px_-56px_rgb(45_212_191/0.9)]" :src="selectedAvatar.url" :alt="selectedAvatar.label" decoding="async" />
      </div>

      <div v-else class="absolute inset-0 grid place-items-center p-8 text-center">
        <div>
          <span class="mx-auto grid size-16 place-items-center rounded-md border border-primary/30 bg-primary/10 text-primary">
            <ScanSearch class="size-8" />
          </span>
          <h2 class="mt-5 text-2xl font-semibold tracking-normal">尚未生成视觉资产</h2>
          <p class="mt-3 text-sm text-muted-foreground">完成左侧身份设定后，头像将在此处实时预览。</p>
        </div>
      </div>

      <div
        v-if="selection"
        class="pointer-events-none absolute rounded-md border-2 border-primary bg-primary/15 shadow-[0_0_32px_rgb(45_212_191/0.45)]"
        :style="{ left: `${selection.x}px`, top: `${selection.y}px`, width: `${selection.width}px`, height: `${selection.height}px` }"
      />
    </div>

    <div class="relative z-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-4">
      <div class="flex items-center gap-2 text-xs text-muted-foreground">
        <Crosshair class="size-4 text-primary" />
        框选区域可局部重绘，按住 Alt 拖动画布，滚轮缩放。
      </div>
      <div class="flex gap-2">
        <BaseButton variant="secondary" :disabled="!selection || loading" @click="inpaintSelection">
          <RefreshCw class="size-4" />
          重绘区域
        </BaseButton>
        <BaseButton variant="secondary" :disabled="loading" @click="personaStore.regenerateSection('avatar')">
          <ScanSearch class="size-4" />
          生成变体
        </BaseButton>
      </div>
    </div>
  </section>
</template>
