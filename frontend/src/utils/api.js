import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000', // PVE虚拟机的实际IP如果在公网，请修改这里
});

api.interceptors.request.use((config) => {
  const apiKey = localStorage.getItem('video_sync_api_key');
  if (apiKey) {
    config.headers['X-API-Key'] = apiKey;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default api;