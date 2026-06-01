// 进程通信处理：渲染进程 ↔ 主进程

const { ipcMain, dialog, BrowserWindow } = require('electron');
const path = require('path');
const { scanCSVFiles } = require('./fileScanner');
const { parseCSV } = require('./csvParser');

/**
 * 注册所有IPC处理器
 */
function registerIpcHandlers() {
  // 选择文件夹
  ipcMain.handle('select-directory', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title: '选择包含CSV数据的根文件夹',
      properties: ['openDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  // 扫描目录中的CSV文件
  ipcMain.handle('scan-directory', async (event, dirPath) => {
    try {
      const files = scanCSVFiles(dirPath);
      return { success: true, files };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // 解析指定通道的数据（从所有CSV文件中提取）
  ipcMain.handle('extract-channel-data', async (event, dirPath, channelName) => {
    try {
      const files = scanCSVFiles(dirPath);
      const results = [];

      for (const file of files) {
        const parsed = parseCSV(file.path);
        if (!parsed) continue;

        // 精准匹配通道名
        if (parsed.channels.includes(channelName)) {
          const baseName = file.name.replace(/\.csv$/i, '');
          results.push({
            fileName: file.name,
            label: baseName,
            filePath: file.path,
            timeData: parsed.timeData,
            values: parsed.channelData[channelName],
            rowCount: parsed.rowCount
          });
        }
      }

      return { success: true, results, channelName };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // 获取所有通道名（从整个目录汇总）
  ipcMain.handle('get-all-channels', async (event, dirPath) => {
    try {
      const files = scanCSVFiles(dirPath);
      const allChannels = new Set();

      for (const file of files) {
        const parsed = parseCSV(file.path);
        if (!parsed) continue;
        for (const ch of parsed.channels) {
          allChannels.add(ch);
        }
      }

      return {
        success: true,
        channels: Array.from(allChannels).sort(),
        fileCount: files.length
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // 导出图片 - 保存对话框
  ipcMain.handle('export-image-dialog', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win, {
      title: '导出波形图片',
      defaultPath: 'waveform.png',
      filters: [
        { name: 'PNG图片', extensions: ['png'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });

    if (result.canceled) return null;
    return result.filePath;
  });

  // 保存图片文件
  ipcMain.handle('save-image', async (event, filePath, base64Data) => {
    try {
      const fs = require('fs');
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(filePath, buffer);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

module.exports = { registerIpcHandlers };
