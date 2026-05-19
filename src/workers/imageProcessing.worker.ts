interface OptimizeImageMessage {
  id: string
  type: 'optimize-image'
  dataUrl: string
  maxSize: number
  mimeType: string
  quality: number
}

type WorkerMessage = OptimizeImageMessage

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null
  postMessage: (message: unknown, transfer?: Transferable[]) => void
}

workerScope.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data

  if (message.type !== 'optimize-image') {
    return
  }

  try {
    const blob = await fetch(message.dataUrl).then((response) => response.blob())
    const bitmap = await createImageBitmap(blob)
    // Downscale large avatars off the main thread before they are added to the ZIP package.
    const scale = Math.min(1, message.maxSize / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      throw new Error('OffscreenCanvas is not available')
    }

    ctx.drawImage(bitmap, 0, 0, width, height)
    const optimizedBlob = await canvas.convertToBlob({
      type: message.mimeType,
      quality: message.quality,
    })
    const arrayBuffer = await optimizedBlob.arrayBuffer()

    workerScope.postMessage(
      {
        id: message.id,
        ok: true,
        buffer: arrayBuffer,
        mimeType: optimizedBlob.type,
      },
      [arrayBuffer],
    )
  } catch (error) {
    workerScope.postMessage({
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Image worker failed',
    })
  }
}
