// 界面交互逻辑 - 多产品CSV信号波形对比分析工具
(function() {

var electronIPC = require('electron').ipcRenderer;

// ========== DOM元素引用 ==========
const elements = {
  btnSelectDir: document.getElementById('btn-select-dir'),
  btnRefresh: document.getElementById('btn-refresh'),
  btnReset: document.getElementById('btn-reset'),
  btnExport: document.getElementById('btn-export'),
  btnZoomIn: document.getElementById('btn-zoom-in'),
  btnZoomOut: document.getElementById('btn-zoom-out'),
  btnZoomReset: document.getElementById('btn-zoom-reset'),
  currentDir: document.getElementById('current-dir'),
  statusIndicator: document.getElementById('status-indicator'),
  statusText: document.getElementById('status-text'),
  statFileCount: document.getElementById('stat-file-count'),
  statChannelCount: document.getElementById('stat-channel-count'),
  statMatchedCount: document.getElementById('stat-matched-count'),
  statRowCount: document.getElementById('stat-row-count'),
  channelSearch: document.getElementById('channel-search'),
  channelList: document.getElementById('channel-list'),
  fileList: document.getElementById('file-list'),
  chartTitle: document.getElementById('chart-title'),
  chartContainer: document.getElementById('chart-container'),
  chartPlaceholder: document.getElementById('chart-placeholder'),
  waveformCanvas: document.getElementById('waveform-canvas')
};

// ========== 全局状态 ==========
let state = {
  dirPath: null,
  allChannels: [],
  selectedChannels: [],    // 多选通道名数组
  matchedData: []          // 合并后的所有通道数据
};

// ========== 状态更新工具 ==========
function setStatus(type, text) {
  elements.statusIndicator.className = 'status-indicator status-' + type;
  elements.statusIndicator.textContent = ({
    idle: '\u25CF 就绪',
    loading: '\u25C9 加载中...',
    ready: '\u25CF 已就绪',
    error: '\u25CF 错误'
  })[type] || text;
  elements.statusText.textContent = text;
}

function updateStats(fileCount, channelCount, matchedCount, rowCount) {
  elements.statFileCount.textContent = fileCount || '0';
  elements.statChannelCount.textContent = channelCount || '0';
  elements.statMatchedCount.textContent = matchedCount || '0';
  elements.statRowCount.textContent = rowCount || '0';
}

// ========== 目录选择 ==========
elements.btnSelectDir.addEventListener('click', async () => {
  try {
    const dirPath = await electronIPC.invoke('select-directory');
    if (!dirPath) return;
    await loadDirectory(dirPath);
  } catch (err) {
    console.error('[renderer] select-directory error:', err);
  }
});

async function loadDirectory(dirPath) {
  state.dirPath = dirPath;
  elements.currentDir.textContent = dirPath;
  elements.currentDir.title = dirPath;
  setStatus('loading', '正在扫描目录...');

  var scanResult = await electronIPC.invoke('scan-directory', dirPath);
  if (!scanResult.success || scanResult.files.length === 0) {
    setStatus('error', '未找到CSV文件');
    updateStats(0, 0, 0, 0);
    elements.channelSearch.disabled = true;
    elements.channelList.innerHTML = '<div class="empty-hint">未找到CSV文件</div>';
    return;
  }

  var channelResult = await electronIPC.invoke('get-all-channels', dirPath);
  if (!channelResult.success) {
    setStatus('error', '目录解析失败');
    return;
  }

  state.allChannels = channelResult.channels;
  state.selectedChannels = [];
  state.matchedData = [];
  updateStats(scanResult.files.length, channelResult.channels.length, 0, 0);

  elements.channelSearch.disabled = false;
  elements.btnRefresh.disabled = false;

  renderChannelList('');
  setStatus('ready', '扫描完成，请选择通道（可多选）');
}

// ========== 通道列表渲染（多选） ==========
function renderChannelList(filterText) {
  var filter = filterText.trim();
  var channels = filter
    ? state.allChannels.filter(function(ch) { return ch === filter || ch.includes(filter); })
    : state.allChannels;

  if (channels.length === 0 && filter) {
    elements.channelList.innerHTML = '<div class="channel-item no-match">未检索到对应通道数据</div>';
  } else if (channels.length === 0) {
    elements.channelList.innerHTML = '<div class="empty-hint">无可用通道</div>';
  } else {
    var html = '';
    for (var i = 0; i < channels.length; i++) {
      var ch = channels[i];
      var checked = state.selectedChannels.includes(ch);
      var cssClass = checked ? 'channel-item selected' : 'channel-item';
      html += '<div class="' + cssClass + '" data-channel="' + ch + '">' +
        '<span class="channel-check"></span>' +
        '<span class="channel-name">' + ch + '</span>' +
        '</div>';
    }
    elements.channelList.innerHTML = html;
  }
}

// 通道点击事件（切换选中）
elements.channelList.addEventListener('click', async function(e) {
  var item = e.target.closest('.channel-item');
  if (!item || item.classList.contains('no-match')) return;

  var channelName = item.dataset.channel;
  toggleChannel(channelName);
});

function toggleChannel(channelName) {
  var idx = state.selectedChannels.indexOf(channelName);
  if (idx >= 0) {
    state.selectedChannels.splice(idx, 1);
  } else {
    state.selectedChannels.push(channelName);
  }

  renderChannelList(elements.channelSearch.value);

  // 有选中时自动加载，无选中时清空
  if (state.selectedChannels.length > 0) {
    loadSelectedChannels();
  } else {
    clearViz();
  }
}

// 搜索框输入
var searchTimeout = null;
elements.channelSearch.addEventListener('input', function(e) {
  var value = e.target.value;
  clearTimeout(searchTimeout);

  // 精准匹配自动勾选
  searchTimeout = setTimeout(function() {
    var trimmed = value.trim();
    if (trimmed && state.allChannels.includes(trimmed)) {
      if (!state.selectedChannels.includes(trimmed)) {
        toggleChannel(trimmed);
        return;
      }
    }
  }, 300);

  renderChannelList(value);
});

// ========== 加载所有选中的通道数据 ==========
async function loadSelectedChannels() {
  if (!state.dirPath || state.selectedChannels.length === 0) return;

  var channelNames = state.selectedChannels.slice();
  var channelList = channelNames.join(', ');
  elements.chartTitle.textContent = '通道: ' + channelList;

  setStatus('loading', '正在加载 ' + channelNames.length + ' 个通道数据...');

  // 批量加载每个通道的数据
  var allResults = [];
  for (var i = 0; i < channelNames.length; i++) {
    var ch = channelNames[i];
    var result = await electronIPC.invoke('extract-channel-data', state.dirPath, ch);
    if (result.success && result.results.length > 0) {
      // 给每个series打上通道标签
      for (var j = 0; j < result.results.length; j++) {
        result.results[j].channelName = ch;
        allResults.push(result.results[j]);
      }
    }
  }

  state.matchedData = allResults;

  if (allResults.length === 0) {
    setStatus('error', '所选通道无匹配数据');
    updateStats(
      parseInt(elements.statFileCount.textContent),
      state.allChannels.length,
      0, 0
    );
    window.waveformChart.clear();
    updateFileList([]);
    elements.btnExport.disabled = true;
    elements.btnZoomIn.disabled = true;
    elements.btnZoomOut.disabled = true;
    elements.btnZoomReset.disabled = true;
    return;
  }

  // 渲染波形图（传入不带channelName的series，由chartRenderer处理label）
  window.waveformChart.render(allResults, channelList);

  // 更新统计
  var totalRows = allResults.reduce(function(sum, s) { return sum + s.rowCount; }, 0);
  updateStats(
    parseInt(elements.statFileCount.textContent),
    state.allChannels.length,
    allResults.length,
    totalRows
  );

  updateFileList(allResults);

  elements.btnExport.disabled = false;
  elements.btnZoomIn.disabled = false;
  elements.btnZoomOut.disabled = false;
  elements.btnZoomReset.disabled = false;

  setStatus('ready', '已加载 ' + channelNames.length + ' 个通道，共 ' + allResults.length + ' 个波形');
}

function clearViz() {
  state.matchedData = [];
  elements.chartTitle.textContent = '-- 等待数据加载 --';
  window.waveformChart.clear();
  updateFileList([]);
  updateStats(
    parseInt(elements.statFileCount.textContent),
    state.allChannels.length,
    0, 0
  );
  elements.btnExport.disabled = true;
  elements.btnZoomIn.disabled = true;
  elements.btnZoomOut.disabled = true;
  elements.btnZoomReset.disabled = true;
}

// ========== 匹配文件列表 ==========
function updateFileList(matchedData) {
  var listEl = elements.fileList;
  if (matchedData.length === 0) {
    listEl.innerHTML = '<div class="empty-hint">未匹配文件</div>';
    return;
  }

  // 按通道分组显示
  var groups = {};
  for (var i = 0; i < matchedData.length; i++) {
    var item = matchedData[i];
    var ch = item.channelName || '未知';
    if (!groups[ch]) groups[ch] = [];
    groups[ch].push(item);
  }

  var colorIdx = 0;
  var html = '';
  var channelKeys = Object.keys(groups);
  for (var g = 0; g < channelKeys.length; g++) {
    var chKey = channelKeys[g];
    var items = groups[chKey];
    html += '<div class="file-group">';
    html += '<div class="file-group-header">' + chKey + ' (' + items.length + '个文件)</div>';
    html += '<div class="file-list-compact">';
    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      var color = FILE_COLORS[colorIdx % FILE_COLORS.length];
      colorIdx++;
      html += '<span class="file-tag" style="border-color:' + color + '; color:' + color + '">' +
        '<span class="file-tag-dot" style="background:' + color + '"></span>' +
        item.label + '<em>(' + item.rowCount + '行)</em></span>';
    }
    html += '</div></div>';
  }
  listEl.innerHTML = html;
}

// ========== 刷新 ==========
elements.btnRefresh.addEventListener('click', async function() {
  if (!state.dirPath) return;
  setStatus('loading', '正在刷新...');
  await loadDirectory(state.dirPath);
  if (state.selectedChannels.length > 0) {
    await loadSelectedChannels();
  }
});

// ========== 重置 ==========
elements.btnReset.addEventListener('click', function() {
  state.selectedChannels = [];
  state.matchedData = [];
  elements.channelSearch.value = '';
  elements.channelSearch.disabled = true;
  elements.chartTitle.textContent = '-- 等待数据加载 --';
  window.waveformChart.clear();
  updateFileList([]);
  updateStats(0, 0, 0, 0);
  elements.channelList.innerHTML = '<div class="empty-hint">请先选择数据目录</div>';
  elements.btnExport.disabled = true;
  elements.btnZoomIn.disabled = true;
  elements.btnZoomOut.disabled = true;
  elements.btnZoomReset.disabled = true;
  elements.btnRefresh.disabled = true;
  setStatus('idle', '就绪');
});

// ========== 导出图片 ==========
elements.btnExport.addEventListener('click', async function() {
  var success = await window.waveformChart.exportImage();
  if (success) {
    setStatus('ready', '图片导出成功');
  }
});

// ========== 缩放控制 ==========
elements.btnZoomIn.addEventListener('click', function() {
  window.waveformChart.zoomIn();
});

elements.btnZoomOut.addEventListener('click', function() {
  window.waveformChart.zoomOut();
});

elements.btnZoomReset.addEventListener('click', function() {
  window.waveformChart.resetZoom();
});

// 文件列表颜色（与 chartRenderer 一致）
const FILE_COLORS = [
  '#00FF88', '#FF8C00', '#00CED1', '#FFD700',
  '#FF6347', '#7B68EE', '#00FA9A', '#FF1493',
  '#1E90FF', '#FF4500', '#32CD32', '#BA55D3',
  '#00BFFF', '#FF69B4', '#ADFF2F', '#FFA500'
];

// ========== 初始化 ==========
setStatus('idle', '就绪 - 请选择数据目录');

})();
