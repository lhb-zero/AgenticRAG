# Tailwind CSS 专项

> 原子化 CSS 框架 — 工具类 / 响应式 / 暗色模式 / 自定义

---

## 目录

- [1. 核心理念](#1-核心理念)
- [2. 常用工具类速查](#2-常用工具类速查)
- [3. 响应式设计](#3-响应式设计)
- [4. 暗色模式](#4-暗色模式)
- [5. 状态变体](#5-状态变体)
- [6. 自定义配置](#6-自定义配置)
- [7. 全局样式](#7-全局样式)
- [8. 本项目的关键样式](#8-本项目的关键样式)

---

## 1. 核心理念

**不写 CSS 文件，直接在 HTML 中用工具类组合样式。**

```html
<!-- 传统方式 -->
<div class="card">
  <h2 class="title">标题</h2>
</div>
<style>
  .card { padding: 16px; background: white; border-radius: 12px; box-shadow: ...; }
  .title { font-size: 20px; font-weight: bold; }
</style>

<!-- Tailwind 方式 -->
<div class="p-4 bg-white rounded-xl shadow-lg">
  <h2 class="text-xl font-bold">标题</h2>
</div>
```

### 优势

- **不命名**：不需要想 CSS 类名
- **不跳转**：不需要在 HTML 和 CSS 文件间切换
- **按需生成**：只打包用到的样式，生产体积极小
- **设计约束**：内置设计系统（间距、颜色、字号），保持视觉一致性

---

## 2. 常用工具类速查

### 2.1 布局

| 类名 | 效果 | 等价 CSS |
|------|------|----------|
| `flex` | 弹性布局 | `display: flex` |
| `flex-col` | 垂直排列 | `flex-direction: column` |
| `flex-1` | 填满剩余空间 | `flex: 1` |
| `items-center` | 垂直居中 | `align-items: center` |
| `justify-between` | 两端对齐 | `justify-content: space-between` |
| `gap-3` | 间距 12px | `gap: 0.75rem` |
| `grid` | 网格布局 | `display: grid` |

### 2.2 间距

```css
p-4    → padding: 1rem (16px)
px-6   → padding-left: 1.5rem; padding-right: 1.5rem
py-2   → padding-top: 0.5rem; padding-bottom: 0.5rem
m-3    → margin: 0.75rem
mt-2   → margin-top: 0.5rem
mb-4   → margin-bottom: 1rem
```

### 2.3 尺寸

```css
w-full     → width: 100%
w-64       → width: 16rem (256px)
max-w-3xl  → max-width: 48rem (768px)
max-w-[80%] → max-width: 80%  (任意值)
h-screen   → height: 100vh
h-24       → height: 6rem (96px)
```

### 2.4 颜色

```css
/* 背景 */
bg-white          → background-color: white
bg-gray-100       → 浅灰
bg-blue-600       → 中蓝
bg-gray-800       → 深灰

/* 文字 */
text-white        → color: white
text-gray-500     → 灰色
text-blue-600     → 蓝色

/* 边框 */
border            → border-width: 1px
border-gray-200   → border-color: light gray
rounded-xl        → border-radius: 0.75rem (12px)
rounded-full      → border-radius: 9999px (圆形)
```

### 2.5 文字

```css
text-sm      → font-size: 0.875rem (14px)
text-lg      → font-size: 1.125rem (18px)
text-xl      → font-size: 1.25rem (20px)
font-bold    → font-weight: 700
font-medium  → font-weight: 500
font-mono    → 等宽字体
whitespace-pre-wrap → 保留换行，自动换行
```

---

## 3. 响应式设计

Tailwind 使用**移动优先**断点：

| 前缀 | 最小宽度 | 适用设备 |
|------|----------|----------|
| （无前缀） | 0px | 手机 |
| `sm:` | 640px | 大屏手机 |
| `md:` | 768px | 平板 |
| `lg:` | 1024px | 笔记本 |
| `xl:` | 1280px | 桌面 |
| `2xl:` | 1536px | 大屏 |

```html
<!-- 手机全宽，桌面限宽 768px 居中 -->
<div class="w-full max-w-3xl mx-auto">
  <!-- 手机竖排，平板横排 -->
  <div class="flex flex-col md:flex-row gap-4">
    ...
  </div>
</div>
```

---

## 4. 暗色模式

### 4.1 激活方式

```html
<!-- layout.tsx 中设置 -->
<html class="dark">
```

### 4.2 使用 dark: 前缀

```html
<!-- 白天白底黑字，晚上黑底白字 -->
<div class="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
  内容
</div>

<!-- 边框 -->
<div class="border border-gray-200 dark:border-gray-700">

<!-- 按钮 -->
<button class="bg-blue-600 dark:bg-blue-500 text-white">
  按钮
</button>
```

### 4.3 本项目当前状态

所有组件已预留 `dark:` 样式类，但未实现动态切换开关。如果需要，可在 `layout.tsx` 中添加主题切换逻辑：

```tsx
// 未来可以这样实现
<html className={theme === "dark" ? "dark" : ""}>
```

---

## 5. 状态变体

```html
<!-- hover：鼠标悬停 -->
<button class="bg-blue-600 hover:bg-blue-700">

<!-- focus：聚焦 -->
<input class="focus:outline-none focus:ring-2 focus:ring-blue-500">

<!-- disabled：禁用 -->
<button class="disabled:opacity-50 disabled:cursor-not-allowed">

<!-- 组合使用 -->
<button class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
```

---

## 6. 自定义配置

### 6.1 tailwind.config.js

```javascript
// frontend/tailwind.config.js
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
        },
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
```

### 6.2 Globals.css

```css
@tailwind base;       /* 基础样式重置 */
@tailwind components; /* 组件类 */
@tailwind utilities;  /* 工具类 */

@layer base {
  :root {
    --background: 255 255 255;
  }
  .dark {
    --background: 10 10 20;
  }
}
```

---

## 7. 全局样式

在 `globals.css` 中定义不需要 Tailwind 类的全局样式：

```css
/* 自定义滚动条 */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.5);
  border-radius: 3px;
}

/* 自定义动画 */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}
```

---

## 8. 本项目的关键样式

### 8.1 全屏聊天布局

```html
<div class="flex flex-col h-screen bg-gray-50 dark:bg-gray-950">
  <!-- Header -->
  <header class="flex items-center justify-between px-6 py-4 bg-white ...">

  <!-- Messages (flex-1 填满剩余空间) -->
  <div class="flex-1 overflow-y-auto px-4 py-6">

  <!-- Input (固定底部) -->
  <div class="border-t ... bg-white px-4 py-4">
</div>
```

### 8.2 消息气泡

```html
<!-- 用户消息（右对齐，蓝底） -->
<div class="flex justify-end mb-4">
  <div class="max-w-[80%] rounded-2xl px-4 py-3 bg-blue-600 text-white">
    消息内容
  </div>
</div>

<!-- AI 消息（左对齐，灰底） -->
<div class="flex justify-start mb-4">
  <div class="max-w-[80%] rounded-2xl px-4 py-3 bg-gray-100 dark:bg-gray-800">
    消息内容
  </div>
</div>
```

### 8.3 审核面板

```html
<!-- 大纲审核（黄色边框） -->
<div class="border border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-5">
  <h3 class="text-lg font-semibold text-yellow-800 dark:text-yellow-200">
    大纲审核
  </h3>
</div>

<!-- 答案审核（绿色边框） -->
<div class="border border-green-400 bg-green-50 dark:bg-green-900/20 rounded-xl p-5">
  <h3 class="text-lg font-semibold text-green-800 dark:text-green-200">
    答案审核
  </h3>
</div>
```

---

## 项目文件索引

| 文件 | 内容 |
|------|------|
| [tailwind.config.js](../frontend/tailwind.config.js) | 主题配置（颜色/动画/自定义） |
| [postcss.config.js](../frontend/postcss.config.js) | PostCSS 插件（Tailwind + Autoprefixer） |
| [app/globals.css](../frontend/app/globals.css) | Tailwind 指令 + 全局自定义样式 |

## 延伸资源

- [Tailwind CSS 文档](https://tailwindcss.com/docs)
- [Tailwind 速查表](https://nerdcave.com/tailwind-cheat-sheet)
- [暗色模式指南](https://tailwindcss.com/docs/dark-mode)