# deepseek-search-mcp

本地 MCP Server，把 [DeepSeek Search & Fetch API](https://api-docs.deepseek.com/zh-cn/guides/search/) 封装成两个 MCP 工具，让任何支持 MCP 的 AI Agent（Kimi Code、Claude Code、Cursor、Claude Desktop 等）都能使用 DeepSeek 自研搜索引擎进行网页搜索和抓取。

A local MCP server that wraps the DeepSeek Search & Fetch APIs, exposing `deepseek_search` and `deepseek_fetch` tools to any MCP-compatible AI agent.

## 功能

| 工具 | 说明 |
|---|---|
| `deepseek_search` | 网页搜索，返回标题、URL、摘要、发布时间、相关性评分（0–3，≥1.5 为优质）和权威性评分（0–4，≥3 为极权威）。支持 `site:`、`-site:`、`"精确短语"`、`lang:zh,en`、`after:`、`before:` 等搜索语法 |
| `deepseek_fetch` | 抓取单个网页，返回 Markdown 正文 |

工程特性：

- 纯本地 stdio 模式，无需部署服务器
- API Key 只从环境变量 `DEEPSEEK_API_KEY` 读取
- 408 / 429 / 5xx 自动指数退避重试（最多 3 次），其他 4xx 不重试
- 60 秒请求超时

## 要求

- Node.js ≥ 18（使用了全局 `fetch`）
- 一个 DeepSeek API Key（<https://platform.deepseek.com/>）

## 安装

```bash
git clone https://github.com/Wildare-98/deepseek-search-mcp.git
cd deepseek-search-mcp
npm install
```

## 配置

在 MCP 客户端的配置文件中加入（以 Kimi Code / Claude Desktop / Cursor 的 JSON 格式为例）：

```json
{
  "mcpServers": {
    "deepseek-search": {
      "command": "node",
      "args": ["/绝对路径/deepseek-search-mcp/index.js"],
      "env": {
        "DEEPSEEK_API_KEY": "sk-你的key"
      }
    }
  }
}
```

各客户端配置文件位置：

- **Kimi Code**：`~/.kimi-code/mcp.json`（或 `$KIMI_CODE_HOME/mcp.json`）
- **Claude Desktop**：`%APPDATA%\Claude\claude_desktop_config.json`（Windows）/ `~/Library/Application Support/Claude/claude_desktop_config.json`（macOS）
- **Cursor**：设置 → MCP 面板

也可以把 `DEEPSEEK_API_KEY` 设为系统环境变量，然后从配置中删掉 `env` 段，子进程会自动继承。

改完配置后重启客户端（Kimi Code 用 `/new` 开新会话），用 `/mcp` 或对应面板确认连接状态。

## 使用建议

1. 先 `deepseek_search`（`need_content=false`）拿到概览；
2. 按 `rerank_score`、`authority`、`date` 挑出 1–3 个最佳结果；
3. 只对选中的 URL 调用 `deepseek_fetch` 读全文。

这样最省上下文，也最稳定。

## 计费与限速（官方）

- Search / Fetch 均为每 1,000 次成功请求 5 元，失败、无结果、超时不计费
- Search 限速 100 QPS，Fetch 限速 25 QPS

详见 [DeepSeek 官方文档](https://api-docs.deepseek.com/zh-cn/guides/search/)。

## License

MIT
