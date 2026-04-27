import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { ChevronUp, ChevronDown, RotateCcw, AlertCircle } from 'lucide-react';
import ErrorModal from './ErrorModal';

const STATUS_MAP = {
  pending:          { text: '待处理 ⏳', variant: 'pending' },
  downloading:      { text: '下载中 ⬇️', variant: 'downloading' },
  uploading:        { text: '上传中 ☁️', variant: 'uploading' },
  completed:        { text: '已完成 ✅', variant: 'completed' },
  failed:           { text: '失败 ❌', variant: 'failed' },
  partial_completed:{ text: '部分完成 ⚠️', variant: 'warning' },
};

function StatusBadge({ task, onOpen }) {
  const s = task.status;
  const { text, variant } = STATUS_MAP[s] || STATUS_MAP.pending;
  const clickable = (s === 'failed' || s === 'partial_completed') && task.error_msg;
  return (
    <Badge
      variant={variant}
      className={clickable ? 'cursor-pointer hover:opacity-80' : ''}
      onClick={clickable ? onOpen : undefined}
    >
      {text}
    </Badge>
  );
}

function ActionButtons({ task, onRetry, onOpenError }) {
  return (
    <div className="flex items-center gap-1">
      {(task.status === 'failed' || task.status === 'partial_completed') && (
        <button
          onClick={() => onRetry(task.id)}
          className="p-1.5 hover:bg-blue-100 rounded-lg transition-colors text-blue-600 hover:text-blue-700"
          title="重试"
        >
          <RotateCcw size={16} />
        </button>
      )}
      {task.error_msg && (
        <button
          onClick={onOpenError}
          className="p-1.5 hover:bg-red-100 rounded-lg transition-colors text-red-600 hover:text-red-700"
          title="查看错误"
        >
          <AlertCircle size={16} />
        </button>
      )}
    </div>
  );
}

// 移动端卡片视图
function MobileCard({ task, onRetry, onOpenError }) {
  const progress = task.progress || 0;
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-gray-800 text-sm leading-snug flex-1 min-w-0">
          {task.title || '未知视频'}
        </p>
        <ActionButtons task={task} onRetry={onRetry} onOpenError={onOpenError} />
      </div>

      {task.playlist_name && (
        <p className="text-xs text-gray-400 truncate">{task.playlist_name}</p>
      )}

      <div className="flex items-center justify-between gap-3">
        <StatusBadge task={task} onOpen={onOpenError} />
        <div className="flex items-center gap-2 flex-1 max-w-[140px]">
          <Progress value={progress} />
          <span className="text-xs text-gray-500 font-semibold w-8 text-right shrink-0">
            {progress}%
          </span>
        </div>
      </div>
    </div>
  );
}

export default function TaskList({ tasks, onRetry }) {
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const [errorModal, setErrorModal] = useState(null);

  // 桌面表格列定义
  const columns = [
    {
      id: 'title',
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 hover:text-blue-600 whitespace-nowrap"
        >
          视频标题
          {column.getIsSorted() === 'asc' && <ChevronUp size={14} />}
          {column.getIsSorted() === 'desc' && <ChevronDown size={14} />}
        </button>
      ),
      cell: ({ row }) => (
        <div
          className="truncate font-medium text-gray-800 cursor-default"
          style={{ maxWidth: 280 }}
          title={row.original.title || '未知视频'}
        >
          {row.original.title || '未知视频'}
        </div>
      ),
    },
    {
      id: 'playlist_name',
      header: '合集',
      cell: ({ row }) => (
        <div
          className="text-xs text-gray-500 truncate cursor-default"
          style={{ maxWidth: 120 }}
          title={row.original.playlist_name || ''}
        >
          {row.original.playlist_name || '—'}
        </div>
      ),
    },
    {
      id: 'status',
      header: '状态',
      cell: ({ row }) => (
        <StatusBadge task={row.original} onOpen={() => setErrorModal(row.original)} />
      ),
    },
    {
      id: 'progress',
      header: '进度',
      cell: ({ row }) => {
        const progress = row.original.progress || 0;
        return (
          <div className="flex items-center gap-2" style={{ width: 140 }}>
            <Progress value={progress} />
            <span className="text-xs text-gray-600 font-semibold w-8 text-right shrink-0">
              {progress}%
            </span>
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <ActionButtons
          task={row.original}
          onRetry={onRetry}
          onOpenError={() => setErrorModal(row.original)}
        />
      ),
    },
  ];

  const table = useReactTable({
    data: safeTasks,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (safeTasks.length === 0) {
    return (
      <div className="text-center text-gray-500 py-12 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
        <div className="text-4xl mb-2">📭</div>
        <p className="text-base font-medium">暂无任务</p>
        <p className="text-sm text-gray-400">快去上方添加下载任务吧！</p>
      </div>
    );
  }

  return (
    <>
      {/* 移动端：卡片列表 */}
      <div className="sm:hidden space-y-2">
        {safeTasks.map((task) => (
          <MobileCard
            key={task.id}
            task={task}
            onRetry={onRetry}
            onOpenError={() => setErrorModal(task)}
          />
        ))}
      </div>

      {/* 桌面端：表格，横向可滚动以防内容超宽 */}
      <div className="hidden sm:block bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
        <Table style={{ minWidth: 560 }}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-gray-50">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {errorModal && (
        <ErrorModal
          title={errorModal.title || '未知视频'}
          error={errorModal.error_msg || '未知错误'}
          onClose={() => setErrorModal(null)}
        />
      )}
    </>
  );
}
