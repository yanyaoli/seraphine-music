# ADR-0002: 多窗口桥接模式 (Bridge Pattern) 标准化

**状态**: 已采纳  
**日期**: 2026-07-22  
**决策者**: @buren_Lee

---

## 背景

ADR-0001 确立了非主窗口数据隔离原则：子窗口只能使用专用 store，其余数据由主窗口通过 Tauri 事件传递。但在实现桌面歌词窗口和迷你播放器窗口时，出现了两种不同的数据推送风格：

| 窗口                        | 原始实现方式                      | 问题                                       |
| --------------------------- | --------------------------------- | ------------------------------------------ |
| 迷你播放器 (`desktop-mini`) | `useDesktopMiniBridge` composable | 封装良好，职责单一                         |
| 桌面歌词 (`desktop-lyric`)  | 内联在 `Playbar/DesktopLyric.vue` | 职责过重，无法测试，与迷你播放器架构不一致 |

需要一个标准化的模式来统一所有子窗口的数据传递机制。

## 决策

采用 **Bridge Pattern** 作为所有子窗口数据传递的标准模式。每个子窗口对应一个 bridge composable，封装主窗口到子窗口的数据推送和子窗口到主窗口的 action 事件处理。

### 接口约定

所有 bridge composable 遵循同一接口模式，传递子窗口的 `WebviewWindow` 引用，由 bridge 内部管理生命周期：

```typescript
// 迷你播放器（需额外引用主窗口用于关闭后聚焦）
function useDesktopMiniBridge(
  miniWindow: Ref<WebviewWindow | undefined>,
  mainWindow: Window
): { start: () => Promise<void>; stop: () => void }

// 桌面歌词
function useDesktopLyricBridge(
  lyricWindow: Ref<WebviewWindow | undefined>
): { start: () => Promise<void>; stop: () => void }
```

核心设计：**bridge 持有窗口引用，`stop()` 内部完成清理和窗口销毁**，组件无需额外传入 `onClose` 回调。

### 职责边界

| 层                    | 职责                                                                                         | 不允许                                    |
| --------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Bridge composable** | 监听主窗口 store → 推送数据；监听子窗口 action → 调用 store 方法；生命周期管理（start/stop）；关闭窗口 | 操作 DOM、管理 WebviewWindow 对象 |
| **组件 (Vue SFC)**    | 创建 WebviewWindow；渲染 UI；监听 `tauri://created` 调用 bridge.start；通过 `bridge.stop()` 销毁窗口 | 直接调用 `emitTo`/`listen` 进行跨窗口通信 |

### 生命周期

```
组件按钮点击 → new WebviewWindow(...)
  └─ tauri://created → bridge.start()
      ├─ 注册 watchers：自动推送状态变化至子窗口
      ├─ 注册 listener：接收子窗口 Init / action 请求
      └─ 子窗口 onMounted → 发送 Init → bridge 全量推送首帧

子窗口 Close / 组件再次点击 → bridge.stop()
  └─ stop() 清理所有 watchers / listener 并关闭窗口
```

### 消息类型分类

| 方向    | 迷你播放器 (`DesktopMiniEmit`) | 桌面歌词 (`DesktopLyricEmit`) | 触发方式 | 说明 |
| ------- | ------------------------------ | ----------------------------- | -------- | ---- |
| 主 → 子 | `Audio` / `Lyric` / `Playlist` | `Audio` / `Lyric` / `Progress` / `Fonts` | watch 自动 | 状态变化主动推送 |
| 子 → 主 | `Init` | `Init` | 窗口创建 | 请求首帧数据 |
| 子 → 主 | `Play` / `Pause` / `Prev` / `Next` / `Set` / `Close` / `Pos` | `Play` / `Pause` / `Prev` / `Next` / `Close` / `Pos` / `Main` | 用户操作 | action 回传 |

### 初始化时序

1. 组件调用 `new WebviewWindow(...)` 创建子窗口
2. 监听 `tauri://created` 事件 → 调用 `bridge.start()`
3. 子窗口 `onMounted` 后发送 `Init` 事件请求首帧数据
4. Bridge 的 listener 收到 `Init` 后全量推送所有状态（`syncAudio` + `syncLyric` + `syncProgress` + `syncFonts`）

### 清理规则

- `stop()` 执行完整的清理链路：销毁 watcher → 销毁 listener → 关闭窗口
- `stopFns` 数组统一存储所有 unwatch 函数和 unlisten 函数
- `stop()` 遍历 `stopFns` 执行所有清理，然后清空数组，最后关闭窗口
- 窗口关闭由 bridge 内部 `stop()` 完成，组件不再需要独立的 `onClose` 逻辑

## 现有实现

| Bridge                  | 文件                                   | 子窗口        | 参数 |
| ----------------------- | -------------------------------------- | ------------- | ---- |
| `useDesktopMiniBridge`  | `composables/useDesktopMiniBridge.ts`  | desktop-mini  | `(miniWindow, mainWindow)` |
| `useDesktopLyricBridge` | `composables/useDesktopLyricBridge.ts` | desktop-lyric | `(lyricWindow)` |

## 考虑的替代方案

| 方案                                              | 优点                               | 缺点                           | 为什么没选            |
| ------------------------------------------------- | ---------------------------------- | ------------------------------ | --------------------- |
| 组件内直接 `emitTo`/`listen`（现状 for 桌面歌词） | 简单直接                           | 职责混叠、不可测试、风格不一致 | 违反单一职责          |
| 全局事件总线                                      | 一次注册到处可用                   | 隐式依赖、难以追踪、无法隔离   | 与 Tauri 事件系统重复 |
| Bridge Composable（本方案）                       | 封装性、可测试性、与 ADR-0001 一致 | 需为每个子窗口单独编写         | —                     |

## 影响

- **新增**: 每个子窗口需要一个 bridge composable，但代码量小（~150 行）
- **修改**: 子窗口视图保持哑视图，bridge 承担所有跨窗口逻辑
- **约束**: 新增子窗口时，必须在此 ADR 中注册对应的 bridge；不得绕过 bridge 直接在主窗口组件中使用 `emitTo`/`listen` 与子窗口通信
- **风险**: bridge 和子窗口的事件协议需同步更新；`Init` 事件是统一的首帧拉取入口——子窗口 `onMounted` 发送 `Init`，bridge 全量回复

## 后续

- 两个 bridge 的参数差异（`useDesktopMiniBridge` 额外接收 `mainWindow`）是因为迷你播放器关闭时需要聚焦主窗口。后续可考虑统一签名，但当前差异由业务需求决定。
- `availableFonts`（可用字体列表）的检测已集成到 settingStore，bridge 中 `syncFonts` 按需触发检测并推送至桌面歌词窗口。
