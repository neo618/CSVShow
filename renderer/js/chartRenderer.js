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
    this.savedXMin = null;
    this.savedXMax = null;
  }

  getColor(index) {
    return this.lineColors[index % this.lineColors.length];
  }

  render(seriesData, channelName) {
    this.currentData = seriesData;
    this.currentChannelName = channelName;

    // 保存当前缩放/平移状态
    var prevXMin = null, prevXMax = null;
    if (this.chart) {
      var xs = this.chart.scales.x;
      prevXMin = xs.min;
      prevXMax = xs.max;
      this.chart.destroy();
      this.chart = null;
    }

    if (!seriesData || seriesData.length === 0) {
      this.canvas.style.display = 'none';
      document.getElementById('chart-placeholder').style.display = 'block';
      return;
    }

    this.canvas.style.display = 'block';
    document.getElementById('chart-placeholder').style.display = 'none';

    var datasets = seriesData.map((series, index) => ({
      label: (series.channelName ? '[' + series.channelName + '] ' : '') + series.label,
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

    var self = this;

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
              enabled: false
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
                enabled: false
              },
              mode: 'x'
            },
            limits: {
              x: { minRange: 0.01 }
            }
          }
        }
      }
    });

    // 恢复之前的X轴缩放/平移范围
    if (prevXMin !== null && prevXMax !== null && this.chart) {
      this.chart.zoomScale('x', { min: prevXMin, max: prevXMax }, 'default');
      this.chart.update('none');
    }

    // 手动鼠标交互（左键框选放大 + 右键拖拽平移）
    this._setupMouseInteraction();

    // 缩放按钮事件暴露到全局
    window._chartInstance = this;
  }

  // 左键框选放大 + 右键拖拽平移
  _setupMouseInteraction() {
    var self = this;
    var canvas = this.canvas;
    if (canvas._mouseBound) return;
    canvas._mouseBound = true;

    // --- 框选状态 ---
    var selecting = false;
    var selStartX = 0;
    var selStartY = 0;
    var selBox = null;

    // --- 右键平移状态 ---
    var panning = false;
    var panStartX = 0;
    var panStartXMin = 0;
    var panStartXMax = 0;

    // 创建框选矩形元素
    function ensureSelBox() {
      if (selBox) return;
      selBox = document.createElement('div');
      selBox.style.cssText = 'position:fixed;border:1px dashed #00ced1;background:rgba(0,206,209,0.08);pointer-events:none;z-index:9999;display:none;';
      document.body.appendChild(selBox);
    }

    canvas.addEventListener('mousedown', function(e) {
      if (!self.chart) return;
      if (e.button === 2) {
        // 右键：开始平移
        e.preventDefault();
        panning = true;
        panStartX = e.clientX;
        var xs = self.chart.scales.x;
        panStartXMin = xs.min;
        panStartXMax = xs.max;
        canvas.style.cursor = 'grabbing';
        return;
      }
      if (e.button === 0) {
        // 左键：开始框选
        ensureSelBox();
        selecting = true;
        selStartX = e.clientX;
        selStartY = e.clientY;
        canvas.style.cursor = 'crosshair';
        return;
      }
    });

    canvas.addEventListener('contextmenu', function(e) {
      e.preventDefault();
    });

    window.addEventListener('mousemove', function(e) {
      if (selecting && self.chart) {
        var x1 = selStartX, x2 = e.clientX;
        var y1 = selStartY, y2 = e.clientY;
        selBox.style.left = Math.min(x1, x2) + 'px';
        selBox.style.top = Math.min(y1, y2) + 'px';
        selBox.style.width = Math.abs(x2 - x1) + 'px';
        selBox.style.height = Math.abs(y2 - y1) + 'px';
        selBox.style.display = 'block';
        return;
      }
      if (panning && self.chart) {
        var dx = e.clientX - panStartX;
        var chartArea = self.chart.chartArea;
        if (!chartArea) return;
        var pxRange = chartArea.right - chartArea.left;
        var valPerPx = (panStartXMax - panStartXMin) / pxRange;
        var offset = -dx * valPerPx;
        self.chart.zoomScale('x', { min: panStartXMin + offset, max: panStartXMax + offset }, 'default');
        self.chart.update('none');
      }
    });

    window.addEventListener('mouseup', function(e) {
      if (selecting && self.chart) {
        selecting = false;
        canvas.style.cursor = '';
        if (selBox) selBox.style.display = 'none';

        // 计算框选区域→数据范围
        var chartArea = self.chart.chartArea;
        if (!chartArea) return;
        var xs = self.chart.scales.x;
        var rect = canvas.getBoundingClientRect();

        var boxLeft = Math.min(selStartX, e.clientX) - rect.left - chartArea.left;
        var boxRight = Math.max(selStartX, e.clientX) - rect.left - chartArea.left;
        var pxWidth = chartArea.right - chartArea.left;

        var minSelSize = 8;
        if (Math.abs(e.clientX - selStartX) < minSelSize && Math.abs(e.clientY - selStartY) < minSelSize) return;

        var newMin = xs.min + (boxLeft / pxWidth) * (xs.max - xs.min);
        var newMax = xs.min + (boxRight / pxWidth) * (xs.max - xs.min);

        // 限制最小范围
        if (newMax - newMin < 0.01) return;

        self.chart.zoomScale('x', { min: newMin, max: newMax }, 'default');
        self.chart.update('none');
        return;
      }
      if (panning) {
        panning = false;
        canvas.style.cursor = '';
      }
    });
  }

  // 放大（X轴，当前中心点）
  zoomIn() {
    if (!this.chart) return;
    var xScale = this.chart.scales.x;
    var factor = 0.6;
    var xCenter = (xScale.max + xScale.min) / 2;
    var xRange = (xScale.max - xScale.min) * factor;
    this.chart.zoomScale('x', { min: xCenter - xRange / 2, max: xCenter + xRange / 2 }, 'default');
    this.chart.update('none');
  }

  // 缩小（X轴，当前中心点）
  zoomOut() {
    if (!this.chart) return;
    var xScale = this.chart.scales.x;
    var factor = 1.6;
    var xCenter = (xScale.max + xScale.min) / 2;
    var xRange = (xScale.max - xScale.min) * factor;
    this.chart.zoomScale('x', { min: xCenter - xRange / 2, max: xCenter + xRange / 2 }, 'default');
    this.chart.update('none');
  }

  // 重置缩放
  resetZoom() {
    if (!this.chart) return;
    this.chart.resetZoom();
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
