const APP_CONFIG = {
  // API 与后端交互
  API_BASE_URL: 'http://localhost:8000',
  API: {
    VERIFY: '/api/verify',
    TASKS: '/api/tasks',
    SETTING: '/api/settings',
  },

  // 本地存储 key
  STORAGE_KEYS: {
    API_KEY: 'video_sync_api_key',
  },

  // 任务页面 tab 常量
  TABS: {
    TASKS: 'tasks',
    SETTINGS: 'settings',
  },

  // rclone 115 节点处理
  RCLONE: {
    PREFIX: '[115]',
    TEMPLATE: (uid, cid, seid, kid) =>
      `[115]\ntype = 115\nuid = ${uid}\ncid = ${cid}\nseid = ${seid}\nkid = ${kid}`,
    COOKIE_KEYS: ['uid', 'cid', 'seid', 'kid'],
  },

  // 通用提示信息
  MESSAGE: {
    LOGIN_ERROR: '密码错误或后端服务未启动',
    SAVE_SUCCESS: '配置已成功解析并保存！',
    SAVE_FAIL: '保存失败',
    COOKIE_EXTRACT_FAIL:
      '提取失败：未在您填写的文本中找到 uid, cid, seid 或 kid。请确认填写的是完整的 115 Cookie 字符串！',
    ADD_TASK_FAIL: '添加失败',
    RETRY_FAIL: '重试触发失败',
  },
};

export default APP_CONFIG;
