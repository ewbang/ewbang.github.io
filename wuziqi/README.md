# 五子棋复盘研究

基于纯前端实现的五子棋（Gobang）双人对弈与复盘工具，支持禁手规则、局面代码复制/粘贴还原与棋局图片导出。

**在线 Demo：** [https://ewbang-github-io.pages.dev/wuziqi/](https://ewbang-github-io.pages.dev/wuziqi/)

<img width="2560" height="1409" alt="image" src="https://github.com/user-attachments/assets/5b66633d-904e-46eb-83ae-a123ea851b1d" />


## 功能特性

- **双人对弈**：黑先白后，轮流落子，先五子连珠者胜
- **禁手规则**：可选开启黑棋禁手（三三、四四、长连），并支持显示/隐藏禁手点
- **局面代码**：格式为 `H8H7G7…`（列 A～O + 行 1～15），支持复制当前局面代码与粘贴局面代码一键还原棋局
- **悔棋**：支持撤销上一步
- **保存图片**：将当前棋局导出为 PNG 图片（含棋盘主题与坐标）
- **棋盘主题**：多种棋盘配色（金黄木色、深棕红木、翡翠绿、竹质色等）
- **显示序号**：可选在棋子上显示落子顺序
- **规则说明**：页面内规则介绍弹窗

## 项目结构

```
五子棋/
├── index.html      # 主页面
├── css/
│   └── styles.css  # 样式
├── js/
│   └── script.js   # 游戏逻辑与交互
└── README.md
```

## 如何运行

用本地服务器打开项目根目录即可（避免直接打开 `index.html` 时路径 `/css/`、`/js/` 异常）。

**方式一：VS Code Live Server**  
右键 `index.html` → “Open with Live Server”。

**方式二：Python**  
在项目根目录执行：

```bash
# Python 3
python -m http.server 8080
```

浏览器访问：`http://localhost:8080`

**方式三：Node.js**  
安装 `npx serve` 后执行：

```bash
npx serve .
```

按提示在浏览器打开对应地址。

## 基本规则简述

- 棋盘：15×15，坐标横向 A～O、纵向 1～15
- 胜利：横、竖、斜任一方向先连成五子即获胜
- 禁手（可选）：仅对黑棋，包括三三、四四、长连，可在设置中开关

详细规则见页面内 **「规则说明」** 按钮。

## 技术说明

- 纯 HTML + CSS + JavaScript，无框架依赖
- 棋局图片通过 Canvas 绘制生成，与当前主题、坐标一致
- 棋盘主题与部分设置使用 `localStorage` 持久化

## 许可证

本项目仅供学习与复盘研究使用。
