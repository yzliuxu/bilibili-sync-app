import { useState, useEffect } from "react";
import TaskList from "./components/TaskList";
import api from "./utils/api";
import APP_CONFIG from "./config";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(import.meta.env.DEV);
  const [inputKey, setInputKey] = useState("");
  const [loginError, setLoginError] = useState("");

  const [activeTab, setActiveTab] = useState(APP_CONFIG.TABS.TASKS);
  const [urlInput, setUrlInput] = useState("");
  const [tasks, setTasks] = useState([]);
  const [ytCookie, setYtCookie] = useState("");
  const [rcloneCookie, setRcloneCookie] = useState("");

  // const fetchTasks = async () => {
  //   try {
  //     const res = await api.get(APP_CONFIG.API.TASKS);
  //     setTasks(res.data);
  //   } catch (error) {
  //     alert(APP_CONFIG.MESSAGE.FETCH_TASKS_FAIL);
  //     console.error("Failed to fetch tasks", error);
  //   }
  // };

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
    // if (isAuthenticated && activeTab === APP_CONFIG.TABS.TASKS) {
    //   fetchTasks();
    //   const timer = setInterval(fetchTasks, 5000);
    //   return () => clearInterval(timer); // 组件卸载时清除定时器
    // }
    let ws = null;
    if (isAuthenticated && activeTab === APP_CONFIG.TABS.TASKS) {
      const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
      const wsUrl = import.meta.env.DEV
        ? "ws://localhost:8000/api/ws/tasks"
        : `${wsProtocol}://${window.location.host}/api/ws/tasks`;

      // 建立 WebSocket 连接
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        console.log("WebSocket 连接已建立，进入响应式模式 ⚡");
      };

      // 核心：每次后端主动推送数据时，直接更新状态
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

  // ==========================================
  // 【新增核心逻辑】：提取 Cookie 并格式化为 rclone 节点配置
  // ==========================================
  const formatRcloneConfig = (rawCookie) => {
    const extract = (key) => {
      const match = rawCookie.match(new RegExp(`(?:^|;\\s*)${key}=([^;]*)`));
      return match ? match[1] : "";
    };

    const values = APP_CONFIG.RCLONE.COOKIE_KEYS.reduce((acc, key) => {
      acc[key] = extract(key);
      return acc;
    }, {});

    const hasAnyValue = APP_CONFIG.RCLONE.COOKIE_KEYS.some(
      (key) => values[key],
    );
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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
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
      <header className="flex justify-between items-center mb-8 bg-white p-4 rounded-lg shadow-sm border border-gray-100">
        <h1 className="text-2xl font-bold text-gray-800">流浪B站计划</h1>
        <div className="space-x-4">
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
              <div className="flex space-x-2">
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
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold mb-4 text-gray-700">
                当前任务队列
              </h2>
              <TaskList tasks={tasks} onRetry={handleRetry} />
              {/* <TaskList
                tasks={[
                  // 构造一个完美的假报错任务
                  {
                    id: 9999,
                    url: "https://www.bilibili.com/video/BV1xx411c7mD",
                    title: "【测试】这是一个用来测试超长报错的假视频",
                    uploader: "前端测试员",
                    status: "failed",
                    progress: 85,
                    // 模拟一段真实的、带有换行符的 Python Traceback 报错
                    error_msg: `Traceback (most recent call last):
  File "worker.py", line 89, in process_taskvdfvdfjvndnvfdjfnvdjnvdjkfvndfjkvndvndkjvndfkvndkjvndjkvdfjvkndjvkvndfjkvdnfjkvdnjvkdfnjvndfvjkdfnvjkdvndfjkvndfjkvndjkvdfnvdkv
  dfjvdnvjfvndjfvndjvndfjvndfjvdnvjdfnjvdnvjdnvdjvndfjvndfjvndfjvbdfjvbdfjvbfe8orfherhevjnevbelv
    ydl.download([task.url])
  File "/usr/local/lib/python3.9/sitjdfnjvdnvjdnvdjvndfjvndfjvndfjvbdfjvbdfjvbfe8orfherhevjnevbelv
    ydl.download([task.url])
  File "/usr/local/lib/python3.9/sitjdfnjvdnvjdnvdjvndfjvndfjvndfjvbdfjvbdfjvbfe8orfherhevjnevbelv
    ydl.download([task.url])
  File "/usr/local/lib/python3.9/sitjdfnjvdnvjdnvdjvndfjvndfjvndfjvbdfjvbdfjvbfe8orfherhevjnevbelv
    ydl.download([task.url])
  File "/usr/local/lib/python3.9/sitjdfnjvdnvjdnvdjvndfjvndfjvndfjvbdfjvbdfjvbfe8orfherhevjnevbelv
    ydl.download([task.url])
  File "/usr/local/lib/python3.9/sitjdfnjvdnvjdnvdjvndfjvndfjvndfjvbdfjvbdfjvbfe8orfherhevjnevbelv
    ydl.download([task.url])
  File "/usr/local/lib/python3.9/sitjdfnjvdnvjdnvdjvndfjvndfjvndfjvbdfjvbdfjvbfe8orfherhevjnevbelv
    ydl.download([task.url])
  File "/usr/local/lib/python3.9/sitjdfnjvdnvjdnvdjvndfjvndfjvndfjvbdfjvbdfjvbfe8orfherhevjnevbelv
    ydl.download([task.url])
  File "/usr/local/lib/python3.9/sitjdfnjvdnvjdnvdjvndfjvndfjvndfjvbdfjvbdfjvbfe8orfherhevjnevbelv
    ydl.download([task.url])
  File "/usr/local/lib/python3.9/site-packages/yt_dlp/YoutubeDL.py", line 3398, in download
    self.__download_wrapper(self.extract_info)(
  File "/usr/local/lib/python3.9/site-packages/yt_dlp/YoutubeDL.py", line 3368, in wrapper
    res = func(*args, **kwargs)
yt_dlp.utils.DownloadError: ERROR: [bilibili] BV1xx411c7mD: 此视频需要大会员权限，或者您的 Cookie 已过期。请更新 Cookie 后重试！
  (Hint: 确保您在系统设置页面填写了最新的 Netscape 格式 Cookie)`,
                  },
                  // 把原来的真实任务接在后面
                  ...tasks,
                ]}
                onRetry={handleRetry}
              /> */}
            </div>
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
