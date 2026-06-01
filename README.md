# 多产品CSV信号波形对比分析工具

## 功能概述
军工测试数据可视化工具，支持：
- 递归扫描目录下所有CSV文件
- 多文件同通道波形叠加对比
- 通道精准搜索与自动绘图
- 缩放、平移、悬浮取值、图片导出

## 技术栈
- Electron 28
- Chart.js 4.4 + chartjs-plugin-zoom
- 原生JS实现CSV解析

## 启动
```bash
cd csv-waveform-tool
npm install
npm start
```

## 项目结构
```
csv-waveform-tool/
├── main/          # 主进程（Electron核心、文件操作）
│   ├── index.js           # 入口、窗口创建
│   ├── fileScanner.js     # 递归扫描CSV文件
│   ├── csvParser.js       # CSV解析引擎
│   └── ipcHandlers.js     # IPC通信处理
├── renderer/      # 渲染进程（界面、图表）
│   ├── index.html         # 军工风主页面
│   ├── css/style.css      # 军工风格样式
│   └── js/
│       ├── app.js         # 界面交互逻辑
│       └── chartRenderer.js # 波形图表渲染
├── utils/         # 公共工具
├── config/        # 项目配置
└── package.json
```

## 使用说明
1. 启动应用 → 点击"选择目录" → 选择包含CSV数据的根文件夹
2. 程序自动扫描并显示所有可用通道
3. 输入/选择目标通道名 → 自动绘制多文件波形叠加图
4. 鼠标滚轮缩放、拖拽平移、悬停查看数值
5. 点击"导出图片"保存当前波形图
