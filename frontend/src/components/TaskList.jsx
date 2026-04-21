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

export default function TaskList({ tasks, onRetry }) {
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const [errorModal, setErrorModal] = useState(null);

  // 定义表格列
  const columns = [
    {
      id: 'title',
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 hover:text-blue-600"
        >
          视频标题
          {column.getIsSorted() === 'asc' && <ChevronUp size={16} />}
          {column.getIsSorted() === 'desc' && <ChevronDown size={16} />}
        </button>
      ),
      cell: ({ row }) => (
        <div className="max-w-xs truncate font-medium text-gray-800">
          {row.original.title || '未知视频'}
        </div>
      ),
    },
    {
      id: 'status',
      header: '状态',
      cell: ({ row }) => {
        const statusMap = {
          pending: { text: '待处理 ⏳', variant: 'pending' },
          downloading: { text: '下载中 ⬇️', variant: 'downloading' },
          uploading: { text: '上传中 ☁️', variant: 'uploading' },
          completed: { text: '已完成 ✅', variant: 'completed' },
          failed: { text: '失败 ❌', variant: 'failed' },
          partial_completed: { text: '部分完成 ⚠️', variant: 'warning' },
        };
        const status = statusMap[row.original.status] || statusMap.pending;
        return <Badge variant={status.variant}>{status.text}</Badge>;
      },
    },
    {
      id: 'progress',
      header: '进度',
      cell: ({ row }) => {
        const progress = row.original.progress || 0;
        return (
          <div className="w-48 flex items-center gap-2">
            <Progress value={progress} />
            <span className="text-xs text-gray-600 font-semibold w-8 text-right">
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
        <div className="flex items-center gap-2">
          {row.original.status === 'failed' && (
            <button
              onClick={() => onRetry(row.original.id)}
              className="p-1.5 hover:bg-blue-100 rounded-lg transition-colors text-blue-600 hover:text-blue-700"
              title="重试"
            >
              <RotateCcw size={18} />
            </button>
          )}
          {row.original.error && (
            <button
              onClick={() => setErrorModal(row.original)}
              className="p-1.5 hover:bg-red-100 rounded-lg transition-colors text-red-600 hover:text-red-700"
              title="查看错误"
            >
              <AlertCircle size={18} />
            </button>
          )}
        </div>
      ),
    },
  ];

  // 创建表格实例
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
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <Table>
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

      {/* 错误详情模态框 */}
      {errorModal && (
        <ErrorModal
          title={errorModal.title || '未知视频'}
          error={errorModal.error || '未知错误'}
          onClose={() => setErrorModal(null)}
        />
      )}
    </>
  );
}