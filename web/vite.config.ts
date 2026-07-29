/// <reference types="vitest/config" />
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import { parseChangelog } from "./src/lib/release";

const webDir = dirname(fileURLToPath(import.meta.url));
const localVersion = readFileSync(resolve(webDir, "../VERSION"), "utf8").trim() || "dev";
const localChangelog = readFileSync(resolve(webDir, "../CHANGELOG.md"), "utf8");

// 暴露 /plugins/index.json:列出 public/plugins 下的本地插件文件,
// 供前端自动发现并加入插件列表(默认关闭)。dev 下实时读目录,构建时产出静态清单。
function localPluginsManifest(): Plugin {
    const pluginsDir = resolve(webDir, "public/plugins");
    const listLocalPlugins = () => {
        try {
            return readdirSync(pluginsDir)
                .filter((file) => file.endsWith(".js"))
                .sort()
                .map((file) => `/plugins/${file}`);
        } catch {
            return [];
        }
    };
    return {
        name: "local-plugins-manifest",
        configureServer(server) {
            server.middlewares.use("/plugins/index.json", (_req, res) => {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(listLocalPlugins()));
            });
        },
        generateBundle() {
            this.emitFile({ type: "asset", fileName: "plugins/index.json", source: JSON.stringify(listLocalPlugins()) });
        },
    };
}

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
    },
    base: process.env.VITE_BASE || "/",
    plugins: [react(), localPluginsManifest()],
    resolve: {
        alias: {
            "@": resolve(webDir, "src"),
        },
    },
    define: {
        __APP_VERSION__: JSON.stringify(localVersion),
        __APP_RELEASES__: JSON.stringify(parseChangelog(localChangelog)),
    },
    build: {
        // 主 bundle 体积较大，调高警告阈值（单位 kB）
        chunkSizeWarningLimit: 1600,
        rollupOptions: {
            output: {
                // 按依赖拆包，避免单个主 chunk 过大，改善首屏加载与缓存
                manualChunks(id) {
                    if (!id.includes("node_modules")) return;
                    if (id.includes("antd") || id.includes("@ant-design") || id.includes("@emotion") || id.includes("/motion/")) return "antd-vendor";
                    if (id.includes("codemirror")) return "editor-vendor";
                    if (id.includes("pdfjs-dist") || id.includes("jspdf") || id.includes("html2canvas")) return "pdf-vendor";
                    if (id.includes("@supabase")) return "supabase-vendor";
                    if (id.includes("@dnd-kit")) return "dnd-vendor";
                    if (id.includes("react-router") || id.includes("react-dom") || id.includes("node_modules/react/") || id.includes("scheduler")) return "react-vendor";
                    if (id.includes("@tanstack") || id.includes("zustand")) return "state-vendor";
                },
            },
        },
    },
    server: {
        proxy: {
            // 开发环境代理：解决 AI API 的 CORS 限制
            "/ai-cors-proxy-dashscope": {
                target: "https://dashscope.aliyuncs.com",
                changeOrigin: true,
                secure: true,
                rewrite: (path) => path.replace(/^\/ai-cors-proxy-dashscope/, "/compatible-mode"),
            },
            "/ai-cors-proxy-siliconflow": {
                target: "https://api.siliconflow.cn",
                changeOrigin: true,
                secure: true,
                rewrite: (path) => path.replace(/^\/ai-cors-proxy-siliconflow/, ""),
            },
            "/ai-cors-proxy-ark": {
                target: "https://ark.cn-beijing.volces.com",
                changeOrigin: true,
                secure: true,
                rewrite: (path) => path.replace(/^\/ai-cors-proxy-ark/, "/api/v3"),
            },
            "/ai-cors-proxy": {
                target: process.env.VITE_AI_PROXY_TARGET || "https://ws-ej37wfihrpgy74sf.cn-beijing.maas.aliyuncs.com",
                changeOrigin: true,
                secure: true,
                rewrite: (path) => path.replace(/^\/ai-cors-proxy/, process.env.VITE_AI_PROXY_REWRITE || "/compatible-mode"),
            },
        },
    },
});
