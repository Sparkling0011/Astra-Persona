<script setup lang="ts">
import { darkTheme, NConfigProvider, NDialogProvider, NMessageProvider, NNotificationProvider } from 'naive-ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import { darkThemeOverrides, lightThemeOverrides } from '@/config/naiveTheme'
import AppLayout from '@/layouts/AppLayout.vue'
import { useThemeStore } from '@/stores/theme'

const themeStore = useThemeStore()
const { isDark } = storeToRefs(themeStore)
const naiveTheme = computed(() => (isDark.value ? darkTheme : null))
const naiveThemeOverrides = computed(() => (isDark.value ? darkThemeOverrides : lightThemeOverrides))
</script>

<template>
  <NConfigProvider :theme="naiveTheme" :theme-overrides="naiveThemeOverrides">
    <NDialogProvider>
      <NMessageProvider placement="top-right" :max="3">
        <NNotificationProvider placement="top-right" :max="3">
          <AppLayout>
            <RouterView />
          </AppLayout>
        </NNotificationProvider>
      </NMessageProvider>
    </NDialogProvider>
  </NConfigProvider>
</template>
