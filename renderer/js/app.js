// 界面交互逻辑 - 多产品CSV信号波形对比分析工具
(function() {

var electronIPC = require('electron').ipcRenderer;

// ========== DOM元素引用 ==========
const elements = {
  btnSelectDir: document.getElementById('btn-select-dir'),
  btnRefresh: document.getElementById('btn-refresh'),
  btnReset: document.getElementById('btn-reset'),
  btnExport: document.getElementById('btn-export'),
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
  selectedChannel: null,
  matchedData: []
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

  // 扫描CSV文件
  const scanResult = await electronIPC.invoke('scan-directory', dirPath);
  if (!scanResult.success || scanResult.files.length === 0) {
    setStatus('error', '未找到CSV文件');
    updateStats(0, 0, 0, 0);
    elements.channelSearch.disabled = true;
    elements.channelList.innerHTML = '<div class="empty-hint">未找到CSV文件</div>';
    return;
  }

  // 获取所有通道名
  const channelResult = await electronIPC.invoke('get-all-channels', dirPath);
  if (!channelResult.success) {
    setStatus('error', '目录解析失败');
    return;
  }

  state.allChannels = channelResult.channels;
  updateStats(scanResult.files.length, channelResult.channels.length, 0, 0);

  // 启用UI
  elements.channelSearch.disabled = false;
  elements.btnRefresh.disabled = false;

  // 渲染通道列表
  renderChannelList('');
  setStatus('ready', '扫描完成，请选择通道');
}

// ========== 通道列表渲染 ==========
function renderChannelList(filterText) {
  const filter = filterText.trim();
  const channels = filter
    ? state.allChannels.filter(ch => ch === filter || ch.includes(filter))
    : state.allChannels;

  if (filter && state.allChannels.includes(filter) && channels.length === 0) {
    // filter精确命中
  }

  if (channels.length === 0 && filter) {
    elements.channelList.innerHTML = '<div class="channel-item no-match">未检索到对应通道数据</div>';
  } else if (channels.length === 0) {
    elements.channelList.innerHTML = '<div class="empty-hint">无可用通道</div>';
  } else {
    elements.channelList.innerHTML = channels.map(ch => {
      const isSelected = ch === state.selectedChannel;
      const cssClass = isSelected ? 'channel-item active' : 'channel-item';
      return '<div class="' + cssClass + '" data-channel="' + ch + '">' + ch + '</div>';
    }).join('');
  }
}

// 通道点击事件
elements.channelList.addEventListener('click', async (e) => {
  const item = e.target.closest('.channel-item');
  if (!item || item.classList.contains('no-match')) return;

  const channelName = item.dataset.channel;
  if (channelName === state.selectedChannel) return;

  await selectChannel(channelName);
});

// 搜索框输入
let searchTimeout = null;
elements.channelSearch.addEventListener('input', (e) => {
  const value = e.target.value;

  // 自动精准匹配：如果输入正好匹配某个通道名
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    if (value.trim() && state.allChannels.includes(value.trim())) {
      await selectChannel(value.trim());
    }
  }, 300);

  renderChannelList(value);
});

// ========== 通道选择与数据加载 ==========
async function selectChannel(channelName) {
  if (!state.dirPath) return;

  state.selectedChannel = channelName;
  elements.channelSearch.value = channelName;
  elements.chartTitle.textContent = '通道: ' + channelName;

  setStatus('loading', '正在加载通道数据: ' + channelName);

  const result = await electronIPC.invoke('extract-channel-data', state.dirPath, channelName);
  if (!result.success) {
    setStatus('error', '数据加载失败');
    return;
  }

  state.matchedData = result.results;

  if (result.results.length === 0) {
    setStatus('error', '未检索到对应通道数据');
    updateStats(
      parseInt(elements.statFileCount.textContent),
      state.allChannels.length,
      0, 0
    );
    window.waveformChart.clear();
    updateFileList([]);
    elements.btnExport.disabled = true;
    renderChannelList(elements.channelSearch.value);
    return;
  }

  // 渲染波形图
  window.waveformChart.render(result.results, channelName);

  // 更新统计
  const totalRows = result.results.reduce((sum, s) => sum + s.rowCount, 0);
  updateStats(
    parseInt(elements.statFileCount.textContent),
    state.allChannels.length,
    result.results.length,
    totalRows
  );

  // 更新文件列表
  updateFileList(result.results);

  // 启用导出按钮
  elements.btnExport.disabled = false;

  setStatus('ready', '已加载 ' + result.results.length + ' 个文件的 ' + channelName + ' 通道数据');
  renderChannelList(elements.channelSearch.value);
}

// ========== 匹配文件列表 ==========
function updateFileList(matchedData) {
  if (matchedData.length === 0) {
    elements.fileList.innerHTML = '<div class="empty-hint">未匹配文件</div>';
    return;
  }

  const colors = FILE_COLORS;
  elements.fileList.innerHTML = matchedData.map((item, index) => {
    const color = colors[index % colors.length];
    return '' +
      '<div class="file-item">' +
        '<span class="file-dot" style="background:' + color + '; border:1px solid ' + color + '"></span>' +
        '<span>' + item.label + '</span>' +
        '<span style="color:#5c6270; font-size:11px;">(' + item.rowCount + '行)</span>' +
      '</div>';
  }).join('');
}

// ========== 刷新 ==========
elements.btnRefresh.addEventListener('click', async () => {
  if (!state.dirPath) return;
  setStatus('loading', '正在刷新...');
  await loadDirectory(state.dirPath);
  if (state.selectedChannel) {
    await selectChannel(state.selectedChannel);
  }
});

// ========== 重置 ==========
elements.btnReset.addEventListener('click', () => {
  state.selectedChannel = null;
  state.matchedData = [];
  elements.channelSearch.value = '';
  elements.channelSearch.disabled = true;
  elements.chartTitle.textContent = '-- 等待数据加载 --';
  window.waveformChart.clear();
  updateFileList([]);
  updateStats(0, 0, 0, 0);
  elements.channelList.innerHTML = '<div class="empty-hint">请先选择数据目录</div>';
  elements.btnExport.disabled = true;
  elements.btnRefresh.disabled = true;
  setStatus('idle', '就绪');
});

// ========== 导出图片 ==========
elements.btnExport.addEventListener('click', async () => {
  const success = await window.waveformChart.exportImage();
  if (success) {
    setStatus('ready', '图片导出成功');
  }
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
