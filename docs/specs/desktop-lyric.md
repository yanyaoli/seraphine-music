# Desktop Lyric 桌面歌词完整功能

## Problem Statement

桌面歌词窗口当前仅有基础歌词展示——Lrc格式逐行/Krc格式逐字渲染所有歌词，工具栏中只有播放/暂停/上下一首可用。用户期望完整的桌面歌词体验：微调歌词时间偏移、调整字号、更换字体、选择文本颜色、锁定/解锁窗口防误触，以及双行排版和翻译显示。

此外，字体弹窗需要字体列表，该列表由主窗口检测并推送。歌词偏移需要与歌词页同步，不能各自独立。

## Solution

在现有事件驱动架构上扩展，所有操作回传主窗口处理，所有共享数据由主窗口推送。子窗口端新增浮层弹窗组件用于字体和颜色选择。歌词布局支持默认双行模式（当前行靠左、下一行靠右）和翻译模式（原文+翻译各一行居中）。

## User Stories

1. 作为用户，我希望通过桌面歌词窗口的按钮微调歌词时间偏移（向前/向后），以便修正唱词与显示的偏差，并且该调整与歌词页同步
2. 作为用户，我希望通过按钮放大/缩小桌面歌词的字号，以便在不同观看距离下都能看清歌词
3. 作为用户，我希望点击"字"按钮弹出字体选择弹窗，从中选择我喜欢的字体，以便个性化歌词显示
4. 作为用户，我希望点击"颜"按钮弹出颜色选择弹窗，从中选择预设颜色来显示歌词，以便歌词与桌面背景产生对比
5. 作为用户，我希望锁定桌面歌词窗口后鼠标可以穿透窗口，以便不会误触歌词区域，双击拖拽区域可解锁
6. 作为用户，我希望默认模式下歌词显示为两行——当前演唱行靠左、下一行靠右，以便提前看到即将演唱的内容
7. 作为用户，我希望在翻译模式下歌词显示为原文一行居中 + 翻译一行居中，以便同时看到原文和翻译
8. 作为用户，我希望桌面歌词的偏移调整设置能持久化保存，以便下次打开应用时不需要重新调整

## Implementation Decisions

### 1. 扩展事件协议

**主窗口 → 子窗口**：

获取音频状态

```typescript
interface DesktopLyricAudio {
  isPlaying: boolean
  isLoading: boolean
  music: PlayingMusic | null
  origin: PlayingOrigin
}
```

获取进度

```typescript
type data = number
```

获取歌词

```typescript
type data = LyricInfo | undefined
```

获取可选字体

```typescript
type data = FontItem[]
```

**子窗口 → 主窗口**：`DesktopLyricEmit` 操作类型

```typescript
// 子窗口操作→主窗口
DesktopLyricEmit.Main,    // 打开主界面
DesktopLyricEmit.Play,    // 播放
DesktopLyricEmit.Pause,   // 暂停
DesktopLyricEmit.Prev,    // 上一首
DesktopLyricEmit.Next,    // 下一首
DesktopLyricEmit.Close,   // 关闭窗口
DesktopLyricEmit.Pos,     // 窗口位置变化
```

**纯本地操作（子窗口专用 store）**：偏移调整、字号、字体、颜色、锁定等操作直接在子窗口内通过 `desktopLyricStore` 管理，不经过主窗口 bridge。

### 2. 歌词偏移共享

偏移调整事件回传主窗口 → 主窗口调用 `lyricStore.setOffsetMap('add'|'sub')` → `offset` computed 自动更新 → watch 触发重新计算 `currentIndex` → `PushState` 推送。桌面歌词窗口与歌词页使用同一个 `offsetMap`。

### 3. 主窗口端改动

`Playbar/DesktopLyric.vue`：通过 `useDesktopLyricBridge(lyricWindow)` 桥接，监听 desktop-lyric 窗口的 action 事件。bridge 内部分类推送 `Audio` / `Lyric` / `Progress` / `Fonts`。偏移、字号、字体、颜色、锁定等本地操作由子窗口通过 `desktopLyricStore` 自行管理。

### 4. 子窗口布局模式

**默认模式**（`transMode === Off`）：

```
┌──────────────────────────────────────┐
│  当前行歌词（靠左）                    │
│              下一行歌词（靠右）        │
└──────────────────────────────────────┘
```

**翻译模式**（`transMode !== Off`）：

```
┌──────────────────────────────────────┐
│       当前行原文（居中）               │
│       翻译文本（居中）                 │
└──────────────────────────────────────┘
```

翻译文本从 `lines[currentIndex].translations[transMode]` 获取。

### 5. 字体弹窗

子窗口内浮层弹窗，列出 `availableFonts` 中所有字体名。点击选中后 `emitTo` 回传 `SetFontFamily`，同时写入 `desktop-lyric` store 持久化。`fontFamily` 在弹窗打开时从 store 读取当前值作为默认选中。

### 6. 颜色弹窗

子窗口内浮层弹窗，列出 `LyricTextColor` 枚举中的 7 个预设颜色。以色块+名称展示。点击选中后 `emitTo` 回传 `SetTextColor`，同时写入 `desktop-lyric` store 持久化。

### 7. 窗口锁定

锁定状态由 `desktop-lyric` store 的 `isLocked` 字段管理。点击 Lock 按钮 → 切换 `isLocked` → 调用 `currentWindow.setIgnoreCursorEvents(true)` 使鼠标穿透。拖拽区域监听双击事件 → 如果已锁定则解锁（`setIgnoreCursorEvents(false)` + `isLocked = false`）。锁定状态下 `isHovering` 强制为 `false` 以隐藏工具栏。

### 8. 字号调整

ZoomIn/ZoomOut 按钮调整 `desktop-lyric` store 的 `fontSize`（步长 ±2，范围 16-48）。不经过主窗口——字号是子窗口的纯 UI 属性，属于专用 store 的管辖范围。

## Testing Decisions

### 测试重点

测试子窗口的布局逻辑（给定 LyricPushPayload，验证渲染的两行内容、对齐方式、翻译文本）和弹窗交互（打开/关闭/选择/回传事件）。

### 测试层级

1. **Bridge 测试**：验证 bridge composable 的推送/监听行为（状态变化触发正确 `emitTo`，action 事件调用正确 store 方法）
2. **布局测试**：给 `DesktopLyric.vue` 注入不同 `transMode` 的载荷，验证双行/翻译布局
3. **弹窗交互测试**：打开字体/颜色弹窗 → 选择 → 验证正确的 store 更新

## Out of Scope

- 自定义颜色选择器（色盘/HEX 输入）——仅使用预设颜色
- 歌词平滑滚动动画
- `desktop-lyric` store 的重构
- 自定义字体上传

## Further Notes

- 可用字体列表由主窗口在子窗口发送 `Init` 时通过 `syncFonts` 推送，后续不再主动推送（字体列表在应用生命周期内不变）
- `transMode` 变化由子窗口 `desktopLyricStore` 管理，不经过主窗口 bridge
- `DesktopLyricEmit` 枚举已在 `params.ts` 中定义
