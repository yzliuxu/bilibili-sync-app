import axios from 'axios';
import APP_CONFIG from '../config';

// 创建 axios 实例
const api = axios.create({
  // 此时 APP_CONFIG.API_BASE_URL 为 ''，Axios 将自动使用当前浏览器地址栏的 IP 和端口
  baseURL: APP_CONFIG.API_BASE_URL, 
});

// 请求拦截器：在发起每一个 API 请求前自动执行
api.interceptors.request.use(
  (config) => {
    // 从浏览器的 localStorage 中安全读取用户的 API Key
    const apiKey = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.API_KEY);
    
    // 如果存在 Key，则按照 FastAPI 后端的要求注入到请求头中
    if (apiKey) {
      config.headers['X-API-Key'] = apiKey;
    }
    
    return config;
  }, 
  (error) => {
    return Promise.reject(error);
  }
);

export default api;