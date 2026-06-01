// 波形图表渲染、交互、导出
(function() {

var electronIPC = require('electron').ipcRenderer;

// 军工风格波形曲线颜色预设
const DEFAULT_COLORS = [
  '#00FF88', '#FF8C00', '#00CED1', '#FFD700',
  '#FF6347', '#7B68EE', '#00FA9A', '#FF1493',
  '#1E90FF', '#FF4500', '#32CD32', '#BA55D3',
  '#00BFFF', '#FF69B4', '#ADFF2F', '#FFA500'
];

class WaveformChartRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.chart = null;
    this.currentData = [];
    this.currentChannelName = '';
    this.lineColors = DEFAULT_COLORS;
  }

  /**
   * 获取曲线颜色（循环使用预设颜色）
   */
  getColor(index) {
    return this.lineColors[index % this.lineColors.length];
  }

  /**
   * 渲染多曲线叠加波形图
   * @param {Array} seriesData - [{ label, timeData, values, rowCount }]
   * @param {string} channelName - 通道名
   */
  render(seriesData, channelName) {
    this.currentData = seriesData;
    this.currentChannelName = channelName;

    // 销毁旧图表
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    if (!seriesData || seriesData.length === 0) {
      this.canvas.style.display = 'none';
      document.getElementById('chart-placeholder').style.display = 'block';
      return;
    }

    // 显示canvas，隐藏占位符
    this.canvas.style.display = 'block';
    document.getElementById('chart-placeholder').style.display = 'none';

    // 构建数据集
    var datasets = seriesData.map((series, index) => ({
      label: series.label,
      data: series.values.map((y, i) => ({
        x: series.timeData[i],
        y: y
      })),
      borderColor: this.getColor(index),
      backgroundColor: this.getColor(index) + '20',
      borderWidth: 1.5,
      pointRadius: 0,
      pointHitRadius: 8,
      tension: 0,
      fill: false,
      clip: true
    }));

    this.chart = new Chart(this.ctx, {
      type: 'line',
      data: { datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        scales: {
          x: {
            type: 'linear',
            title: {
              display: true,
              text: '时间 (ms)',
              color: '#8b91a0',
              font: { family: 'Consolas, monospace', size: 13, weight: 'bold' }
            },
            grid: {
              color: 'rgba(58, 63, 75, 0.4)',
              lineWidth: 0.5
            },
            ticks: {
              color: '#8b91a0',
              font: { family: 'Consolas, monospace', size: 11 },
              callback: function(val) {
                return val.toFixed(1);
              }
            },
            border: {
              color: '#3a3f4b',
              width: 1
            }
          },
          y: {
            title: {
              display: true,
              text: channelName,
              color: '#8b91a0',
              font: { family: 'Consolas, monospace', size: 13, weight: 'bold' }
            },
            grid: {
              color: 'rgba(58, 63, 75, 0.4)',
              lineWidth: 0.5
            },
            ticks: {
              color: '#8b91a0',
              font: { family: 'Consolas, monospace', size: 11 },
              callback: function(val) {
                if (Math.abs(val) < 0.001 && val !== 0) return val.toExponential(2);
                return parseFloat(val.toFixed(4));
              }
            },
            border: {
              color: '#3a3f4b',
              width: 1
            }
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'start',
            labels: {
              color: '#d4d8e0',
              font: { family: 'Consolas, monospace', size: 12 },
              usePointStyle: true,
              pointStyleWidth: 10,
              boxWidth: 20,
              padding: 12
            }
          },
          tooltip: {
            enabled: true,
            mode: 'index',
            intersect: false,
            backgroundColor: '#1a1d23',
            titleColor: '#00ced1',
            bodyColor: '#d4d8e0',
            borderColor: '#3a3f4b',
            borderWidth: 1,
            titleFont: { family: 'Consolas, monospace', size: 13, weight: 'bold' },
            bodyFont: { family: 'Consolas, monospace', size: 12 },
            callbacks: {
              title: function(items) {
                if (items.length > 0) {
                  return '时间: ' + items[0].parsed.x.toFixed(2) + ' ms';
                }
                return '';
              },
              label: function(context) {
                return context.dataset.label + ': ' + context.parsed.y.toFixed(4);
              }
            }
          },
          zoom: {
            pan: {
              enabled: true,
              mode: 'xy',
              modifierKey: null
            },
            zoom: {
              wheel: {
                enabled: true,
                modifierKey: null
              },
              pinch: {
                enabled: true
              },
              drag: {
                enabled: true,
                backgroundColor: 'rgba(0, 206, 209, 0.1)',
                borderColor: '#00ced1',
                borderWidth: 1
              },
              mode: 'xy'
            },
            limits: {
              x: { minRange: 0.01 },
              y: { minRange: 0.001 }
            }
          }
        }
      }
    });

    // 双击重置缩放
    var chart = this.chart;
    this.canvas.ondblclick = function() {
      chart.resetZoom();
    };
  }

  /**
   * 导出为PNG图片
   */
  async exportImage() {
    if (!this.chart) return false;

    try {
      var base64Image = this.chart.toBase64Image('image/png', 2.0);
      var base64Data = base64Image.replace(/^data:image\/png;base64,/, '');

      var filePath = await electronIPC.invoke('export-image-dialog');
      if (!filePath) return false;

      var result = await electronIPC.invoke('save-image', filePath, base64Data);
      return result.success;
    } catch (e) {
      console.error('导出图片失败:', e);
      return false;
    }
  }

  /**
   * 清空图表
   */
  clear() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    this.currentData = [];
    this.currentChannelName = '';
    this.canvas.style.display = 'none';
    document.getElementById('chart-placeholder').style.display = 'block';
  }
}

// 导出全局单例
window.waveformChart = new WaveformChartRenderer('waveform-canvas');

})();
