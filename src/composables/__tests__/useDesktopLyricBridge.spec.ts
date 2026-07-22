import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDesktopLyricBridge } from '@/composables/useDesktopLyricBridge'
import { LyricEmitType, WindowEvent, WindowName } from '@/utils/params'

// ─── Mock Tauri 依赖 ───

const mockTauri = vi.hoisted(() => ({
  emitTo: vi.fn(),
  listen: vi.fn().mockResolvedValue(vi.fn()),
  getByLabel: vi.fn(() => ({}) as any), // 默认窗口已打开
  show: vi.fn(),
}))

vi.mock('@tauri-apps/api/event', () => ({
  emitTo: mockTauri.emitTo,
  listen: mockTauri.listen,
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: { getByLabel: mockTauri.getByLabel },
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({ show: mockTauri.show })),
}))

// ─── Mock Store 依赖 ───
// storeRef 通过 vi.hoisted 确保在 vi.mock 之前可用，tests 通过它重置状态

const storeRef = vi.hoisted(() => ({ music: null as any, lyric: null as any }))

vi.mock('@/stores/music', async () => {
  const { reactive } = await import('vue')
  const store = reactive({
    isPlaying: false,
    isLoading: false,
    playProgress: 0,
    music: null as any,
    origin: 0,
    play: vi.fn(),
    pause: vi.fn(),
    playPrevOrNext: vi.fn(),
  })
  storeRef.music = store
  return { useMusicStore: () => store }
})

vi.mock('@/stores/lyric-main', async () => {
  const { reactive } = await import('vue')
  const store = reactive({
    lyric: undefined as any,
    offset: 0,
    setting: { transMode: 0, fontFamily: 'system-ui', fontSize: 24, textColor: '#3b82f6', textAlign: 'text-left' },
    setOffsetMap: vi.fn(),
  })
  storeRef.lyric = store
  return { useMainLyricStore: () => store }
})

// ─── Helpers ───

const flushWatchers = async () => {
  await vi.advanceTimersByTimeAsync(200)
}

const getMusicStore = () => storeRef.music
const getLyricStore = () => storeRef.lyric

// ─── Tests ───

describe('useDesktopLyricBridge', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    // 显式重置 mock 行为
    mockTauri.getByLabel.mockReturnValue({} as any)
    mockTauri.listen.mockResolvedValue(vi.fn())
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('生命周期', () => {
    it('start() 注册 listen', async () => {
      const bridge = useDesktopLyricBridge(onClose)
      await bridge.start()

      expect(mockTauri.listen).toHaveBeenCalledWith(WindowEvent.DesktopLyric, expect.any(Function))
    })
  })

  describe('状态变化推送', () => {
    it('playProgress + lyric 变化时推送 PushState', async () => {
      const bridge = useDesktopLyricBridge(onClose)
      await bridge.start()

      const musicStore = getMusicStore()
      const lyricStore = getLyricStore()
      lyricStore.lyric = {
        id: 'lyric-1',
        fmt: 'Krc',
        lines: [
          { offset: 0, duration: 5000, words: [{ offset: 0, duration: 5000, text: 'Hello' }] },
        ],
      }
      musicStore.playProgress = 5

      await flushWatchers()
      expect(mockTauri.emitTo).toHaveBeenCalledWith(
        WindowName.DesktopLyric,
        WindowEvent.DesktopLyric,
        expect.objectContaining({ type: LyricEmitType.PushState })
      )
    })

    it('isPlaying 变化时触发推送', async () => {
      const bridge = useDesktopLyricBridge(onClose)
      await bridge.start()

      getMusicStore().isPlaying = true
      await flushWatchers()

      expect(mockTauri.emitTo).toHaveBeenCalledWith(
        WindowName.DesktopLyric,
        WindowEvent.DesktopLyric,
        expect.objectContaining({ type: LyricEmitType.PushState })
      )
    })

    it('transMode 变化时触发推送', async () => {
      const bridge = useDesktopLyricBridge(onClose)
      await bridge.start()

      getLyricStore().setting.transMode = 1
      await flushWatchers()

      expect(mockTauri.emitTo).toHaveBeenCalledWith(
        WindowName.DesktopLyric,
        WindowEvent.DesktopLyric,
        expect.objectContaining({ type: LyricEmitType.PushState })
      )
    })

    it('窗口未打开时不推送', async () => {
      mockTauri.getByLabel.mockReturnValue(null)
      const bridge = useDesktopLyricBridge(onClose)
      await bridge.start()

      getMusicStore().isPlaying = true
      await flushWatchers()

      expect(mockTauri.emitTo).not.toHaveBeenCalled()
    })

    it('stop() 清理后 watcher 不再触发', async () => {
      const bridge = useDesktopLyricBridge(onClose)
      await bridge.start()
      bridge.stop()

      getMusicStore().isPlaying = true
      await flushWatchers()

      expect(mockTauri.emitTo).not.toHaveBeenCalled()
    })
  })

  describe('action 事件处理', () => {
    it('GetLyric 请求时响应 SendLyric', async () => {
      const bridge = useDesktopLyricBridge(onClose)
      await bridge.start()

      const listenCallback = mockTauri.listen.mock.calls[0][1]
      listenCallback({ payload: { type: LyricEmitType.GetLyric } })

      expect(mockTauri.emitTo).toHaveBeenCalledWith(
        WindowName.DesktopLyric,
        WindowEvent.DesktopLyric,
        expect.objectContaining({ type: LyricEmitType.SendLyric })
      )
    })

    it.each([
      ['Play', LyricEmitType.Play, 'play'],
      ['Pause', LyricEmitType.Pause, 'pause'],
      ['Prev', LyricEmitType.Prev, 'prev'],
      ['Next', LyricEmitType.Next, 'next'],
    ])('收到 %s 事件时调用对应方法', async (_label, type) => {
      const musicStore = getMusicStore()
      // bridge 在 beforeEach 的 clearAllMocks 之后使用 store，
      // store 的 play/pause 等是 vi.fn() 实例，经过 reset 后需要重新获取
      const bridge = useDesktopLyricBridge(onClose)
      await bridge.start()

      const listenCallback = mockTauri.listen.mock.calls[0][1]
      listenCallback({ payload: { type } })

      switch (type) {
        case LyricEmitType.Play: expect(musicStore.play).toHaveBeenCalled(); break
        case LyricEmitType.Pause: expect(musicStore.pause).toHaveBeenCalled(); break
        case LyricEmitType.Prev: expect(musicStore.playPrevOrNext).toHaveBeenCalledWith('prev'); break
        case LyricEmitType.Next: expect(musicStore.playPrevOrNext).toHaveBeenCalledWith('next'); break
      }
    })

    it.each([
      ['OffsetForward', LyricEmitType.OffsetForward, 'add'],
      ['OffsetBackward', LyricEmitType.OffsetBackward, 'sub'],
    ])('收到 %s 事件时调用 setOffsetMap(%s)', async (_label, type, mode) => {
      const lyricStore = getLyricStore()
      const bridge = useDesktopLyricBridge(onClose)
      await bridge.start()

      const listenCallback = mockTauri.listen.mock.calls[0][1]
      listenCallback({ payload: { type } })

      expect(lyricStore.setOffsetMap).toHaveBeenCalledWith(mode)
    })

    it('收到 Main 事件时显示主窗口', async () => {
      const bridge = useDesktopLyricBridge(onClose)
      await bridge.start()

      const listenCallback = mockTauri.listen.mock.calls[0][1]
      listenCallback({ payload: { type: LyricEmitType.Main } })

      expect(mockTauri.show).toHaveBeenCalled()
    })

    it('收到 Close 事件时调用 onClose', async () => {
      const bridge = useDesktopLyricBridge(onClose)
      await bridge.start()

      const listenCallback = mockTauri.listen.mock.calls[0][1]
      listenCallback({ payload: { type: LyricEmitType.Close } })

      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('工具方法', () => {
    it('isLyricOpen() 返回窗口是否存在', () => {
      mockTauri.getByLabel.mockReturnValue({} as any)
      const bridge = useDesktopLyricBridge(onClose)
      expect(bridge.isLyricOpen()).toBe(true)

      mockTauri.getByLabel.mockReturnValue(null)
      expect(bridge.isLyricOpen()).toBe(false)
    })

    it('pushNow() 立即推送当前状态', async () => {
      const bridge = useDesktopLyricBridge(onClose)
      await bridge.start()

      bridge.pushNow()

      expect(mockTauri.emitTo).toHaveBeenCalledWith(
        WindowName.DesktopLyric,
        WindowEvent.DesktopLyric,
        expect.objectContaining({ type: LyricEmitType.PushState })
      )
    })
  })
})
