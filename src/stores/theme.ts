import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

type ThemeMode = 'light' | 'dark'

const storageKey = 'ai-persona-theme'

export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>(readInitialTheme())
  const isDark = computed(() => mode.value === 'dark')

  function setMode(nextMode: ThemeMode) {
    mode.value = nextMode
  }

  function toggleTheme() {
    mode.value = isDark.value ? 'light' : 'dark'
  }

  watch(
    mode,
    (nextMode) => {
      document.documentElement.classList.toggle('dark', nextMode === 'dark')
      localStorage.setItem(storageKey, nextMode)
    },
    { immediate: true },
  )

  return {
    mode,
    isDark,
    setMode,
    toggleTheme,
  }
})

function readInitialTheme(): ThemeMode {
  const stored = localStorage.getItem(storageKey)

  if (stored === 'light' || stored === 'dark') {
    return stored
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
