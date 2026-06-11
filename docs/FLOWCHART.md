# 对话流程图

> 从用户发送消息到收到最终答案的完整流程。

## 整体流程

```mermaid
flowchart TD
    A([用户发送消息]) --> B[classify_query 分类器]
    B -->|闲聊| C[direct_reply 直接回复]
    B -->|知识问题| D[research 研究员子图]
    C --> E([返回答案 · 结束])

    D --> F[generate_outline 生成大纲]
    F --> G{大纲审核 HITL}
    G -->|✅ 批准| H[generate_draft 生成草稿]
    G -->|✏️ 编辑| F
    G -->|❌ 打回| D

    H --> I{答案审核 HITL}
    I -->|✅ 批准| J[finalize 最终化]
    I -->|✏️ 编辑| H
    I -->|❌ 打回| D

    J --> K([返回最终答案 · 结束])
```

## 研究员子图（research 内部）

```mermaid
flowchart TD
    A([进入研究]) --> B[plan 生成检索计划]
    B --> C[retrieve 向量检索]
    C --> D[grade 文档打分]
    D -->|有相关文档| E[finalize 整理结果]
    D -->|无相关文档| F[rewrite 改写查询]
    F -->|未超过重试次数| B
    F -->|超过重试次数| E
    E --> G([返回主图])
```

## 前端交互流程

```mermaid
flowchart TD
    A([打开页面]) --> B{有活跃对话?}
    B -->|否| C[显示欢迎页 + 快捷提问]
    B -->|是| D[显示消息列表]

    C --> E[用户输入/点击提问]
    D --> E

    E --> F[创建会话 · 存入 localStorage]
    F --> G[POST /api/chat · SSE 流]
    G --> H{事件类型}

    H -->|token| I[追加到流式消息]
    H -->|researching| J[状态: 检索中]
    H -->|outline_review| K[显示大纲审核面板]
    H -->|answer_review| L[显示答案审核面板]
    H -->|done| M[显示最终答案]
    H -->|error| N[显示错误信息]

    K -->|用户操作| O{决策}
    O -->|批准/编辑/打回| P[POST /api/review]
    P --> G

    L -->|用户操作| Q{决策}
    Q -->|批准/编辑/打回| P

    I --> H
    J --> H
    M --> R([对话结束])
    N --> R
```

## 状态流转

```
idle → researching → outline_review → generating → answer_review → done
                ↑          │                 ↑          │
                └──────────┘(打回)            └──────────┘(打回)
```

| 前端 phase | 对应节点 | 用户看到的 |
|------------|---------|-----------|
| idle | — | 欢迎页 |
| researching | classify_query → research | "正在检索相关知识库文档..." |
| outline_review | generate_outline (interrupt) | 大纲审核面板 |
| generating | generate_draft | "正在生成答案..." |
| answer_review | generate_draft (interrupt) | 答案审核面板 + 幻觉检测结果 |
| done | finalize | 最终答案 |
| error | — | 错误信息 |
