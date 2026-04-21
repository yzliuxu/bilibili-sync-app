/**
 * 错误详情模态框组件
 */
export default function ErrorModal({ title, error, onClose }) {
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
        </div>
      </div>
    </>
  );
}
