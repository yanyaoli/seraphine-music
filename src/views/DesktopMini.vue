<script lang="ts" setup>
import Image from '@/components/Image.vue'
import SvgIcon from '@/components/SvgIcon.vue'
import VirtualList from '@/components/VirtualList.vue'
import {
  DesktopMiniEmit,
  Interval,
  PlayingOrigin,
  WindowEvent,
  WindowName,
  desktopMiniSize
} from '@/utils/params'
import { getFullName, getPic } from '@/utils/tools'
import { convertFileSrc } from '@tauri-apps/api/core'
import { LogicalSize, PhysicalPosition } from '@tauri-apps/api/dpi'
import { emitTo, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useColorMode, useThrottleFn } from '@vueuse/core'

useColorMode()
const miniWindow = getCurrentWindow()

const tableColumns: TableColumn[] = [
  { key: 'index', slot: true, width: '3rem', padding: 0 },
  { key: 'info', slot: true, width: 'auto' }
]

const audio = ref<DesktopMiniAudio>({
  isPlaying: false,
  isLoading: false,
  music: null,
  origin: PlayingOrigin.Local
})
const lyric = ref('')
const playlist = ref<ListMusic[]>([])
const playlistVisible = ref(false)

const cover = computed(() => {
  if (!audio.value.music?.cover) return ''

  return audio.value.origin === PlayingOrigin.Local
    ? convertFileSrc(audio.value.music?.cover)
    : getPic(audio.value.music?.cover)
})

/** 显示文本：优先歌词，否则歌名 */
const showContent = computed(() => {
  if (!audio.value.music) return 'Seraphine'
  return lyric.value || getFullName(audio.value.music)
})

const isPlaying = (row: ListMusic) => row.id === audio.value.music?.id

const handleSend = (type: DesktopMiniEmit, data?: any) => {
  emitTo(WindowName.Main, WindowEvent.DesktopMini, { type, data })
}

const handlePlay = (music: ListMusic) => {
  handleSend(DesktopMiniEmit.Set, music)
}

const showPlaylist = async () => {
  playlistVisible.value = !playlistVisible.value

  await miniWindow.setSize(
    new LogicalSize(
      desktopMiniSize.width,
      playlistVisible.value ? desktopMiniSize.width : desktopMiniSize.height
    )
  )
}

const throttledSendPos = useThrottleFn((e: { payload: PhysicalPosition }) => {
  handleSend(DesktopMiniEmit.Pos, e.payload)
}, Interval.Long)

onMounted(() => {
  miniWindow.onMoved(throttledSendPos)

  emitTo(WindowName.Main, WindowEvent.DesktopMini, { type: DesktopMiniEmit.Init })
  listen<{ type: DesktopMiniEmit; data: unknown }>(WindowEvent.DesktopMini, (e) => {
    switch (e.payload.type) {
      case DesktopMiniEmit.Audio:
        audio.value = e.payload.data as DesktopMiniAudio
        break
      case DesktopMiniEmit.Lyric:
        lyric.value = e.payload.data as string
        break
      case DesktopMiniEmit.Playlist:
        playlist.value = e.payload.data as ListMusic[]
        break
    }
  })
})
</script>

<template>
  <div
    class="h-screen w-screen flex border border-border flex-col rounded-lg bg-background select-none">
    <!-- 主体内容 -->
    <div class="flex items-center">
      <!-- 专辑封面 -->
      <Image data-tauri-drag-region class="size-16 cursor-move" :img="cover" />

      <!-- 歌名/歌词区域 -->
      <div class="group w-0 flex-1 relative px-3">
        <div class="font-bold line-clamp-2">{{ showContent }}</div>

        <div
          class="absolute inset-0 bg-background pr-2 pl-6 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div class="flex items-center gap-2">
            <SvgIcon
              class="action-icon"
              name="PreviousBold"
              size="20"
              @click="handleSend(DesktopMiniEmit.Prev)" />
            <SvgIcon
              v-if="!audio.isLoading"
              class="action-icon"
              :name="audio.isPlaying ? 'PauseBold' : 'PlayBold'"
              size="24"
              @click="handleSend(audio.isPlaying ? DesktopMiniEmit.Pause : DesktopMiniEmit.Play)" />
            <SvgIcon v-else class="action-icon pointer-events-none" name="Ring" size="28" />
            <SvgIcon
              class="action-icon"
              name="NextBold"
              size="20"
              @click="handleSend(DesktopMiniEmit.Next)" />
          </div>

          <div class="flex items-center">
            <SvgIcon
              class="action-icon"
              name="Playlist"
              size="20"
              title="展开播放列表"
              @click="showPlaylist" />
            <SvgIcon
              class="action-icon shrink-0 hover:text-error"
              name="Close"
              size="14"
              title="关闭迷你播放器"
              @click="handleSend(DesktopMiniEmit.Close)" />
          </div>
        </div>
      </div>
    </div>

    <VirtualList
      v-if="playlistVisible"
      ref="musicTableRef"
      class="mt-2 h-0 flex-1 px-2"
      :line-height="40"
      :columns="tableColumns"
      :list="playlist"
      :checked-list="[]"
      :isChecking="false"
      @lineDblClick="handlePlay">
      <template #index="row">
        <SvgIcon v-if="isPlaying(row)" class="text-info" name="Music" />
        <div v-else class="truncate text-center text-minor">{{ row.index + 1 }}</div>
      </template>

      <template #info="row">
        <div class="flex">
          <div
            class="w-0 flex-1 truncate font-bold leading-10"
            :class="isPlaying(row) ? 'text-info' : ''">
            {{ getFullName(row) }}
          </div>

          <div class="hidden items-center pl-2 group-hover/line:flex" @dblclick.stop>
            <SvgIcon class="action-icon" name="Play" @click="handlePlay(row)" />
          </div>
        </div>
      </template>
    </VirtualList>
  </div>
</template>
