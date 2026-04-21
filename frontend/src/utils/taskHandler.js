import api from "./api";
import APP_CONFIG from "../config";
import { validateNetscapeCookie, formatRcloneConfig } from "./format";

/**
 * 添加新下载任务
 * @param {string} url - 视频链接
 * @param {Function} onSuccess - 成功回调
 * @param {Function} onError - 错误回调
 */
export const addTask = async (url, onSuccess, onError) => {
  if (!url) return;
  try {
    await api.post(APP_CONFIG.API.TASKS, { url });
    onSuccess && onSuccess();
  } catch (error) {
    onError && onError(error);
    console.error("添加任务失败", error.response || error.message);
  }
};

/**
 * 重试失败的任务
 * @param {string} taskId - 任务ID
 * @param {Function} onError - 错误回调
 */
export const retryTask = async (taskId, onError) => {
  try {
    await api.post(`${APP_CONFIG.API.TASKS}/${taskId}/retry`);
  } catch (error) {
    onError && onError(error);
    console.error("重试任务失败", error);
  }
};

/**
 * 保存认证配置（yt-dlp Cookie 和 rclone Cookie）
 * @param {Object} config - { ytCookie, rcloneCookie }
 * @param {Function} onSuccess - 成功回调
 * @param {Function} onError - 错误回调
 * @returns {Promise<boolean>} - 是否成功保存
 */
export const saveAuthConfig = async (
  { ytCookie, rcloneCookie },
  onSuccess,
  onError
) => {
  try {
    // 1. 保存 yt-dlp cookie
    if (ytCookie) {
      const validYtCookie = validateNetscapeCookie(ytCookie);
      if (!validYtCookie) {
        onError && onError("yt-dlp Cookie 格式不正确，请确保提供的是 Netscape 格式！");
        return false;
      }
      await api.post(APP_CONFIG.API.SETTING, {
        key: "yt_cookie",
        value: validYtCookie,
      });
    }

    // 2. 提取并保存 rclone cookie
    if (rcloneCookie) {
      const finalRcloneConfig = formatRcloneConfig(rcloneCookie);
      if (!finalRcloneConfig) {
        onError && onError("无法提取 115 凭证，请检查粘贴的 Cookie 是否完整！");
        return false;
      }

      await api.post(APP_CONFIG.API.SETTING, {
        key: "rclone_cookie",
        value: finalRcloneConfig,
      });
    }

    onSuccess && onSuccess();
    return true;
  } catch (error) {
    onError && onError(error);
    console.error("保存配置失败", error);
    return false;
  }
};
