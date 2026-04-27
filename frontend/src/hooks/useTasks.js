import { useState, useEffect, useMemo } from "react";
import api from "../utils/api";
import APP_CONFIG from "../config";

const STATUS_ORDER = ['pending', 'downloading', 'uploading', 'completed', 'partial_completed', 'failed'];

/**
 * 【开发模式】生成模拟任务数据
 */
const generateMockTasks = () => {
  const mockTasks = [
    {
      id: 1,
      title: "【双语字幕】2024年B站最火的技术分享 - React 性能优化",
      url: "https://www.bilibili.com/video/BV1234567890",
      status: "completed",
      progress: 100,
      playlist_name: "前端技术精选合集",
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 2,
      title: "Vue.js 3 完整教程 - 从入门到精通",
      url: "https://www.bilibili.com/video/BV9876543210",
      status: "downloading",
      progress: 65,
      playlist_name: "前端技术精选合集",
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 3,
      title: "Web 安全防护指南 - OWASP Top 10",
      url: "https://www.bilibili.com/video/BV5555555555",
      status: "pending",
      progress: 0,
      playlist_name: null,
      createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
    {
      id: 4,
      title: "TypeScript 从零到一 - 企业级应用",
      url: "https://www.bilibili.com/video/BV3333333333",
      status: "failed",
      progress: 20,
      playlist_name: null,
      error_msg: "Error: Network timeout after 30 seconds\n\nServer returned 503 Service Unavailable\nPlease try again later or check your network connection",
      createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 5,
      title: "Node.js 后端开发最佳实践",
      url: "https://www.bilibili.com/video/BV7777777777",
      status: "uploading",
      progress: 88,
      playlist_name: null,
      createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 6,
      title: "微前端架构深度解析 - Qiankun 框架详解",
      url: "https://www.bilibili.com/video/BV2222222222",
      status: "partial_completed",
      progress: 50,
      playlist_name: "架构专题",
      error_msg: "Warning: 第5段视频因地域限制无法访问，已跳过",
      createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 7,
      title: "[已展开合集] 前端技术精选合集",
      url: "https://space.bilibili.com/999999/channel/collectiondetail?sid=12345",
      status: "completed",
      progress: 100,
      playlist_name: null,
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
  return mockTasks;
};

/**
 * 自定义Hook: 管理任务列表和WebSocket连接
 * @param {boolean} isAuthenticated - 是否已认证
 * @param {boolean} isActive - 是否在任务标签页中
 * @returns {Object} { tasks, availableStatuses, selectedStatuses, setSelectedStatuses, filteredTasks }
 */
export const useTasks = (isAuthenticated, isActive) => {
  const [tasks, setTasks] = useState(import.meta.env.DEV ? generateMockTasks() : []);
  // null = default mode: show all except 'pending'
  // Set  = explicit mode: show only the statuses in the Set
  const [selectedStatuses, setSelectedStatuses] = useState(null);

  useEffect(() => {
    let ws = null;
    if (isAuthenticated && isActive) {
      // 【开发模式】跳过API调用，使用本地数据
      if (import.meta.env.DEV) {
        console.log("📌 [DEV] 使用模拟数据，共有任务:", tasks.length);
        return;
      }

      // 1. 【防御性设计】主动拉取初始全量数据
      const initFetch = async () => {
        try {
          const res = await api.get(APP_CONFIG.API.TASKS);
          console.log("RESTful 初始化数据拉取成功, 共有任务:", res.data.length);
          setTasks(res.data);
        } catch (err) {
          console.error("RESTful 初始化数据拉取失败:", err);
        }
      };
      initFetch();

      // 2. 【响应式设计】建立长连接监听后续状态流转
      const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
      const wsUrl = import.meta.env.DEV
        ? "ws://localhost:8000/api/ws/tasks"
        : `${wsProtocol}://${window.location.host}/api/ws/tasks`;

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("WebSocket 连接已建立，进入响应式模式 ⚡");
      };

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

    // 组件卸载或切换标签时，优雅地销毁长连接
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [isAuthenticated, isActive]);

  // 从实际数据中提取所有出现过的状态，按预定义顺序排列
  const availableStatuses = useMemo(() => {
    const present = new Set((tasks || []).map(t => t?.status).filter(Boolean));
    return STATUS_ORDER.filter(s => present.has(s));
  }, [tasks]);

  // 当 selectedStatuses 为 null 时，默认展示除 pending 以外的所有状态
  const effectiveFilter = selectedStatuses === null
    ? new Set(availableStatuses.filter(s => s !== 'pending'))
    : selectedStatuses;

  const rawtasks = tasks || [];
  const filteredTasks = rawtasks.filter((task) => {
    if (!task) return false;
    if (task.title?.startsWith('[已展开合集]')) return false;
    return effectiveFilter.has(task.status);
  });

  console.log("最终交给组件渲染的数据数量:", filteredTasks.length);

  return {
    tasks,
    availableStatuses,
    selectedStatuses,      // null | Set — null 表示"默认模式"
    setSelectedStatuses,
    filteredTasks,
  };
};
