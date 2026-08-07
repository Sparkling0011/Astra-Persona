import type { GlobalThemeOverrides } from 'naive-ui'

const sharedOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#0f9f91',
    primaryColorHover: '#14b8a6',
    primaryColorPressed: '#0f766e',
    primaryColorSuppl: '#14b8a6',
    infoColor: '#6366f1',
    borderRadius: '6px',
    borderRadiusSmall: '5px',
    fontWeightStrong: '600',
    heightMedium: '40px',
    heightLarge: '44px',
  },
  Button: {
    borderRadiusMedium: '6px',
    borderRadiusLarge: '6px',
    heightMedium: '40px',
    heightLarge: '44px',
    fontWeight: '600',
  },
  Input: {
    borderRadius: '6px',
    heightMedium: '40px',
    heightLarge: '44px',
  },
  Select: {
    peers: {
      InternalSelection: {
        borderRadius: '6px',
        heightMedium: '40px',
        heightLarge: '44px',
      },
    },
  },
  Drawer: {
    borderRadius: '0px',
  },
  Progress: {
    fillColor: '#14b8a6',
    railColor: 'rgba(148, 163, 184, 0.16)',
  },
}

export const lightThemeOverrides: GlobalThemeOverrides = {
  ...sharedOverrides,
  common: {
    ...sharedOverrides.common,
    bodyColor: '#f8fafc',
    cardColor: 'rgba(255, 255, 255, 0.94)',
    modalColor: '#ffffff',
    popoverColor: '#ffffff',
    inputColor: 'rgba(255, 255, 255, 0.76)',
    actionColor: '#f1f5f9',
    hoverColor: 'rgba(15, 159, 145, 0.08)',
    borderColor: '#dbe3ec',
    dividerColor: '#e2e8f0',
    textColor1: '#0f172a',
    textColor2: '#334155',
    textColor3: '#64748b',
    placeholderColor: '#94a3b8',
    boxShadow2: '0 24px 80px -42px rgba(15, 23, 42, 0.42)',
  },
}

export const darkThemeOverrides: GlobalThemeOverrides = {
  ...sharedOverrides,
  common: {
    ...sharedOverrides.common,
    primaryColor: '#2dd4bf',
    primaryColorHover: '#5eead4',
    primaryColorPressed: '#14b8a6',
    primaryColorSuppl: '#2dd4bf',
    bodyColor: '#171a20',
    cardColor: 'rgba(30, 34, 42, 0.94)',
    modalColor: '#1e222a',
    popoverColor: '#20242d',
    inputColor: 'rgba(30, 34, 42, 0.78)',
    actionColor: '#252a34',
    hoverColor: 'rgba(45, 212, 191, 0.09)',
    borderColor: '#353b47',
    dividerColor: '#303641',
    textColor1: '#f8fafc',
    textColor2: '#d7dde6',
    textColor3: '#a8b0bd',
    placeholderColor: '#737d8c',
    boxShadow2: '0 28px 90px -44px rgba(0, 0, 0, 0.82)',
  },
  Progress: {
    fillColor: '#2dd4bf',
    railColor: 'rgba(148, 163, 184, 0.14)',
  },
}
