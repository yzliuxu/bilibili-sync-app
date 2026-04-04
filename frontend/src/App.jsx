import { useState, useEffect } from 'react';
import TaskList from './components/TaskList';
import api from './utils/api';
import APP_CONFIG from './config';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [inputKey, setInputKey] = useState('');
  const [loginError, setLoginError] = useState('');

  const [activeTab, setActiveTab] = useState(APP_CONFIG.TABS.TASKS);
  const [urlInput, setUrlInput] = useState('');
  const [tasks, setTasks] = useState([]);
  const [ytCookie, setYtCookie] = useState('');
  const [rcloneCookie, setRcloneCookie] = useState('');

  const verifyKey = async (key) => {
    try {
      await api.get(APP_CONFIG.API.VERIFY, { headers: { 'X-API-Key': key } });
      localStorage.setItem(APP_CONFIG.STORAGE_KEYS.API_KEY, key);
      setIsAuthenticated(true);
      setLoginError('');
    } catch {
      setLoginError(APP_CONFIG.MESSAGE.LOGIN_ERROR);
      localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.API_KEY);
      setIsAuthenticated(false);
    }
  };

  // 初始化鉴权
  useEffect(() => {
    const savedKey = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.API_KEY);
    if (savedKey) {
      (async () => {
        try {
          await api.get(APP_CONFIG.API.VERIFY, { headers: { 'X-API-Key': savedKey } });
          setIsAuthenticated(true);
          setLoginError('');
        } catch {
          localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.API_KEY);
          setIsAuthenticated(false);
        }
      })();
    }
  }, []);

  const handleAddTask = async () => {
    if (!urlInput) return;
    try {
      await api.post(APP_CONFIG.API.TASKS, { url: urlInput });
      setUrlInput('');
      // 手动触发一次刷新，让页面立刻反馈
      const res = await api.get(APP_CONFIG.API.TASKS);
      setTasks(res.data);
    } catch {
      alert(APP_CONFIG.MESSAGE.ADD_TASK_FAIL);
    }
  };

  const handleRetry = async (taskId) => {
    try {
      await api.post(`${APP_CONFIG.API.TASKS}/${taskId}/retry`);
    } catch {
      alert(APP_CONFIG.MESSAGE.RETRY_FAIL);
    }
  };

// ==========================================
  // 【新增核心逻辑】：提取 Cookie 并格式化为 rclone 节点配置
  // ==========================================
  const formatRcloneConfig = (rawCookie) => {
    const extract = (key) => {
      const match = rawCookie.match(new RegExp(`(?:^|;\\s*)${key}=([^;]*)`));
      return match ? match[1] : '';
    };

    const values = APP_CONFIG.RCLONE.COOKIE_KEYS.reduce((acc, key) => {
      acc[key] = extract(key);
      return acc;
    }, {});

    const hasAnyValue = APP_CONFIG.RCLONE.COOKIE_KEYS.some((key) => values[key]);
    if (!hasAnyValue) {
      return null;
    }

    const { uid, cid, seid, kid } = values;
    return APP_CONFIG.RCLONE.TEMPLATE(uid, cid, seid, kid);
  };

  const handleSaveSettings = async () => {
    try {
      // 1. 保存 yt-dlp cookie
      if (ytCookie) {
        await api.post(APP_CONFIG.API.SETTING, { key: 'yt_cookie', value: ytCookie });
      }

      // 2. 提取并保存 rclone cookie
      if (rcloneCookie) {
        // 判断用户是不是已经填了格式化好的配置（防止二次提取失败）
        let finalConfig = rcloneCookie;
        
        if (!rcloneCookie.startsWith(APP_CONFIG.RCLONE.PREFIX)) {
          const parsedConfig = formatRcloneConfig(rcloneCookie);
          if (!parsedConfig) {
            alert(APP_CONFIG.MESSAGE.COOKIE_EXTRACT_FAIL);
            return;
          }
          finalConfig = parsedConfig;
          // 将输入框的内容也替换成格式化后的，让用户能直观看到结果
          setRcloneCookie(finalConfig); 
        }

        await api.post(APP_CONFIG.API.SETTING, { key: 'rclone_cookie', value: finalConfig });
      }
      
      alert(APP_CONFIG.MESSAGE.SAVE_SUCCESS);
    } catch {
      alert(APP_CONFIG.MESSAGE.SAVE_FAIL);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">流浪B站计划</h1>
          <div className="space-y-4">
            <input 
              type="password" 
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              placeholder="请输入系统访问密码" 
              className="w-full border border-gray-300 rounded-md p-3 focus:ring-2 focus:ring-blue-500 outline-none"
              onKeyDown={(e) => e.key === 'Enter' && verifyKey(inputKey)}
            />
            {loginError && <p className="text-red-500 text-sm">{loginError}</p>}
            <button 
              onClick={() => verifyKey(inputKey)}
              className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 transition font-medium"
            >
              解锁进入
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-4xl mx-auto p-6 font-sans">
      <header className="flex justify-between items-center mb-8 bg-white p-4 rounded-lg shadow-sm border border-gray-100">
        <h1 className="text-2xl font-bold text-gray-800">流浪B站计划</h1>
        <div className="space-x-4">
          <button 
            onClick={() => setActiveTab(APP_CONFIG.TABS.TASKS)} 
            className={`px-4 py-2 rounded-md transition-colors ${activeTab === APP_CONFIG.TABS.TASKS ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            任务列表
          </button>
          <button 
            onClick={() => setActiveTab(APP_CONFIG.TABS.SETTINGS)} 
            className={`px-4 py-2 rounded-md transition-colors ${activeTab === APP_CONFIG.TABS.SETTINGS ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            系统配置
          </button>
          <button 
            onClick={() => { setIsAuthenticated(false); localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.API_KEY); }}
            className="px-4 py-2 rounded-md transition-colors bg-red-100 text-red-600 hover:bg-red-200"
          >
            退出
          </button>
        </div>
      </header>

      <main>
        {activeTab === APP_CONFIG.TABS.TASKS && (
<div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold mb-4 text-gray-700">添加新下载任务</h2>
              <div className="flex space-x-2">
                <input type="text" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="粘贴视频链接..." className="flex-1 border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500 outline-none" onKeyDown={(e) => e.key === 'Enter' && handleAddTask()} />
                <button onClick={handleAddTask} className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700">解析并下载</button>
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold mb-4 text-gray-700">当前任务队列</h2>
              <TaskList tasks={tasks} onRetry={handleRetry} />
            </div>
          </div>
        )}

        {activeTab === APP_CONFIG.TABS.SETTINGS && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold mb-6 text-gray-700">更新鉴权配置</h2>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">yt-dlp Cookies (Netscape 格式)</label>
              <textarea 
                rows="5" value={ytCookie} onChange={(e) => setYtCookie(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                placeholder="# Netscape HTTP Cookie File..."
              ></textarea>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">rclone 115 网盘 Cookie</label>
              <textarea 
                rows="6" value={rcloneCookie} onChange={(e) => setRcloneCookie(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                placeholder="直接在此粘贴浏览器中抓取到的一整段乱七八糟的 Cookie，系统会自动提取 uid, cid, seid, kid 并生成节点配置..."
              ></textarea>
            </div>
            <button 
              onClick={handleSaveSettings}
              className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 transition-colors shadow-sm"
            >
              提取并保存配置
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;