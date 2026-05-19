interface OptimizeImageOptions {
  dataUrl: string
  maxSize?: number
  mimeType?: string
  quality?: number
}

interface WorkerSuccessMessage {
  id: string
  ok: true
  buffer: ArrayBuffer
  mimeType: string
}

interface WorkerErrorMessage {
  id: string
  ok: false
  error: string
}

type WorkerResponse = WorkerSuccessMessage | WorkerErrorMessage

let worker: Worker | undefined

export async function optimizeImageDataUrl(options: OptimizeImageOptions): Promise<Blob> {
  if (!window.Worker || !('OffscreenCanvas' in window)) {
    return dataUrlToBlob(options.dataUrl)
  }

  worker ??= new Worker(new URL('../workers/imageProcessing.worker.ts', import.meta.url), {
    type: 'module',
  })

  const id = crypto.randomUUID()

  return new Promise<Blob>((resolve, reject) => {
    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) {
        return
      }

      worker?.removeEventListener('message', onMessage)

      if (!event.data.ok) {
        reject(new Error(event.data.error))
        return
      }

      resolve(new Blob([event.data.buffer], { type: event.data.mimeType }))
    }

    worker?.addEventListener('message', onMessage)
    worker?.postMessage({
      id,
      type: 'optimize-image',
      dataUrl: options.dataUrl,
      maxSize: options.maxSize ?? 1024,
      mimeType: options.mimeType ?? 'image/png',
      quality: options.quality ?? 0.92,
    })
  })
}

export function dataUrlToBlob(dataUrl: string) {
  const [header, payload] = dataUrl.split(',')
  const mimeType = header?.match(/data:(.*?);base64/)?.[1] ?? 'image/png'
  const binary = atob(payload ?? '')
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new Blob([bytes], { type: mimeType })
}

export async function urlToDataUrl(url: string): Promise<string> {
  const response = await fetch(url)
  const blob = await response.blob()

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
