# 编码规范

> 本文件定义项目的编码规范。所有提交的代码应遵守以下约定。

---

## 命名规范

### 状态字段

布尔类型的状态字段使用 `is` + 状态形容词。

```typescript
// ✅ 正确
const isPlaying = ref(false)
const isLoading = ref(false)
const isHydrated = ref(false)
const isLocked = ref(false)
const isHovering = ref(false)

// ❌ 避免
const playing = ref(false)
const loaded = ref(false)
```

### 可见性

控制元素显示/隐藏的字段使用 `关键词` + `Visible`。

```typescript
// ✅ 正确
const pageVisible = ref(false)
const playlistVisible = ref(false)
const showFontModal = ref(false)
const showColorModal = ref(false)

// ❌ 避免
const pageShow = ref(false)
const displayPlaylist = ref(false)
```

### 事件处理

用户事件处理函数使用 `handle` + 关键词。

```vue
// ✅ 正确
const handlePlay = () => { ... }
const handleClick = (type: LyricEmitType) => { ... }
const handlePush = (payload: LyricPushPayload) => { ... }
const handlePlayOrPause = () => { ... }

// ❌ 避免
const onPlay = () => { ... }
const clickHandler = () => { ... }
```

Vue 模板中的事件绑定：

```vue
// ✅ 正确
<button @click="handlePlay">
<div @mouseleave="handleMouseLeave">

// ❌ 避免 — 内联逻辑
<button @click="isPlaying ? pause() : play()">
```

例外：直接透传的 DOM 事件（如 `@click.stop`、`@dblclick.stop`）不需要 `handle` 前缀。

### 文件/目录命名

- Vue 组件文件：`PascalCase.vue`（如 `VirtualList.vue`、`DesktopMini.vue`）
- Composable 文件：`use` + `PascalCase`（如 `useMiniPlayerBridge.ts`）
- Store 文件：`kebab-case`（如 `lyric-main.ts`、`lyric-desktop.ts`）
- 工具模块：`kebab-case`（如 `tools.ts`、`params.ts`）
- 测试文件：与源文件同名 + `.spec.ts`（如 `useDesktopLyricBridge.spec.ts`）

### 事件枚举

Tauri 跨窗口通信的事件枚举使用 `XxxEmit` 命名：

```typescript
// ✅ 正确
DesktopMiniEmit
DesktopLyricEmit

// payload 接口
DesktopMiniAudio
DesktopMiniLyric
DesktopMiniPlaylist
DesktopLyricPushPayload
```
