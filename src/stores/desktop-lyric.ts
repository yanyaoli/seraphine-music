import {
  LyricAccentColor,
  LyricBaseColor,
  LyricFontSize,
  LyricOffset,
  LyricTransMode
} from '@/utils/params'

export const useDesktopLyricStore = defineStore(
  'desktop-lyric',
  () => {
    const isLocked = ref(false) // 是否锁定
    const fontFamily = ref<FontValue>('system-ui') // 字体类型
    const fontSize = ref(LyricFontSize.Default) // 字体大小
    const textColors = ref<TextColors>([LyricBaseColor.Blue, LyricAccentColor.Blue]) // 文本颜色
    const transMode = ref(LyricTransMode.Off) // 翻译文本
    const offsetMap = ref<Record<ID, number>>({}) // 进度偏移量列表(s)

    const toggleLockState = () => (isLocked.value = !isLocked.value)
    const setFontFamily = (newFontFamily: FontValue) => (fontFamily.value = newFontFamily)
    const setFontSize = (mode: 'add' | 'sub' | 'restart') => {
      switch (mode) {
        case 'add':
          fontSize.value += LyricFontSize.Step
          break
        case 'sub':
          fontSize.value -= LyricFontSize.Step
          break
        case 'restart':
          fontSize.value = LyricFontSize.Default
          break
      }
    }
    const setTextColors = (newTextColors: TextColors) => (textColors.value = newTextColors)
    const setTransMode = (newMode: LyricTransMode) => (transMode.value = newMode)
    const setOffsetMap = (mode: 'add' | 'sub' | 'restart', id: ID) => {
      if (!id) return

      let offset = offsetMap.value[id] || LyricOffset.Default

      switch (mode) {
        case 'add':
          offset += LyricOffset.Step
          break
        case 'sub':
          offset -= LyricOffset.Step
          break
        case 'restart':
          offset = LyricOffset.Default
          break
      }

      offsetMap.value[id] = offset
    }

    return {
      isLocked,
      fontSize,
      fontFamily,
      textColors,
      transMode,
      offsetMap,

      toggleLockState,
      setFontSize,
      setFontFamily,
      setTextColors,
      setTransMode,
      setOffsetMap
    }
  },
  {
    persist: {
      key: 'desktop-lyric-store',
      pick: ['isLocked', 'fontSize', 'fontFamily', 'textColors', 'transMode', 'offsetMap']
    }
  }
)
