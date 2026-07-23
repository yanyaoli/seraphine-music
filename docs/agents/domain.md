# Domain docs

## 布局

**单上下文（Single-context）** — 整个仓库使用一个统一的领域模型。

| 文件         | 用途                         |
| ------------ | ---------------------------- |
| `CONTEXT.md` | 通用语言、领域术语和顶层架构 |
| `docs/adr/`  | 架构决策记录（ADR）          |

## 使用规则

维护或查阅领域模型的 agent skills 遵循以下规则：

1. 需要领域上下文时，首先读取 `CONTEXT.md`。
2. 新 ADR 写入 `docs/adr/<NNNN>-<kebab-case-title>.md`，使用下一个可用编号。
3. 向 `CONTEXT.md` 添加术语时，确保在通用语言章节中给出定义。
