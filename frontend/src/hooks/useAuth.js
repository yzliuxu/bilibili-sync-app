import { useState, useEffect } from "react";
import api from "../utils/api";
import APP_CONFIG from "../config";

/**
 * 自定义Hook: 管理用户认证状态
 * @returns {Object} { isAuthenticated, verifyKey, loginError }
 */
export const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(import.meta.env.DEV);
  const [loginError, setLoginError] = useState("");

  /**
   * 验证API密钥
   * @param {string} key - API密钥
   */
  const verifyKey = async (key) => {
    try {
      await api.get(APP_CONFIG.API.VERIFY, { headers: { "X-API-Key": key } });
      localStorage.setItem(APP_CONFIG.STORAGE_KEYS.API_KEY, key);
      setIsAuthenticated(true);
      setLoginError("");
    } catch {
      setLoginError(APP_CONFIG.MESSAGE.LOGIN_ERROR);
      localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.API_KEY);
      setIsAuthenticated(false);
    }
  };

  /**
   * 初始化认证状态 - 检查localStorage中是否存在有效的API Key
   */
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("🔓 [DEV MODE] 开发模式已启用，跳过 Token 验证");
      localStorage.setItem(APP_CONFIG.STORAGE_KEYS.API_KEY, "DEV_MODE_MOCK_KEY");
      setIsAuthenticated(true);
      setLoginError("");
      return;
    }
    const savedKey = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.API_KEY);
    if (savedKey) {
      (async () => {
        try {
          await api.get(APP_CONFIG.API.VERIFY, {
            headers: { "X-API-Key": savedKey },
          });
          setIsAuthenticated(true);
          setLoginError("");
        } catch {
          localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.API_KEY);
          setIsAuthenticated(false);
        }
      })();
    }
  }, []);

  /**
   * 登出
   */
  const logout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.API_KEY);
  };

  return {
    isAuthenticated,
    verifyKey,
    loginError,
    logout,
  };
};
