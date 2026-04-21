import { useState, useEffect } from "react";
import api from "../utils/api";
import APP_CONFIG from "../config";

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
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 2,
      title: "Vue.js 3 完整教程 - 从入门到精通",
      url: "https://www.bilibili.com/video/BV9876543210",
      status: "downloading",
      progress: 65,
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 3,
      title: "Web 安全防护指南 - OWASP Top 10",
      url: "https://www.bilibili.com/video/BV5555555555",
      status: "pending",
      progress: 0,
      createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
    {
      id: 4,
      title: "TypeScript 从零到一 - 企业级应用",
      url: "https://www.bilibili.com/video/BV3333333333",
      status: "failed",
      progress: 20,
      error: "Error: Network timeout after 30 seconds\n\nServer returned 503 Service Unavailable\nPlease try again later or check your network connection",
      createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 5,
      title: "Node.js 后端开发最佳实践",
      url: "https://www.bilibili.com/video/BV7777777777",
      status: "uploading",
      progress: 88,
      createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 6,
      title: "微前端架构深度解析 - Qiankun 框架详解",
      url: "https://www.bilibili.com/video/BV2222222222",
      status: "partial_completed",
      progress: 50,
      error: "Warning: 第5段视频因地域限制无法访问，已跳过",
      createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    },
  ];
  return mockTasks;
};

/**
 * 自定义Hook: 管理任务列表和WebSocket连接
 * @param {boolean} isAuthenticated - 是否已认证
 * @param {boolean} isActive - 是否在任务标签页中
 * @returns {Object} { tasks, statusFilter, setStatusFilter, filteredTasks }
 */
export const useTasks = (isAuthenticated, isActive) => {
  const [tasks, setTasks] = useState(import.meta.env.DEV ? generateMockTasks() : []);
  const [statusFilter, setStatusFilter] = useState("all");

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

  const rawtasks = tasks || [];
  const filteredTasks = rawtasks.filter((task) => {
    if (!task) return false;
    if (!statusFilter || statusFilter === "all") return true;
    return task.status === statusFilter;
  });

  console.log("最终交给组件渲染的数据数量:", filteredTasks.length);

  return {
    tasks,
    statusFilter,
    setStatusFilter,
    filteredTasks,
  };
};
