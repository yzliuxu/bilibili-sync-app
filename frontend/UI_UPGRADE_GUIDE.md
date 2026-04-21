# 任务队列 UI 升级指南 - 方案 B 实现

## 📦 升级内容

### 新增依赖
```bash
npm install @tanstack/react-table lucide-react
```

### 新建组件体系

#### 1. **shadcn/ui 基础组件** (`src/components/ui/`)
- `table.jsx` - 完整的表格组件集
- `badge.jsx` - 任务状态徽章
- `progress.jsx` - 进度条
- `index.js` - 导出索引

#### 2. **改进的业务组件**
- `TaskList.jsx` - 从简单列表升级为完整数据表格
- `ErrorModal.jsx` - 独立抽取的错误详情模态框

---

## ✨ 核心功能

### TanStack Table 集成
```javascript
// 使用 useReactTable Hook 创建表格实例
const table = useReactTable({
  data: safeTasks,
  columns,
  getCoreRowModel: getCoreRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getSortedRowModel: getSortedRowModel(),
});
```

### 表格功能
- ✅ **列排序** - 点击表头排序（升序/降序）
- ✅ **进度展示** - 任务下载进度可视化
- ✅ **状态徽章** - 彩色标签显示任务状态
- ✅ **快速操作** - 重试和查看错误
- ✅ **响应式设计** - 自适应不同屏幕宽度

### 表格列定义

| 列 | 功能 | 特性 |
|----|------|------|
| **视频标题** | 显示视频名称 | 可排序，超长截断 |
| **状态** | 显示当前任务状态 | 彩色徽章，6种状态 |
| **进度** | 下载进度条 | 实时更新，百分比显示 |
| **操作** | 快速操作按钮 | 重试、查看错误 |

---

## 🎨 样式系统

### Badge 状态变体
```javascript
pending:         灰色  ⏳ 待处理
downloading:     蓝色  ⬇️ 下载中
uploading:       紫色  ☁️ 上传中
completed:       绿色  ✅ 已完成
failed:          红色  ❌ 失败
partial_completed: 黄色 ⚠️ 部分完成
```

### 颜色方案
- 所有组件完全基于 Tailwind CSS
- 使用标准颜色系统（gray, blue, green, red, yellow, purple）
- 支持 hover 和 active 状态动画

---

## 📊 表格交互流程

```
用户操作
  ↓
① 点击表头 → 排序列
② 点击重试按钮 → 调用 onRetry(taskId)
③ 点击错误按钮 → 显示错误详情模态框
④ WebSocket 推送 → 自动更新表格行
```

---

## 🔄 数据流

```
TaskList 组件
  ↓
接收 tasks 数据
  ↓
useReactTable 创建表格实例
  ↓
定义 4 个表格列
  ↓
renderTable()
  ↓
最终渲染到 DOM
```

---

## 💡 使用 shadcn/ui 的好处

### 1. **完全可定制**
```javascript
// 所有组件都是源码形式，完全可修改
// 在 src/components/ui/ 中修改任何组件
```

### 2. **无需 CDN**
```javascript
// 所有代码都打包到生产环境
// 没有额外的网络请求
```

### 3. **Tailwind CSS 完美集成**
```javascript
// 直接使用你已有的 Tailwind CSS 配置
// 无样式冲突，无需额外配置
```

### 4. **体积优化**
- 只复制需要的组件
- 没有未使用的代码
- 最终 JS 体积：295.57 KB (gzip: 93.63 KB)

---

## 📱 响应式支持

### 表格在不同屏幕的表现
| 屏幕 | 表现 |
|------|------|
| **桌面** | 完整表格，4列全显示 |
| **平板** | 自动适配，列宽可调 |
| **手机** | 水平滚动（如需要） |

---

## 🚀 后续可扩展功能

### 可以轻松添加的功能
1. **行选择** - 多选删除任务
2. **分页** - 大数据列表分页加载
3. **高级搜索** - 按标题、状态搜索
4. **导出** - 导出任务列表为 CSV/Excel
5. **行高亮** - 标记重要任务
6. **拖拽排序** - 手动排序任务

### 示例：添加行选择
```javascript
// 在 columns 中添加
{
  id: 'select',
  header: ({ table }) => (
    <input
      type="checkbox"
      checked={table.getIsAllRowsSelected()}
      onChange={table.getToggleAllRowsSelectedHandler()}
    />
  ),
  cell: ({ row }) => (
    <input
      type="checkbox"
      checked={row.getIsSelected()}
      onChange={row.getToggleSelectedHandler()}
    />
  ),
}
```

---

## ✅ 编译验证

```
✓ 1785 modules transformed
✓ built in 493ms
✓ No errors or warnings
```

---

## 🎓 代码示例

### 在其他组件中使用表格组件
```javascript
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './components/ui';
import { Badge } from './components/ui/badge';
import { Progress } from './components/ui/progress';

function MyComponent() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>名称</TableHead>
          <TableHead>进度</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {/* ... */}
      </TableBody>
    </Table>
  );
}
```

---

## 📚 参考资源

- **TanStack Table**: https://tanstack.com/table/v8
- **Tailwind CSS**: https://tailwindcss.com
- **Lucide Icons**: https://lucide.dev
- **shadcn/ui Philosophy**: https://ui.shadcn.com

