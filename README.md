# Feishu Bot Cloudflare Worker

飞书多维表格监控机器人，部署在 Cloudflare Workers 上。

## 功能

- 多维表格监控与每日巡检
- 风险预警与消息推送
- AI 分析（DeepSeek）
- 群聊管理
- 数据备份到 D1

## 配置

### 1. Cloudflare 资源

```bash
# 创建 KV namespace
wrangler kv namespace create KV

# 创建 D1 database
wrangler d1 create feishu-bot-backups

# 设置 secrets
wrangler secret put FEISHU_APP_ID
wrangler secret put FEISHU_APP_SECRET
wrangler secret put DEEPSEEK_API_KEY
```

### 2. 飞书应用配置

在飞书开放平台配置：
- 事件订阅方式：将事件发送至开发者服务器
- 请求网址：`https://feishu-bot.<your-subdomain>.workers.dev/webhook`
- 订阅事件：`im.message.receive_v1`

### 3. 部署

```bash
npm install
wrangler deploy
```

## 指令

机器人支持以下指令：

| 中文 | English | 功能 |
|------|---------|------|
| 建群 | create groups | 一键建群 |
| 我的任务 | tasks | 查看待办 |
| 项目汇总 | summary | 风险汇报 |
| 列表 | list | 监控列表 |
| 停止 N | stop N | 移除项目 |
| 监控+URL | add+URL | 添加项目 |
| 立即巡检 | run | 立即检查 |
| 帮助 | help | 指令列表 |

## License

Internal use only.