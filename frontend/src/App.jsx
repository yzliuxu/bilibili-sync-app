import { useState, useEffect } from 'react';
import TaskList from './components/TaskList';
import api from './utils/api';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [inputKey, setInputKey] = useState('');
  const [loginError, setLoginError] = useState('');

  const [activeTab, setActiveTab] = useState('tasks');
  const [urlInput, setUrlInput] = useState('');
  const [tasks, setTasks] = useState([]);
  const [ytCookie, setYtCookie] = useState('');
  const [rcloneCookie, setRcloneCookie] = useState('');

  // 初始化鉴权
  useEffect(() => {
    const savedKey = localStorage.getItem('video_sync_api_key');
    if (savedKey) verifyKey(savedKey);
  }, []);

  // 轮询任务数据 (每 3 秒)
  useEffect(() => {
    let timer;
    if (isAuthenticated) {
      const fetchTasks = async () => {
        try {
          const res = await api.get('/api/tasks');
          setTasks(res.data);
        } catch (e) {
          if (e.response?.status === 401) setIsAuthenticated(false);
        }
      };
      fetchTasks(); // 立即执行一次
      timer = setInterval(fetchTasks, 3000);
    }
    return () => clearInterval(timer);
  }, [isAuthenticated]);

  const verifyKey = async (key) => {
    try {
      await api.get('/api/verify', { headers: { 'X-API-Key': key } });
      localStorage.setItem('video_sync_api_key', key);
      setIsAuthenticated(true);
      setLoginError('');
    } catch (error) {
      setLoginError('密码错误或后端服务未启动');
      localStorage.removeItem('video_sync_api_key');
      setIsAuthenticated(false);
    }
  };

  const handleAddTask = async () => {
    if (!urlInput) return;
    try {
      await api.post('/api/tasks', { url: urlInput });
      setUrlInput('');
      // 手动触发一次刷新，让页面立刻反馈
      const res = await api.get('/api/tasks');
      setTasks(res.data);
    } catch (error) {
      alert("添加失败");
    }
  };

  const handleRetry = async (taskId) => {
    try {
      await api.post(`/api/tasks/${taskId}/retry`);
    } catch (error) {
      alert("重试触发失败");
    }
  };

  const handleSaveSettings = async () => {
    try {
      if (ytCookie) await api.post('/api/settings', { key: 'yt_cookie', value: ytCookie });
      if (rcloneCookie) await api.post('/api/settings', { key: 'rclone_cookie', value: rcloneCookie });
      alert("配置已成功保存！");
    } catch (error) {
      alert("保存失败");
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
            onClick={() => setActiveTab('tasks')} 
            className={`px-4 py-2 rounded-md transition-colors ${activeTab === 'tasks' ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            任务列表
          </button>
          <button 
            onClick={() => setActiveTab('settings')} 
            className={`px-4 py-2 rounded-md transition-colors ${activeTab === 'settings' ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            系统配置
          </button>
          <button 
            onClick={() => { setIsAuthenticated(false); localStorage.removeItem('video_sync_api_key'); }}
            className="px-4 py-2 rounded-md transition-colors bg-red-100 text-red-600 hover:bg-red-200"
          >
            退出
          </button>
        </div>
      </header>

      <main>
        {activeTab === 'tasks' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold mb-4 text-gray-700">添加新下载任务 (支持播放列表)</h2>
              <div className="flex space-x-2">
                <input 
                  type="text" 
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="在此粘贴 YouTube/Bilibili 等视频或播放列表链接..." 
                  className="flex-1 border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                />
                <button 
                  onClick={handleAddTask} 
                  className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap"
                >
                  解析并下载
                </button>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold mb-4 text-gray-700">当前任务队列</h2>
              <TaskList tasks={tasks} onRetry={handleRetry} />
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
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
                rows="3" value={rcloneCookie} onChange={(e) => setRcloneCookie(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                placeholder="在此粘贴 115 网盘的 Cookie 字符串..."
              ></textarea>
            </div>
            <button 
              onClick={handleSaveSettings}
              className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 transition-colors shadow-sm"
            >
              保存配置
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;