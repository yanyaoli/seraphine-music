import { useListStore } from '@/stores/list'
import { useMainLyricStore } from '@/stores/lyric'
import { useMusicStore } from '@/stores/music'
import { useSettingStore } from '@/stores/setting'
import { DesktopMiniEmit, Interval, WindowEvent, WindowName } from '@/utils/params'
import { getPlayingOrigin } from '@/utils/tools'
import { emitTo, listen } from '@tauri-apps/api/event'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { PhysicalPosition, Window } from '@tauri-apps/api/window'
import { watchThrottled } from '@vueuse/core'

const FORWARD_DURATION = 150 // 歌词提前滚动时间 (ms)

export function useDesktopMiniBridge(
  miniWindow: Ref<WebviewWindow | undefined>,
  mainWindow: Window
) {
  const musicStore = useMusicStore()
  const lyricStore = useMainLyricStore()
  const listStore = useListStore()
  const settingStore = useSettingStore()

  const stopFns: (() => void)[] = []

  const syncAudio = async () => {
    const data: DesktopMiniAudio = {
      isLoading: musicStore.isLoading,
      isPlaying: musicStore.isPlaying,
      music: musicStore.music,
      origin: musicStore.origin
    }
    emitTo(WindowName.DesktopMini, WindowEvent.DesktopMini, { type: DesktopMiniEmit.Audio, data })
  }

  const syncPlaylist = () => {
    emitTo(WindowName.DesktopMini, WindowEvent.DesktopMini, {
      type: DesktopMiniEmit.Playlist,
      data: listStore.play.list
    })
  }

  const syncLyric = () => {
    if (!lyricStore.lyric) return

    const lines = lyricStore.lyric.lines
    const pg = (musicStore.playProgress + lyricStore.offset) * 1000 + FORWARD_DURATION

    let text = ''
    for (let i = 0; i < lines.length; i++) {
      if (pg < lines[i].offset || pg > (lines[i + 1]?.offset || Infinity)) continue

      text = lines[i].words.map((word) => word.text).join('')
      break
    }

    emitTo(WindowName.DesktopMini, WindowEvent.DesktopMini, {
      type: DesktopMiniEmit.Lyric,
      data: text
    })
  }

  /** 启动桥接 */
  const start = async () => {
    const unwatchAudio = watch(
      [() => musicStore.isLoading, () => musicStore.isPlaying, () => musicStore.music],
      syncAudio
    )
    const unwatchPlaylist = watch(() => listStore.play.list, syncPlaylist)
    const unwatchLyric = watchThrottled(
      [() => musicStore.playProgress, () => lyricStore.lyric, () => lyricStore.offset],
      syncLyric,
      { throttle: Interval.Long }
    )
    const unlistenAction = await listen<{ type: DesktopMiniEmit; data: unknown }>(
      WindowEvent.DesktopMini,
      (e) => {
        switch (e.payload.type) {
          case DesktopMiniEmit.Init:
            syncAudio()
            syncPlaylist()
            syncLyric()
            break
          case DesktopMiniEmit.Play:
            musicStore.play()
            break
          case DesktopMiniEmit.Pause:
            musicStore.pause()
            break
          case DesktopMiniEmit.Prev:
            musicStore.playPrevOrNext('prev')
            break
          case DesktopMiniEmit.Next:
            musicStore.playPrevOrNext('next')
            break
          case DesktopMiniEmit.Set: {
            const music = e.payload.data as ListMusic
            musicStore.setMusic(music, { origin: getPlayingOrigin(music) })
            break
          }
          case DesktopMiniEmit.Close:
            stop()
            break
          case DesktopMiniEmit.Pos:
            const { x, y } = e.payload.data as PhysicalPosition
            settingStore.setDesktopMiniPosition({ x, y })
            break
        }
      }
    )

    stopFns.push(unwatchAudio, unwatchLyric, unwatchPlaylist, unlistenAction)
  }

  /** 停止桥接 */
  const stop = () => {
    stopFns.forEach((fn) => fn())
    stopFns.length = 0

    mainWindow.show()

    if (!miniWindow.value) return
    miniWindow.value.close()
    miniWindow.value = undefined
  }

  return { start, stop }
}
