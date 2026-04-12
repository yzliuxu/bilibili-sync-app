import { useState } from "react"; //

// 错误详情模态框组件
function ErrorModal({ title, error, onClose }) {
  return (
    <>
      {/* 1. 在最外层（黑色遮罩）绑定关闭事件 */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      >
        {/* 2. 在内层（白色内容区）阻断事件冒泡，防止点击内容区误关 */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden animate-in zoom-in duration-200"
        >
          {/* --- 内部的结构保持完全不变 --- */}
          <div className="px-6 py-4 border-b flex justify-between items-center bg-red-50">
            <h3 className="text-lg font-bold text-red-800">任务报错详情</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-3xl leading-none"
            >
              &times;
            </button>
          </div>

          <div className="p-6 overflow-y-auto max-h-[70vh]">
            {/* ... 里面的标题和报错文本等 ... */}
            <div className="mb-4">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                视频标题
              </span>
              <p className="text-sm text-gray-800 font-medium">
                {title || "未知视频"}
              </p>
            </div>
            <div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                错误堆栈
              </span>
              <pre className="mt-2 bg-gray-900 text-red-400 p-4 rounded-lg font-mono text-xs overflow-x-auto whitespace-pre-wrap break-all border border-gray-800 shadow-inner">
                {error}
              </pre>
            </div>
          </div>

          <div className="px-6 py-4 border-t bg-gray-50 flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-all shadow-sm active:scale-95"
            >
              我已知晓
            </button>
          </div>
          {/* ------------------------------ */}
        </div>
      </div>
    </>
  );
}

export default function TaskItem({ task, onRetry }) {
  const [showErrorModal, setShowErrorModal] = useState(false); //

  const statusConfig = {
    pending: { color: "text-gray-500", bg: "bg-gray-100", text: "排队中 ⏳" },
    downloading: {
      color: "text-blue-600",
      bg: "bg-blue-50",
      text: "下载中 ⬇️",
    },
    uploading: {
      color: "text-purple-600",
      bg: "bg-purple-50",
      text: "上传至 115 ☁️",
    },
    partial_completed: {
      color: "text-yellow-600",
      bg: "bg-yellow-50",
      text: "部分完成 ⚠️",
    },
    completed: {
      color: "text-green-600",
      bg: "bg-green-50",
      text: "已完成 ✅",
    },
    failed: { color: "text-red-600", bg: "bg-red-50", text: "失败 ❌" },
  }; //

  const currentStatus = statusConfig[task.status] || statusConfig.pending; //

  return (
    <>
      <div
        className={`p-4 rounded-lg border mb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center ${currentStatus.bg} border-gray-200 transition-colors`}
      >
        <div className="flex-1 w-full overflow-hidden">
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs rounded-full font-medium">
              {task.uploader || "解析中"}
            </span>
            <h3
              className="font-medium text-gray-800 truncate"
              title={task.title || "等待解析"}
            >
              {task.title || "等待解析..."}
            </h3>
          </div>
          <p className="text-xs text-gray-500 mt-1 font-mono truncate">
            {task.url}
          </p>

          {task.status === "downloading" && (
            <div className="mt-3 w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${task.progress}%` }}
              ></div>
            </div>
          )}

          {/* 报错展示区域 */}
          {task.error_msg && (
            <div
              onClick={() => setShowErrorModal(true)}
              className="mt-2 cursor-pointer group"
            >
              <div className="text-sm text-red-600 bg-red-100/50 p-2 rounded border border-red-200 hover:bg-red-100 transition-colors">
                <div className="flex justify-between items-center mb-1">
                  <strong className="text-[10px] uppercase tracking-tighter opacity-70">
                    错误详情:
                  </strong>
                  <span className="text-[10px] bg-red-200 text-red-700 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                    查看完整堆栈 🔍
                  </span>
                </div>
                {/* 使用 truncate 实现强制单行截断 */}
                <p className="text-xs font-mono truncate opacity-90">
                  {task.error_msg}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 sm:mt-0 sm:ml-4 flex items-center space-x-3 whitespace-nowrap">
          <span
            className={`text-sm font-semibold ${currentStatus.color} flex items-center space-x-1`}
          >
            <span>{currentStatus.text}</span>
            {task.status === "downloading" && <span>{task.progress}%</span>}
          </span>

          {(task.status === "failed" ||
            task.status === "partial_completed") && (
            <button
              onClick={() => onRetry(task.id)}
              className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition shadow-sm active:scale-95"
            >
              重试
            </button>
          )}
        </div>
      </div>

      {/* 模态框渲染：只有在状态为 true 时才渲染到 DOM */}
      {showErrorModal && (
        <ErrorModal
          title={task.title}
          error={task.error_msg}
          onClose={() => setShowErrorModal(false)}
        />
      )}
    </>
  );
}
