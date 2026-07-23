# 多窗口数据传递 Bridge Pattern 规范化

## Problem Statement

当前 Seraphine Music 有两个子窗口（桌面歌词和迷你播放器）通过 Tauri 事件系统与主窗口通信。迷你播放器已经使用了 `useDesktopMiniBridge` composable 来封装推送/监听逻辑，但桌面歌词窗口的推送逻辑散布在 `Playbar/DesktopLyric.vue` 组件中——`buildPushPayload()`、`pushState()`、`sendLyric()`、以及事件监听器全部内联在该组件中。导致：

1. `Playbar/DesktopLyric.vue` 职责过重（窗口管理 + 数据推送 + 事件处理）
2. 推送逻辑无法独立测试
3. 两个子窗口的架构风格不一致，增加维护成本

## Solution

将桌面歌词窗口的推送逻辑提取为 `useDesktopLyricBridge` composable，与 `useDesktopMiniBridge` 保持一致的接口签名和生命周期约定。同时，明确 Bridge Pattern 为多窗口数据传递的标准化模式，后续新增子窗口时强制使用此模式。

## User Stories

1. 作为一名开发者，我希望桌面歌词和迷你播放器使用相同的 bridge composable 模式，以便代码风格统一、降低维护成本。
2. 作为一名开发者，我希望 `Playbar/DesktopLyric.vue` 只负责窗口创建/销毁和 UI 渲染，数据推送逻辑独立出去，以便职责单一。
3. 作为一名开发者，我希望 bridge composable 的 `start`/`stop` 生命周期能够正确管理 watch 和 event listener 的清理，以便防止内存泄漏和重复订阅。
4. 作为一名开发者，我希望 bridge composable 的推送数据和接收子窗口 action 的逻辑可被单元测试覆盖，以便保证数据一致性。
5. 作为一名开发者，我希望后续新增子窗口时有明确的 bridge 模式规范可循，以便减少设计决策成本。
6. 作为一名开发者，我希望 bridge composable 不依赖具体的 Vue 组件上下文，以便它可以被任意组件或 setup 函数调用。
7. 作为一名开发者，我希望 bridge composable 在子窗口未打开时不执行推送，以便避免无效的事件广播。
8. 作为一名开发者，我希望 `DesktopMiniEmit` 和 `DesktopLyricEmit` 的事件类型定义保持清晰独立，以便事件协议可以作为接口契约被静态类型检查。

## Implementation Decisions

### 1. 提取 `useDesktopLyricBridge` composable

新建 `src/composables/useDesktopLyricBridge.ts`，与 `useDesktopMiniBridge` 对齐接口：

```typescript
export function useDesktopLyricBridge(
  lyricWindow: Ref<WebviewWindow | undefined>
): { start: () => Promise<void>; stop: () => void }
```

**职责**：
- 监听主窗口 stores（`musicStore`、`lyricStore(lyric-main)`、`settingStore`）的状态变化
- 按类型分推 `Audio` / `Lyric` / `Progress` / `Fonts` 至 `desktop-lyric` 窗口
- 监听 `desktop-lyric` 窗口发回的 action 事件并调用对应 store 方法
- 提供 `stop()` 清理所有 watch、listener 并关闭窗口

**与 useDesktopMiniBridge 的核心差异**：
- 推送粒度不同：桌面歌词拆分为 `Audio` / `Lyric` / `Progress` / `Fonts` 四类独立推送；迷你播放器拆分为 `Audio` / `Lyric` / `Playlist` 三类
- 桌面歌词额外推送 `Progress`（播放进度，throttled ~33ms）用于逐词高亮；迷你播放器歌词仅推送当前行文本（throttled ~100ms）
- 桌面歌词额外推送 `Fonts` 可用字体列表用于字体选择器
- 参数不同：桌面歌词只接收 `lyricWindow`，迷你播放器额外需要 `mainWindow` 用于关闭后聚焦

### 2. 简化 `Playbar/DesktopLyric.vue`

提取后的组件职责缩减为：
- 创建/销毁 WebviewWindow（通过 `bridge.stop()` 销毁）
- 调用 `useDesktopLyricBridge(lyricWindow)` composable
- 提供 UI 按钮（"词"字样）切换窗口可见性

### 3. 推送计算拆分

当前桌面歌词的 bridge 将推送拆分为四类独立函数（`syncAudio` / `syncLyric` / `syncProgress` / `syncFonts`），各 watcher 分别关注对应的 store 字段，子窗口只在渲染层做呈现和当前行计算。

### 4. 窗口存活守卫内聚

当前 `syncAudio` 和 `syncLyric` 等推送方法无独立的窗口存活守卫——bridge 在 `start` 时注册，`stop` 时清理，组件通过开关式调用（点一次启动，再点停止）隐式保证「窗口不存在时不推送」。子窗口自身的 `Init` 事件触发全量首次推送。

### 5. 初始化时序

组件创建窗口 → 监听 `tauri://created` → 调用 `bridge.start()` → 子窗口 `onMounted` 发送 `Init` → bridge 收到后全量推送首帧（`syncAudio` + `syncLyric` + `syncFonts` + `syncProgress`）。之后所有变化通过 watcher 自动推送。

### 6. 模块边界

| 模块 | 存放路径 |
|------|---------|
| Bridge composables | `src/composables/useDesktopMiniBridge.ts`、`src/composables/useDesktopLyricBridge.ts` |
| 事件类型枚举 | `src/utils/params.ts`（已有 `DesktopLyricEmit`、`DesktopMiniEmit`、`WindowEvent`） |
| 子窗口视图 | `src/views/DesktopMini.vue`、`src/views/DesktopLyric.vue` |
| 子窗口入口 | `src/desktop-mini.ts`、`src/desktop-lyric.ts` |
| 主窗口启动桥接 | `src/layout/Playbar/DesktopLyric.vue`（窗口创建 + 桥接）

### 7. 后续子窗口规范

新增子窗口时需：
1. 在 `params.ts` 中定义该窗口的事件枚举（扩展 `WindowName`、`WindowEvent`）和类型接口
2. 在 `composables/` 中创建对应的 bridge composable，传递窗口 `Ref<WebviewWindow>`，遵循 `(windowRef) => { start, stop }` 模式
3. 子窗口视图只使用专用 store 和事件接收，不引用主窗口 store
4. 在 `capabilities/` 下新增对应窗口的权限配置

## Testing Decisions

### 测试原则
- 只测试 bridge composable 的外部行为：状态变化后是否发出正确的 Tauri 事件；收到 action 事件后是否调用正确的 store 方法
- Mock Tauri 的 `emitTo` 和 `listen` API，不依赖真实的 WebView 窗口
- 使用 Pinia 的 `setActivePinia` 创建隔离的 store 实例，不依赖真实 store 的持久化层
- 不测试子窗口视图的渲染逻辑（那是组件测试范畴）

### 测试接缝
- `useDesktopLyricBridge` composable 是最高优先级的接缝
- `useDesktopMiniBridge` 作为同类接缝，可并行测试或作为写入测试时的参考实现

### 待测场景

| 场景 | 输入 | 预期输出 |
|------|------|---------|
| Audio 变化 | `musicStore.isLoading/isPlaying/music` 改变 | `emitTo(desktop-lyric, Audio)` 被调用 |
| Lyric 变化 | `lyricStore.lyric` 改变 | `emitTo(desktop-lyric, Lyric)` 被调用 |
| Progress 变化 | `musicStore.playProgress` 改变 | `emitTo(desktop-lyric, Progress)` 被调用（throttled 33ms） |
| Fonts 变化 | `settingStore.availableFonts` 改变 | `emitTo(desktop-lyric, Fonts)` 被调用 |
| Init 请求 | 收到 `DesktopLyricEmit.Init` 事件 | 全量推送（Audio + Lyric + Progress + Fonts） |
| Play action | 收到 `DesktopLyricEmit.Play` 事件 | `musicStore.play()` 被调用 |
| Pause action | 收到 `DesktopLyricEmit.Pause` 事件 | `musicStore.pause()` 被调用 |
| Prev/Next action | 收到对应事件 | `musicStore.playPrevOrNext()` 被调用 |
| Close action | 收到 `DesktopLyricEmit.Close` | `stop()` 被调用，窗口关闭 |
| start/stop 生命周期 | 调用 `start()` 后调用 `stop()` | watch 和 listener 被清理，无残留副作用 |

### 测试工具链
- Vitest 作为测试运行器（与 Vite 构建工具链一致）
- `@vue/test-utils` 提供 composable 测试的宿主环境
- `pinia` 的 `setActivePinia` / `createPinia` 创建隔离 store
- 手动 mock `@tauri-apps/api/event` 的 `emitTo` 和 `listen`

## Out of Scope

- 窗口创建/销毁逻辑的改动（`WebviewWindow` 的创建参数和使用方式不变）
- 修改桌面歌词子窗口的 UI 布局或交互逻辑
- 修改迷你播放器的现有 bridge 实现（仅做一致性参考，不作为规格变更项）
- 端到端的多窗口集成测试（环境依赖 Tauri WebView，超出单元测试范围）
- 将 `DesktopMiniEmit` 和 `DesktopLyricEmit` 合并或重构——保留独立枚举，各有合理差异

## Further Notes

- 此次规范化的最终目标不仅是桌面歌词的 bridge 提取，而是建立明确的 **Bridge Pattern** 作为团队的多窗口通信规范
- ADR-0001 中提到的"初始化时序"和"事件一致性"约束不因此次变更而改变——bridge composable 自然继承这些约束
- `availableFonts` 的检测按需触发（`settingStore.getAvailableFonts()`），bridge 在 `syncFonts` 中调用并推送
- 歌词偏移量计算下沉到子窗口视图（`views/DesktopLyric.vue`），使用 `desktopLyricStore.offsetMap` 做本地偏移，bridge 只传递原始进度值
