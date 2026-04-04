import axios from 'axios';
import APP_CONFIG from '../config';

const api = axios.create({
  baseURL: APP_CONFIG.API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const apiKey = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.API_KEY);
  if (apiKey) {
    config.headers['X-API-Key'] = apiKey;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default api;