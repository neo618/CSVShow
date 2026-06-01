// 软件配置 - 多产品CSV信号波形对比分析工具

module.exports = {
  // 软件版本
  version: '1.0.0',

  // 窗口配置
  window: {
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: '多产品CSV信号波形对比分析工具'
  },

  // CSV解析规则
  csv: {
    delimiter: ',',           // 分隔符
    encoding: 'utf8',         // 编码
    timeColumnIndex: 0,       // 时间列索引（第一列）
    headerRowIndex: 0         // 表头行索引（第一行）
  },

  // 图表配置
  chart: {
    maxCurves: 0,             // 0 = 无限制
    truncateData: false,      // 不截断数据
    defaultColors: [
      '#00FF88', '#FF8C00', '#00CED1', '#FFD700',
      '#FF6347', '#7B68EE', '#00FA9A', '#FF1493',
      '#1E90FF', '#FF4500', '#32CD32', '#BA55D3',
      '#00BFFF', '#FF69B4', '#ADFF2F', '#FFA500'
    ]
  }
};
