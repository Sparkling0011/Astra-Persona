import JSZip from 'jszip'
import QRCode from 'qrcode'

import { optimizeImageDataUrl, urlToDataUrl } from '@/services/imageWorkerClient'
import type { Persona, PersonaExportKit } from '@/types/persona'

interface SharePayload {
  id: string
  url: string
  qrCodeDataUrl: string
}

export async function exportPersonaZip(persona: Persona): Promise<Blob> {
  const zip = new JSZip()
  const kit: PersonaExportKit = {
    persona,
    exportedAt: new Date().toISOString(),
    formatVersion: '1.0',
  }

  zip.file('persona-kit.json', JSON.stringify(kit, null, 2))
  zip.file('README.txt', createKitReadme(persona))

  for (const [index, avatar] of persona.avatars.entries()) {
    try {
      // Remote avatars are normalized to PNG blobs so the exported kit is self-contained.
      const dataUrl = avatar.url.startsWith('data:') ? avatar.url : await urlToDataUrl(avatar.url)
      const blob = await optimizeImageDataUrl({
        dataUrl,
        maxSize: 1200,
        mimeType: 'image/png',
      })
      zip.file(`avatars/${String(index + 1).padStart(2, '0')}-${slugify(avatar.label)}.png`, blob)
    } catch {
      zip.file(`avatars/${String(index + 1).padStart(2, '0')}-${slugify(avatar.label)}.url.txt`, avatar.url)
    }
  }

  return zip.generateAsync({ type: 'blob' })
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export async function createShareLink(persona: Persona): Promise<SharePayload> {
  const id = `share_${crypto.randomUUID()}`
  const payload = {
    id,
    persona,
    createdAt: new Date().toISOString(),
  }

  localStorage.setItem(id, JSON.stringify(payload))

  const url = new URL(window.location.href)
  url.searchParams.set('share', id)
  const shareUrl = url.toString()

  return {
    id,
    url: shareUrl,
    qrCodeDataUrl: await QRCode.toDataURL(shareUrl, {
      width: 220,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    }),
  }
}

function createKitReadme(persona: Persona) {
  return [
    `Astra Persona Asset Kit: ${persona.nickname}`,
    '',
    `Username: ${persona.username}`,
    `Signature: ${persona.signature}`,
    '',
    'Tags:',
    persona.tags.map((tag) => `- ${tag}`).join('\n'),
    '',
    'Profile Bio:',
    persona.bio || persona.bios[0]?.content || '',
  ].join('\n')
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^\da-z\u4e00-\u9fa5]+/gi, '-')
    .replace(/(^-|-$)/g, '')
}
