import { useState, useMemo } from "react";
import TaskList from "./components/TaskList";
import APP_CONFIG from "./config";
import { useAuth } from "./hooks/useAuth";
import { useTasks } from "./hooks/useTasks";
import { addTask, retryTask, saveAuthConfig } from "./utils/taskHandler";
import { ClipboardPaste } from "lucide-react";
const STATUS_DISPLAY = {
  pending: { text: "待处理 ⏳" },
  downloading: { text: "下载中 ⬇️" },
  uploading: { text: "上传中 ☁️" },
  completed: { text: "已完成 ✅" },
  failed: { text: "失败 ❌" },
  partial_completed: { text: "部分完成 ⚠️" },
};

// Active (selected) pill color per status — matches badge colors
const STATUS_ACTIVE_CLASS = {
  pending: "bg-gray-100 text-gray-700 border-gray-400",
  downloading: "bg-blue-100 text-blue-700 border-blue-400",
  uploading: "bg-purple-100 text-purple-700 border-purple-400",
  completed: "bg-green-100 text-green-700 border-green-400",
  failed: "bg-red-100 text-red-700 border-red-400",
  partial_completed: "bg-yellow-100 text-yellow-700 border-yellow-400",
};

function App() {
  const { isAuthenticated, verifyKey, loginError, logout } = useAuth();
  const [inputKey, setInputKey] = useState("");
  const [activeTab, setActiveTab] = useState(APP_CONFIG.TABS.TASKS);
  const [urlInput, setUrlInput] = useState("");
  const [ytCookie, setYtCookie] = useState("");
  const [rcloneCookie, setRcloneCookie] = useState("");

  const {
    tasks,
    filteredTasks,
    availableStatuses,
    selectedStatuses,
    setSelectedStatuses,
  } = useTasks(isAuthenticated, activeTab === APP_CONFIG.TABS.TASKS);

  // Per-status task count (from unfiltered data)
  const statusCounts = useMemo(
    () =>
      (tasks || []).reduce((acc, t) => {
        if (t?.status) acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
      }, {}),
    [tasks],
  );

  // Is a given status currently selected?
  const isSelected = (status) => {
    if (selectedStatuses === null) return status !== "pending";
    return selectedStatuses.has(status);
  };

  // Toggle one status pill
  const toggleStatus = (status) => {
    const current =
      selectedStatuses === null
        ? new Set(availableStatuses.filter((s) => s !== "pending"))
        : new Set(selectedStatuses);
    if (current.has(status)) {
      current.delete(status);
    } else {
      current.add(status);
    }
    setSelectedStatuses(current);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrlInput(text);
    } catch (err) {
      console.error("无法读取剪贴板: ", err);
    }
  };

  const handleAddTask = () => {
    addTask(
      urlInput,
      () => {
        setUrlInput("");
      },
      () => {
        alert(APP_CONFIG.MESSAGE.ADD_TASK_FAIL);
      },
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
      },
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
    <div className="min-h-screen max-w-4xl mx-auto p-3 sm:p-6 font-sans">
      {import.meta.env.DEV && (
        <div className="mb-4 px-4 py-2 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800 rounded">
          <span className="font-semibold">🔓 开发模式</span> -
          正在使用模拟数据，Token 验证已跳过
        </div>
      )}
      <header className="flex flex-col sm:flex-row gap-3 justify-between items-center mb-4 sm:mb-6 bg-white p-3 sm:p-4 rounded-lg shadow-sm border border-gray-100">
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
            <div className="bg-white p-3 sm:p-6 rounded-lg shadow-sm border border-gray-100">
              <h2 className="text-base sm:text-lg font-semibold mb-3 text-gray-700">
                添加新下载任务
              </h2>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 flex items-center">
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="粘贴视频链接..."
                    className="w-full border border-gray-300 rounded-md p-2 pr-10 focus:ring-2 focus:ring-blue-500 outline-none"
                    onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
                  />
                  <button
                    type="button"
                    onClick={handlePaste}
                    className="absolute right-2 text-gray-400 hover:text-blue-600 p-1 transition-colors"
                    title="从剪贴板粘贴"
                  >
                    <ClipboardPaste size={18} />
                  </button>
                </div>

                <button
                  onClick={handleAddTask}
                  className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 whitespace-nowrap"
                >
                  解析并下载
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <h2 className="text-base sm:text-lg font-semibold text-gray-700">
                  当前任务队列
                </h2>
                <span className="text-sm text-gray-400">
                  显示 {filteredTasks.length} / {(tasks || []).length} 个任务
                </span>
              </div>

              {availableStatuses.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-gray-500 font-medium whitespace-nowrap">
                    筛选：
                  </span>
                  {availableStatuses.map((status) => (
                    <button
                      key={status}
                      onClick={() => toggleStatus(status)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                        isSelected(status)
                          ? STATUS_ACTIVE_CLASS[status] ||
                            "bg-blue-100 text-blue-700 border-blue-400"
                          : "bg-white text-gray-400 border-gray-200 hover:border-gray-400 hover:text-gray-600"
                      }`}
                    >
                      {STATUS_DISPLAY[status]?.text || status}
                      <span className="opacity-70 font-normal">
                        {statusCounts[status] || 0}
                      </span>
                    </button>
                  ))}
                  {selectedStatuses !== null && (
                    <button
                      onClick={() => setSelectedStatuses(null)}
                      className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 ml-1"
                    >
                      重置
                    </button>
                  )}
                </div>
              )}
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
