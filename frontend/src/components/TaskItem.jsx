export default function TaskItem({ task, onRetry }) {
  const statusConfig = {
    pending: { color: 'text-gray-500', bg: 'bg-gray-100', text: '排队中 ⏳' },
    downloading: { color: 'text-blue-600', bg: 'bg-blue-50', text: '下载中 ⬇️' },
    uploading: { color: 'text-purple-600', bg: 'bg-purple-50', text: '上传至 115 ☁️' },
    partial_completed: { color: 'text-yellow-600', bg: 'bg-yellow-50', text: '部分完成 ⚠️' },
    completed: { color: 'text-green-600', bg: 'bg-green-50', text: '已完成 ✅' },
    failed: { color: 'text-red-600', bg: 'bg-red-50', text: '失败 ❌' },
  };

  const currentStatus = statusConfig[task.status] || statusConfig.pending;

  return (
    <div className={`p-4 rounded-lg border mb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center ${currentStatus.bg} border-gray-200 transition-colors`}>
      <div className="flex-1 w-full overflow-hidden">
        <div className="flex items-center space-x-2">
          <span className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs rounded-full font-medium">
            {task.uploader || '解析中'}
          </span>
          <h3 className="font-medium text-gray-800 truncate" title={task.title || '等待解析'}>
            {task.title || '等待解析...'}
          </h3>
        </div>
        <p className="text-xs text-gray-500 mt-1 font-mono truncate">{task.url}</p>
        
        {/* 【新增】：动态进度条渲染逻辑 */}
        {task.status === 'downloading' && (
          <div className="mt-3 w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${task.progress}%` }}
            ></div>
          </div>
        )}

        {task.error_msg && (
          <div className="mt-2 text-sm text-red-600 bg-red-100 p-2 rounded border border-red-200">
            <strong>详情:</strong> {task.error_msg}
          </div>
        )}
      </div>

      <div className="mt-3 sm:mt-0 sm:ml-4 flex items-center space-x-3 whitespace-nowrap">
        {/* 【新增】：在文字旁边显示百分比数字 */}
        <span className={`text-sm font-semibold ${currentStatus.color} flex items-center space-x-1`}>
          <span>{currentStatus.text}</span>
          {task.status === 'downloading' && <span>{task.progress}%</span>}
        </span>
        
        {(task.status === 'failed' || task.status === 'partial_completed') && (
          <button 
            onClick={() => onRetry(task.id)}
            className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition shadow-sm"
          >
            重试
          </button>
        )}
      </div>
    </div>
  );
}