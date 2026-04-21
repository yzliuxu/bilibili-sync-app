import { useState } from "react";
import TaskList from "./components/TaskList";
import APP_CONFIG from "./config";
import { useAuth } from "./hooks/useAuth";
import { useTasks } from "./hooks/useTasks";
import { addTask, retryTask, saveAuthConfig } from "./utils/taskHandler";

function App() {
  const { isAuthenticated, verifyKey, loginError, logout } = useAuth();
  const [inputKey, setInputKey] = useState("");
  const [activeTab, setActiveTab] = useState(APP_CONFIG.TABS.TASKS);
  const [urlInput, setUrlInput] = useState("");
  const [ytCookie, setYtCookie] = useState("");
  const [rcloneCookie, setRcloneCookie] = useState("");

  const { filteredTasks, statusFilter, setStatusFilter } = useTasks(
    isAuthenticated,
    activeTab === APP_CONFIG.TABS.TASKS
  );

  const handleAddTask = () => {
    addTask(
      urlInput,
      () => {
        setUrlInput("");
      },
      () => {
        alert(APP_CONFIG.MESSAGE.ADD_TASK_FAIL);
      }
    );
  };

  const handleRetry = (taskId) => {
    retryTask(taskId, () => {
      alert(APP_CONFIG.MESSAGE.RETRY_FAIL);
    });
  };

  const handleSaveSettings = async () => {
    const success = await saveAuthConfig(
      { ytCookie, rcloneCookie },
      () => {
        alert(APP_CONFIG.MESSAGE.SAVE_SUCCESS);
        setYtCookie("");
        setRcloneCookie("");
      },
      (error) => {
        alert(typeof error === "string" ? error : APP_CONFIG.MESSAGE.SAVE_FAIL);
      }
    );
  };
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
      {import.meta.env.DEV && (
        <div className="mb-4 px-4 py-2 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800 rounded">
          <span className="font-semibold">🔓 开发模式</span> - 正在使用模拟数据，Token 验证已跳过
        </div>
      )}
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
            onClick={() => logout()}
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
