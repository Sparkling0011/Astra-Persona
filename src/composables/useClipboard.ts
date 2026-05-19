import { ref } from 'vue'

export function useClipboard() {
  const copied = ref(false)

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text)
    copied.value = true
    window.setTimeout(() => {
      copied.value = false
    }, 1400)
  }

  return {
    copied,
    copyText,
  }
}
