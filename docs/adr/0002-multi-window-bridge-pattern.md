# ADR-0002: 多窗口桥接模式 (Bridge Pattern) 标准化

**状态**: 已采纳  
**日期**: 2026-07-22  
**决策者**: @buren_Lee

---

## 背景

ADR-0001 确立了非主窗口数据隔离原则：子窗口只能使用专用 store，其余数据由主窗口通过 Tauri 事件传递。但在实现桌面歌词窗口和迷你播放器窗口时，出现了两种不同的数据推送风格：

| 窗口 | 原始实现方式 | 问题 |
|------|-------------|------|
| 迷你播放器 (`desktop-mini`) | `useMiniPlayerBridge` composable | 封装良好，职责单一 |
| 桌面歌词 (`desktop-lyric`) | 内联在 `Playbar/DesktopLyric.vue` | 职责过重，无法测试，与迷你播放器架构不一致 |

需要一个标准化的模式来统一所有子窗口的数据传递机制。

## 决策

采用 **Bridge Pattern** 作为所有子窗口数据传递的标准模式。每个子窗口对应一个 bridge composable，封装主窗口到子窗口的数据推送和子窗口到主窗口的 action 事件处理。

### 接口约定

所有 bridge composable 遵循同一接口签名：

```typescript
function useXxxBridge(
  onClose: () => void
): {
  start: () => Promise<void>
  stop: () => void
  pushNow: () => void       // 可选：初始化时立即推送首帧
  isLyricOpen: () => boolean // 可选：查询子窗口是否存活
}
```

### 职责边界

| 层 | 职责 | 不允许 |
|----|------|--------|
| **Bridge composable** | 监听主窗口 store → 推送数据；监听子窗口 action → 调用 store 方法；生命周期管理（start/stop） | 操作 DOM、管理 WebviewWindow 对象 |
| **组件 (Vue SFC)** | 创建/销毁 WebviewWindow；渲染 UI；调用 bridge.start/stop | 直接调用 `emitTo`/`listen` 进行跨窗口通信 |

### 生命周期

```
组件 onMounted → bridge.start()
  ├─ 注册 watchers：自动推送状态变化至子窗口
  ├─ 注册 listener：接收子窗口 action 请求
  └─ 响应 GetLyric/Init 请求：子窗口就绪后拉取首帧

子窗口 Close → bridge 内部：stop() → onClose()
  └─ stop() 清理所有 watchers 和 listener

组件 onUnmounted → bridge.stop()
```

### 消息类型分类

| 方向 | Message Type | 触发方式 | 说明 |
|------|-------------|----------|------|
| 主 → 子 | PushState / Audio / Lyric / Playlist | watch 自动 | 状态变化主动推送 |
| 主 → 子 | SendLyric | 响应 GetLyric | 子窗口就绪后拉取 |
| 子 → 主 | Play / Pause / Prev / Next / Set / Close | 用户操作 | action 回传 |
| 子 → 主 | GetLyric / Init | 窗口创建 | 请求首帧数据 |

### 初始化时序

1. 组件调用 `new WebviewWindow(...)` 创建子窗口
2. 监听 `tauri://created` 事件 → 调用 `bridge.pushNow()` 推送首帧
3. 子窗口发送 `GetLyric`（桌面歌词）或 `Init`（迷你播放器）请求
4. Bridge 监听这些请求并响应

### 清理规则

- Close 事件回调中先调用 `stop()` 再调用 `onClose()`，确保清理完成后再销毁窗口
- `stopFns` 数组存储所有 watcher 的 unwatch 函数
- `unlistenAction` 存储 listener 的 unlisten 函数
- `stop()` 遍历执行所有清理

## 现有实现

| Bridge | 文件 | 子窗口 | 额外暴露 |
|--------|------|--------|---------|
| `useMiniPlayerBridge` | `composables/useMiniPlayerBridge.ts` | desktop-mini | — |
| `useDesktopLyricBridge` | `composables/useDesktopLyricBridge.ts` | desktop-lyric | `pushNow`, `isLyricOpen` |

## 考虑的替代方案

| 方案 | 优点 | 缺点 | 为什么没选 |
|------|------|------|------------|
| 组件内直接 `emitTo`/`listen`（现状 for 桌面歌词） | 简单直接 | 职责混叠、不可测试、风格不一致 | 违反单一职责 |
| 全局事件总线 | 一次注册到处可用 | 隐式依赖、难以追踪、无法隔离 | 与 Tauri 事件系统重复 |
| Bridge Composable（本方案） | 封装性、可测试性、与 ADR-0001 一致 | 需为每个子窗口单独编写 | — |

## 影响

- **新增**: 每个子窗口需要一个 bridge composable，但代码量小（~150 行）
- **修改**: 子窗口视图保持哑视图，bridge 承担所有跨窗口逻辑
- **约束**: 新增子窗口时，必须在此 ADR 中注册对应的 bridge；不得绕过 bridge 直接在主窗口组件中使用 `emitTo`/`listen` 与子窗口通信
- **风险**: bridge 和子窗口的事件协议需同步更新；`pushNow` 是可选方法，仅在需要 `tauri://created` 立即推送的场景使用

## 后续

- 现有 `useMiniPlayerBridge` 和 `useDesktopLyricBridge` 接口不完全对齐——`useMiniPlayerBridge` 无 `pushNow` 和 `isLyricOpen`。这是因为迷你播放器的初始化通过 `Init` 事件从子窗口发起，不需要主窗口主动推送首帧。后续可考虑统一但当前差异是合理的。
- `availableFonts`（可用字体列表）的检测尚未实现。Bridge 已预留字段位置，待字体检测功能完成后注入。
