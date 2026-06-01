// 文件扫描模块：递归遍历文件夹、筛选CSV文件

const fs = require('fs');
const path = require('path');

/**
 * 递归遍历目录，收集所有.csv文件
 * @param {string} dirPath - 根目录路径
 * @returns {Array<{name: string, path: string, size: number}>}
 */
function scanCSVFiles(dirPath) {
  const results = [];

  function walk(currentPath) {
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.csv')) {
          try {
            const stat = fs.statSync(fullPath);
            results.push({
              name: entry.name,
              path: fullPath,
              size: stat.size
            });
          } catch (e) {
            // 读取文件信息失败，跳过
          }
        }
      }
    } catch (e) {
      // 目录读取失败，跳过
    }
  }

  walk(dirPath);
  return results;
}

module.exports = { scanCSVFiles };
