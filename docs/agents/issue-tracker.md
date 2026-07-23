# Issue tracker

- **系统:** GitHub Issues
- **仓库:** [burenLee/seraphine-music](https://github.com/burenLee/seraphine-music)
- **CLI:** `gh`

## 使用约定

Issues 通过 `gh` CLI 进行创建、读取和更新。与 issue tracker 交互的 skills（`to-tickets`、`to-spec`、`qa` 等）使用 `gh issue` 命令：

- `gh issue create --title "..." --body "..."` — 创建新 issue
- `gh issue list --label "..."` — 列出打开的 issues
- `gh issue view <number>` — 读取某个 issue

## PRs as a request surface

关闭（默认）。Pull requests 不会被当作 triage 队列的输入，除非将此标志翻转为 On。
