<script setup lang="ts">
import { Crop, Download, Eraser, ImagePlus, Save, Scissors, WandSparkles } from '@lucide/vue'
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import { aiService } from '@/services/aiService'
import type { PersonaBrand } from '@/types/persona'

const props = defineProps<{
  imageUrl: string
  brand: PersonaBrand
  disabled?: boolean
}>()

const emit = defineEmits<{
  save: [dataUrl: string]
  createVariant: [dataUrl: string]
}>()

type FilterMode = 'none' | 'mono' | 'warm' | 'cyber' | 'editorial'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
const sourceImage = ref<HTMLImageElement | null>(null)
const sourceDataUrl = ref('')
const filterMode = ref<FilterMode>('none')
const overlayText = ref('')
const watermark = ref('AI Persona')
const inpaintPrompt = ref('让选中区域更精致，保持原头像风格一致')
const selection = ref<Rect | null>(null)
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const isInpainting = ref(false)
const inpaintStatus = ref('')

const canUseSelection = computed(() => {
  const rect = selection.value
  return Boolean(rect && rect.width > 12 && rect.height > 12)
})

watch(
  () => props.imageUrl,
  async (url) => {
    sourceDataUrl.value = url
    selection.value = null
    await loadImage(url)
  },
  { immediate: true },
)

watch([filterMode, overlayText, watermark, selection], () => drawCanvas(), { deep: true })

onMounted(() => {
  void nextTick(() => drawCanvas())
})

async function loadImage(url: string) {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.decoding = 'async'

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('图片加载失败'))
    image.src = url
  })

  sourceImage.value = image
  drawCanvas()
}

function drawCanvas(showSelection = true) {
  const canvas = canvasRef.value
  const image = sourceImage.value

  if (!canvas || !image) {
    return
  }

  const ctx = canvas.getContext('2d')

  if (!ctx) {
    return
  }

  ctx.save()
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.filter = filterToCanvas(filterMode.value)
  drawImageCover(ctx, image, canvas.width, canvas.height)
  ctx.filter = 'none'
  drawOverlayText(ctx, canvas.width, canvas.height)
  drawWatermark(ctx, canvas.width, canvas.height)

  if (showSelection && selection.value) {
    drawSelection(ctx, selection.value)
  }

  ctx.restore()
}

function onPointerDown(event: PointerEvent) {
  if (props.disabled) {
    return
  }

  const point = getCanvasPoint(event)
  dragStart.value = point
  selection.value = { x: point.x, y: point.y, width: 1, height: 1 }
  isDragging.value = true
}

function onPointerMove(event: PointerEvent) {
  if (!isDragging.value) {
    return
  }

  const point = getCanvasPoint(event)
  const start = dragStart.value
  selection.value = normalizeRect({
    x: start.x,
    y: start.y,
    width: point.x - start.x,
    height: point.y - start.y,
  })
}

function onPointerUp() {
  isDragging.value = false
}

async function inpaintSelection() {
  const rect = selection.value

  if (!rect || !canUseSelection.value) {
    return
  }

  isInpainting.value = true
  inpaintStatus.value = '正在重绘选中区域'

  try {
    const originalDataUrl = getRenderedDataUrl(false)
    const maskDataUrl = createMaskDataUrl(rect)
    let nextDataUrl = ''

    if (import.meta.env.VITE_USE_REAL_AI === 'true' && import.meta.env.VITE_AI_IMAGE_API_KEY) {
      try {
        nextDataUrl = await aiService.inpaintImage({
          imageDataUrl: originalDataUrl,
          maskDataUrl,
          prompt: inpaintPrompt.value,
          onProgress: (progress) => {
            inpaintStatus.value = progress.message ?? '正在调用图像模型'
          },
        })
      } catch {
        nextDataUrl = createLocalInpaintDataUrl(rect)
      }
    } else {
      nextDataUrl = createLocalInpaintDataUrl(rect)
    }

    sourceDataUrl.value = nextDataUrl
    selection.value = null
    await loadImage(nextDataUrl)
  } finally {
    isInpainting.value = false
    inpaintStatus.value = ''
  }
}

async function cropToSelection() {
  const rect = selection.value

  if (!rect || !canUseSelection.value) {
    return
  }

  drawCanvas(false)

  const canvas = canvasRef.value
  const cropCanvas = document.createElement('canvas')
  const cropSize = 640
  cropCanvas.width = cropSize
  cropCanvas.height = cropSize
  const ctx = cropCanvas.getContext('2d')

  if (!canvas || !ctx) {
    return
  }

  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, cropSize, cropSize)
  ctx.drawImage(canvas, rect.x, rect.y, rect.width, rect.height, 0, 0, cropSize, cropSize)

  const dataUrl = cropCanvas.toDataURL('image/png')
  sourceDataUrl.value = dataUrl
  selection.value = null
  await loadImage(dataUrl)
}

function clearSelection() {
  selection.value = null
}

function saveToCurrent() {
  emit('save', getRenderedDataUrl(false))
}

function saveAsVariant() {
  emit('createVariant', getRenderedDataUrl(false))
}

function exportPng() {
  const dataUrl = createBrandedExport()
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = `${props.brand.username.replace('@', '') || 'persona'}-avatar.png`
  link.click()
}

function getRenderedDataUrl(showSelection: boolean) {
  drawCanvas(showSelection)
  return canvasRef.value?.toDataURL('image/png') ?? sourceDataUrl.value
}

function createLocalInpaintDataUrl(rect: Rect) {
  drawCanvas(false)
  const canvas = canvasRef.value
  const ctx = canvas?.getContext('2d')

  if (!canvas || !ctx) {
    return sourceDataUrl.value
  }

  const hue = hashText(inpaintPrompt.value + props.brand.id) % 360
  const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height)
  gradient.addColorStop(0, `hsl(${hue} 78% 58% / 0.92)`)
  gradient.addColorStop(1, `hsl(${(hue + 80) % 360} 84% 50% / 0.88)`)

  ctx.save()
  ctx.beginPath()
  roundRect(ctx, rect.x, rect.y, rect.width, rect.height, 18)
  ctx.clip()
  ctx.fillStyle = gradient
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
  ctx.globalAlpha = 0.22
  ctx.fillStyle = '#ffffff'

  for (let index = 0; index < 28; index += 1) {
    const x = rect.x + Math.random() * rect.width
    const y = rect.y + Math.random() * rect.height
    ctx.beginPath()
    ctx.arc(x, y, 2 + Math.random() * 9, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.globalAlpha = 0.32
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(rect.x + rect.width * 0.18, rect.y + rect.height * 0.72)
  ctx.bezierCurveTo(rect.x + rect.width * 0.36, rect.y + rect.height * 0.2, rect.x + rect.width * 0.68, rect.y + rect.height * 0.88, rect.x + rect.width * 0.86, rect.y + rect.height * 0.28)
  ctx.stroke()
  ctx.restore()

  return canvas.toDataURL('image/png')
}

function createMaskDataUrl(rect: Rect) {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 640
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    return ''
  }

  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height)

  return canvas.toDataURL('image/png')
}

function createBrandedExport() {
  const avatarDataUrl = getRenderedDataUrl(false)
  const exportCanvas = document.createElement('canvas')
  exportCanvas.width = 1080
  exportCanvas.height = 1350
  const ctx = exportCanvas.getContext('2d')

  if (!ctx) {
    return avatarDataUrl
  }

  const avatar = new Image()
  avatar.src = avatarDataUrl

  ctx.fillStyle = '#07111f'
  ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height)
  ctx.fillStyle = '#14b8a6'
  ctx.fillRect(0, 0, exportCanvas.width, 12)
  ctx.fillStyle = '#0f172a'
  roundRect(ctx, 90, 80, 900, 900, 32)
  ctx.fill()
  ctx.drawImage(canvasRef.value as HTMLCanvasElement, 120, 110, 840, 840)
  ctx.fillStyle = '#f8fafc'
  ctx.font = '700 54px Inter, system-ui, sans-serif'
  ctx.fillText(props.brand.nickname, 90, 1060)
  ctx.fillStyle = '#2dd4bf'
  ctx.font = '500 34px Inter, system-ui, sans-serif'
  ctx.fillText(props.brand.username, 90, 1110)
  ctx.fillStyle = '#cbd5e1'
  ctx.font = '400 30px Inter, system-ui, sans-serif'
  drawWrappedText(ctx, props.brand.signature, 90, 1180, 900, 42)
  ctx.fillStyle = '#64748b'
  ctx.font = '500 24px Inter, system-ui, sans-serif'
  ctx.fillText(props.brand.tags.slice(0, 4).map((tag) => `#${tag}`).join('  '), 90, 1300)

  return exportCanvas.toDataURL('image/png')
}

function getCanvasPoint(event: PointerEvent) {
  const canvas = canvasRef.value
  const rect = canvas?.getBoundingClientRect()

  if (!canvas || !rect) {
    return { x: 0, y: 0 }
  }

  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * canvas.width, 0, canvas.width),
    y: clamp(((event.clientY - rect.top) / rect.height) * canvas.height, 0, canvas.height),
  }
}

function normalizeRect(rect: Rect): Rect {
  return {
    x: rect.width < 0 ? rect.x + rect.width : rect.x,
    y: rect.height < 0 ? rect.y + rect.height : rect.y,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  }
}

function drawImageCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
}

function drawOverlayText(ctx: CanvasRenderingContext2D, width: number, height: number) {
  if (!overlayText.value.trim()) {
    return
  }

  ctx.fillStyle = 'rgb(248 250 252 / 0.94)'
  ctx.strokeStyle = 'rgb(15 23 42 / 0.72)'
  ctx.lineWidth = 8
  ctx.font = '700 44px Inter, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.strokeText(overlayText.value, width / 2, height - 86)
  ctx.fillText(overlayText.value, width / 2, height - 86)
}

function drawWatermark(ctx: CanvasRenderingContext2D, width: number, height: number) {
  if (!watermark.value.trim()) {
    return
  }

  ctx.fillStyle = 'rgb(15 23 42 / 0.58)'
  ctx.fillRect(28, height - 64, width - 56, 36)
  ctx.fillStyle = 'rgb(248 250 252 / 0.82)'
  ctx.font = '500 20px Inter, system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(watermark.value, width - 46, height - 40)
}

function drawSelection(ctx: CanvasRenderingContext2D, rect: Rect) {
  ctx.save()
  ctx.strokeStyle = '#2dd4bf'
  ctx.lineWidth = 3
  ctx.setLineDash([12, 8])
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)
  ctx.fillStyle = 'rgb(45 212 191 / 0.12)'
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
  ctx.restore()
}

function filterToCanvas(mode: FilterMode) {
  const filters: Record<FilterMode, string> = {
    none: 'none',
    mono: 'grayscale(1) contrast(1.1)',
    warm: 'sepia(0.28) saturate(1.18) brightness(1.04)',
    cyber: 'saturate(1.45) contrast(1.12) hue-rotate(18deg)',
    editorial: 'contrast(1.08) brightness(1.06) saturate(0.92)',
  }

  return filters[mode]
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

function drawWrappedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split('')
  let line = ''
  let lineY = y

  for (const word of words) {
    const nextLine = line + word

    if (ctx.measureText(nextLine).width > maxWidth && line) {
      ctx.fillText(line, x, lineY)
      line = word
      lineY += lineHeight
    } else {
      line = nextLine
    }
  }

  ctx.fillText(line, x, lineY)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function hashText(text: string) {
  return [...text].reduce((hash, char) => hash + char.charCodeAt(0), 0)
}
</script>

<template>
  <div class="grid gap-4 rounded-lg border border-border bg-background/80 p-4">
    <div class="grid gap-4 lg:grid-cols-[minmax(280px,420px)_1fr]">
      <div class="grid gap-3">
        <div class="relative overflow-hidden rounded-lg border border-border bg-muted">
          <canvas
            ref="canvasRef"
            width="640"
            height="640"
            class="aspect-square w-full cursor-crosshair touch-none"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointerleave="onPointerUp"
          />
        </div>
        <p class="text-xs leading-5 text-muted-foreground">
          在画布上拖拽框选区域，然后点击“局部重绘”或“裁剪到选区”。
        </p>
      </div>

      <div class="grid gap-4">
        <div class="grid gap-2">
          <span class="text-sm font-medium">滤镜</span>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <button
              v-for="mode in [
                ['none', '原图'],
                ['mono', '黑白'],
                ['warm', '暖调'],
                ['cyber', '霓虹'],
                ['editorial', '杂志'],
              ]"
              :key="mode[0]"
              class="h-9 rounded-md border px-2 text-xs transition"
              :class="filterMode === mode[0] ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted'"
              @click="filterMode = mode[0] as FilterMode"
            >
              {{ mode[1] }}
            </button>
          </div>
        </div>

        <label class="grid gap-2 text-sm font-medium">
          <span>添加文字</span>
          <input v-model="overlayText" class="h-10 rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="例如：Nova" />
        </label>

        <label class="grid gap-2 text-sm font-medium">
          <span>水印</span>
          <input v-model="watermark" class="h-10 rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="品牌水印" />
        </label>

        <label class="grid gap-2 text-sm font-medium">
          <span>局部重绘 Prompt</span>
          <textarea
            v-model="inpaintPrompt"
            rows="3"
            class="resize-none rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>

        <div v-if="inpaintStatus" class="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
          {{ inpaintStatus }}
        </div>

        <div class="grid grid-cols-2 gap-2">
          <button class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm hover:bg-muted disabled:opacity-50" :disabled="!canUseSelection || disabled || isInpainting" @click="inpaintSelection">
            <WandSparkles class="size-4" />
            局部重绘
          </button>
          <button class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm hover:bg-muted disabled:opacity-50" :disabled="!canUseSelection || disabled" @click="cropToSelection">
            <Crop class="size-4" />
            裁剪到选区
          </button>
          <button class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm hover:bg-muted disabled:opacity-50" :disabled="!canUseSelection" @click="clearSelection">
            <Eraser class="size-4" />
            清除选区
          </button>
          <button class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm hover:bg-muted" @click="saveAsVariant">
            <ImagePlus class="size-4" />
            新变体
          </button>
        </div>

        <div class="flex flex-wrap gap-2">
          <button class="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90" @click="saveToCurrent">
            <Save class="size-4" />
            保存当前
          </button>
          <button class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium hover:bg-muted" @click="exportPng">
            <Download class="size-4" />
            导出 PNG
          </button>
          <button class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium hover:bg-muted" :disabled="!canUseSelection" @click="cropToSelection">
            <Scissors class="size-4" />
            裁切头像
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
