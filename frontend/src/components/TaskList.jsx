import TaskItem from './TaskItem';

export default function TaskList({ tasks, onRetry }) {
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  if (safeTasks.length === 0) {
    return (
      <div className="text-center text-gray-500 py-10 border-2 border-dashed border-gray-200 rounded-md">
        暂无任务，快去上方添加吧！
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
      {tasks.map(task => (
        <TaskItem key={task.id} task={task} onRetry={onRetry} />
      ))}
    </div>
  );
}