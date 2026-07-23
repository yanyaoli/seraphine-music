# Triage labels

使用默认的标准 triage 标签，标签名称即标签字符串本身。

| 标签              | 用途                                     |
| ----------------- | ---------------------------------------- |
| `needs-triage`    | 新 issue，待分类和优先级排序             |
| `needs-info`      | 信息不足，等待提交者补充                 |
| `ready-for-agent` | 已明确范围，可由 agent 接手处理          |
| `ready-for-human` | 需要人工介入（复杂度、敏感度或权限原因） |
| `wontfix`         | 已确认但决定不予修复                     |

## 工作流

1. 新 issue 标记为 `needs-triage`
2. 分类后 → `needs-info`（信息不足）或 `ready-for-agent` / `ready-for-human`
3. `needs-info` 的 issue 在获得足够信息后重新进入 triage
4. 被拒绝的 issue 标记为 `wontfix` 并关闭
