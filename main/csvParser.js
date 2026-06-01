// CSV解析模块：读取文件、提取通道、解析数据

const fs = require('fs');

/**
 * 解析CSV文件
 * @param {string} filePath - CSV文件路径
 * @returns {{ channels: string[], timeData: number[], channelData: Object<string, number[]>, rowCount: number } | null}
 *   解析成功返回数据对象，失败返回null
 */
function parseCSV(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) return null;

    const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) return null;

    // 解析表头（第一行）
    const headers = parseCSVLine(lines[0]);
    if (headers.length < 2) return null;

    // 第一列是时间列，其余是通道
    const channelHeaders = headers.slice(1);

    // 通道去重：单文件内重复通道名，仅读取第一个
    const seenChannels = new Set();
    const channelMap = new Map(); // channelName -> columnIndex(1-based, after time col)
    const orderedChannels = [];

    for (let i = 0; i < channelHeaders.length; i++) {
      const ch = channelHeaders[i].trim();
      if (!seenChannels.has(ch)) {
        seenChannels.add(ch);
        channelMap.set(ch, i + 1);
        orderedChannels.push(ch);
      }
    }

    // 初始化数据存储
    const timeData = [];
    const channelData = {};
    for (const ch of orderedChannels) {
      channelData[ch] = [];
    }

    // 解析数据行
    for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
      const values = parseCSVLine(lines[rowIdx]);
      if (values.length < 2) continue;

      const timeVal = parseFloat(values[0]);
      if (isNaN(timeVal)) continue;
      timeData.push(timeVal);

      for (const ch of orderedChannels) {
        const colIdx = channelMap.get(ch);
        const val = colIdx < values.length ? parseFloat(values[colIdx]) : NaN;
        channelData[ch].push(isNaN(val) ? 0 : val);
      }
    }

    return {
      channels: orderedChannels,
      timeData,
      channelData,
      rowCount: timeData.length
    };
  } catch (e) {
    return null; // 解析失败，静默跳过
  }
}

/**
 * 解析CSV行（处理引号包裹的字段）
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

module.exports = { parseCSV };
