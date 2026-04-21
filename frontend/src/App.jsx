import { useState, useEffect } from "react";
import TaskList from "./components/TaskList";
import api from "./utils/api";
import APP_CONFIG from "./config";
import { validateNetscapeCookie, formatRcloneConfig } from "./utils/format";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(import.meta.env.DEV);
  const [inputKey, setInputKey] = useState("");
  const [loginError, setLoginError] = useState("");
  const [activeTab, setActiveTab] = useState(APP_CONFIG.TABS.TASKS);
  const [urlInput, setUrlInput] = useState("");
  const [tasks, setTasks] = useState([]);
  const [ytCookie, setYtCookie] = useState("");
  const [rcloneCookie, setRcloneCookie] = useState("");

  const [statusFilter, setStatusFilter] = useState("all");

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

  // 初始化鉴权
  useEffect(() => {
    if (import.meta.env.DEV) {
      localStorage.setItem(APP_CONFIG.STORAGE_KEYS.API_KEY, 123456);
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

  useEffect(() => {
    let ws = null;
    if (isAuthenticated && activeTab === APP_CONFIG.TABS.TASKS) {
      // 1. 【防御性设计】主动拉取初始全量数据
      // 确保无论 WebSocket 状态如何，页面渲染瞬间都能拿到真实数据
      const initFetch = async () => {
        try {
          const res = await api.get(APP_CONFIG.API.TASKS);
          console.log("RESTful 初始化数据拉取成功, 共有任务:", res.data.length);
          setTasks(res.data);
        } catch (err) {
          console.error("RESTful 初始化数据拉取失败:", err);
        }
      };
      initFetch();

      // 2. 【响应式设计】建立长连接监听后续状态流转
      const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
      const wsUrl = import.meta.env.DEV
        ? "ws://localhost:8000/api/ws/tasks"
        : `${wsProtocol}://${window.location.host}/api/ws/tasks`;

      // 建立 WebSocket 连接
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("WebSocket 连接已建立，进入响应式模式 ⚡");
      };

      // 核心：每次后端主动推送数据时，覆盖更新状态
      ws.onmessage = (event) => {
        try {
          const freshTasks = JSON.parse(event.data);
          setTasks(freshTasks);
        } catch (err) {
          console.error("WebSocket 数据解析失败:", err);
        }
      };

      ws.onerror = (error) => {
        console.error(
          "WebSocket 连接错误，如果持续失败，请检查跨域配置",
          error,
        );
      };

      ws.onclose = () => {
        console.log("WebSocket 连接已断开");
      };
    }

    // 组件卸载或切换标签时，优雅地销毁长连接，防止内存泄漏
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [isAuthenticated, activeTab]);
  const handleAddTask = async () => {
    if (!urlInput) return;
    try {
      await api.post(APP_CONFIG.API.TASKS, { url: urlInput });
      setUrlInput("");
      // await fetchTasks(); // 刷新任务列表
      // setTasks(res.data);
    } catch (error) {
      alert(APP_CONFIG.MESSAGE.ADD_TASK_FAIL);
      console.error("添加任务失败", error.response || error.message);
    }
  };

  const handleRetry = async (taskId) => {
    try {
      await api.post(`${APP_CONFIG.API.TASKS}/${taskId}/retry`);
    } catch {
      alert(APP_CONFIG.MESSAGE.RETRY_FAIL);
    }
  };

  const handleSaveSettings = async () => {
    try {
      // 1. 保存 yt-dlp cookie
      if (ytCookie) {
        const validYtCookie = validateNetscapeCookie(ytCookie);
        if (!validYtCookie) {
          alert("yt-dlp Cookie 格式不正确，请确保提供的是 Netscape 格式！");
          return;
        }
        await api.post(APP_CONFIG.API.SETTING, {
          key: "yt_cookie",
          value: validYtCookie,
        });
      }

      // 2. 提取并保存 rclone cookie
      if (rcloneCookie) {
        // 判断用户是不是已经填了格式化好的配置（防止二次提取失败）
        let finalConfig = rcloneCookie;

        const finalRcloneConfig = formatRcloneConfig(rcloneCookie);
        if (!finalRcloneConfig) {
          alert("无法提取 115 凭证，请检查粘贴的 Cookie 是否完整！");
          return;
        }

        await api.post(APP_CONFIG.API.SETTING, {
          key: "rclone_cookie",
          value: finalRcloneConfig,
        });
      }

      alert(APP_CONFIG.MESSAGE.SAVE_SUCCESS);
    } catch {
      alert(APP_CONFIG.MESSAGE.SAVE_FAIL);
    }
  };
  const rawtasks = tasks || [];
  const filteredTasks = rawtasks.filter((task) => {
    if (!task) return false;
    if (!statusFilter || statusFilter === "all") return true;
    return task.status === statusFilter;
  });
  console.log("最终交给组件渲染的数据数量:", filteredTasks.length);
  // 未登录状态返回
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 sm:p-6">
        <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-md">
          <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">
            流浪B站计划
          </h1>
          <div className="space-y-4">
            <input
              type="password"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              placeholder="请输入静态token"
              className="w-full border border-gray-300 rounded-md p-3 focus:ring-2 focus:ring-blue-500 outline-none"
              onKeyDown={(e) => e.key === "Enter" && verifyKey(inputKey)}
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
      <header className="flex flex-col sm:flex-row gap-4 justify-between items-center mb-8 bg-white p-4 rounded-lg shadow-sm border border-gray-100">
        <h1 className="text-2xl font-bold text-gray-800">流浪B站计划</h1>
        <div className="flex gap-2 justify-center flex-wrap">
          <button
            onClick={() => setActiveTab(APP_CONFIG.TABS.TASKS)}
            className={`px-4 py-2 rounded-md transition-colors ${activeTab === APP_CONFIG.TABS.TASKS ? "bg-blue-600 text-white shadow" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            任务列表
          </button>
          <button
            onClick={() => setActiveTab(APP_CONFIG.TABS.SETTINGS)}
            className={`px-4 py-2 rounded-md transition-colors ${activeTab === APP_CONFIG.TABS.SETTINGS ? "bg-blue-600 text-white shadow" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            系统配置
          </button>
          <button
            onClick={() => {
              setIsAuthenticated(false);
              localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.API_KEY);
            }}
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
              <h2 className="text-lg font-semibold mb-4 text-gray-700">
                添加新下载任务
              </h2>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="粘贴视频链接..."
                  className="flex-1 border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
                />
                <button
                  onClick={handleAddTask}
                  className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700"
                >
                  解析并下载
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-700">
                当前任务队列
              </h2>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-gray-300 rounded-md p-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="all">全部状态</option>
                <option value="pending">待处理</option>
                <option value="downloading">下载中</option>
                <option value="completed">已完成</option>
                <option value="failed">失败</option>
              </select>
            </div>
            <TaskList tasks={filteredTasks} onRetry={handleRetry} />
          </div>
        )}

        {activeTab === APP_CONFIG.TABS.SETTINGS && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold mb-6 text-gray-700">
              更新鉴权配置
            </h2>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                yt-dlp Cookies (Netscape 格式)
              </label>
              <textarea
                rows="5"
                value={ytCookie}
                onChange={(e) => setYtCookie(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                placeholder="# Netscape HTTP Cookie File..."
              ></textarea>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                rclone 115 网盘 Cookie
              </label>
              <textarea
                rows="6"
                value={rcloneCookie}
                onChange={(e) => setRcloneCookie(e.target.value)}
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
