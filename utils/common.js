// 通用工具函数

/**
 * 从文件路径中提取文件名（去除扩展名）
 */
function getBaseName(filePath) {
  const parts = filePath.replace(/\\/g, '/').split('/');
  const fileName = parts[parts.length - 1];
  return fileName.replace(/\.csv$/i, '');
}

/**
 * 安全解析浮点数
 */
function parseSafeFloat(str) {
  const val = parseFloat(str);
  return isNaN(val) ? null : val;
}

/**
 * 格式化文件大小显示
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

module.exports = {
  getBaseName,
  parseSafeFloat,
  formatFileSize
};
