# Phase 1 — 项目基础设施：计划与验收报告

> 日期：2026-10-22　状态：**已完成，等待你验收**

## 1. 本阶段目标

搭好"能跑、能存、能导出、不乱写文件、不联网"的地基，让 Phase 2 只需专注测评本身。

## 2. 交付内容与文件

| 模块 | 关键文件 |
|---|---|
| Monorepo、许可证 | `package.json`、`LICENSE`(AGPL)、`LICENSE-MIT`、`NOTICE.md`、`README.md` |
| 新 Logo 与图标 | `assets/brand/mindscope-logo.svg`、`mindscope-icon.svg`、`apps/mindscope/src-tauri/icons/*` |
| 核心库 | `packages/core/src/{ids,time,model/profile}.ts` |
| 存储层（两端共用） | `packages/storage/src/{driver,migrate}.ts`、`migrations/0001_init.ts`（完整 ER 表结构）、`repositories/*` |
| 平台适配 | `apps/mindscope/src/platform/web/*`（sqlite-wasm + OPFS，Worker 中运行）、`platform/desktop/index.ts` |
| UI 骨架 | 侧边栏（桌面）/ 底部 Tab（手机）、亮/暗主题、中英双语、首次引导、人物卡列表/新建/编辑/删除、标签与筛选、数据与存储面板、设置、PDF 测试页 |
| Rust 薄壳 | `src-tauri/src/{paths,db,logging,storage,pdf,native,commands,lib}.rs`、`tauri.conf.json`（CSP） |
| 打包 | `scripts/package-portable.ps1` |
| 测试 | `packages/*/test/*`、`src-tauri` 内 `#[cfg(test)]`、`apps/mindscope/e2e/web.spec.ts` |

## 3. 关键实现决定

| 问题 | 做法 |
|---|---|
| 网页端和桌面端如何共用数据库代码 | 定义 `SqlDriver` 接口（query / execute / batch）。SQL、迁移、Repository 只写一次（TS）；网页端由 sqlite-wasm 执行，桌面端由 Rust rusqlite 执行。 |
| 迁移安全 | 每个迁移有校验和；已有数据的库在迁移前**自动备份**；迁移失败整体回滚；数据库版本比程序新时拒绝打开并提示。 |
| 不写 C 盘 | 数据根目录 = exe 所在目录；WebView2 配置目录显式重定向到 `cache/webview2`；启动时检测可写性，失败则弹出中英文原生对话框并退出。 |
| 迁移数据目录 | 复制到 `<所选文件夹>/MindScopeData`，在 exe 旁写指针文件 `mindscope.portable.json`，重启生效；旧数据不自动删除。 |
| 缓存清理 | `cache/tmp` 立即清理；WebView2 缓存运行中被锁定，因此标记为"下次启动时清理"。 |
| 删除人物卡 | 二次确认；桌面端删除前自动备份。 |
| 网页端多标签页 | OPFS 同时只能被一个标签页占用；第二个标签页会显示"已在另一个标签页打开"，而不是悄悄改用临时内存库（那样会让用户误以为数据丢失）。 |
| PDF | WebView2 原生 `PrintToPdf`（A4、打印背景色、无页眉页脚），使用系统中文字体；图表用 ECharts SVG 渲染。网页端调用浏览器打印。 |
| ECharts 版本 | 原计划 5.6，但 5.x 有已公开的 XSS 漏洞（GHSA-fgmj-fm8m-jvvx），改用已修复的 6.1。 |

## 4. 验收结果（全部为实测）

| 验收项 | 结果 | 方法 |
|---|---|---|
| 核心库与存储层单元测试 | ✅ 21/21 通过 | `npm test`（Vitest，Node 内置 SQLite 作为第三个驱动） |
| Rust 单元测试 | ✅ 15/15 通过 | `npm run test:rust` |
| 网页端 E2E | ✅ 4/4 通过 | Playwright + 系统 Edge，针对**生产构建**（含 CSP） |
| 类型检查 | ✅ 无错误 | `vue-tsc` / `tsc` |
| 网页端启动、首次引导、创建人物卡 | ✅ | E2E + 浏览器面板人工检查 |
| 网页端刷新后数据仍在 | ✅ | E2E（真实 reload） |
| 网页端无任何外部请求、无 CSP 报错 | ✅ | E2E 监听所有网络请求与控制台 |
| 手机宽度布局、暗色模式 | ✅ | 375×812 模拟 + E2E |
| Release 单文件 exe | ✅ 9.0 MB | `tauri build --no-bundle` |
| 绿色版压缩包只含 exe + LICENSE | ✅ 3.7 MB，2 个文件 | `npm run package:portable` |
| exe 复制到 D 盘新文件夹后直接运行 | ✅ 自动创建 data/logs/cache/config | 冒烟测试 |
| 数据库创建 + 迁移 + 写入人物卡 | ✅ | 冒烟测试 + 用 Python 读取 db 核对 |
| 重启后数据仍在、不重复迁移 | ✅ 第二次运行读到 2 张卡，无迁移日志 | 冒烟测试第二轮 |
| WebView2 PDF 导出（中文、渐变条、分页、八边形雷达） | ✅ 2 页 A4，中文为可选中文字（非图片） | 冒烟测试生成 `smoke.pdf` 并逐页查看 |
| 运行期间不写入 `%LOCALAPPDATA%` / `%APPDATA%` | ✅ 未发现任何与 MindScope / EBWebView / Tauri 相关的新文件或文件夹 | 运行前后按时间戳扫描 AppData |

## 5. 已知限制（如实说明）

1. **C 盘检查方法**：本机没有 Process Monitor，我用的是"运行前后按时间戳 + 名称扫描 AppData"。它能发现以 MindScope / WebView2 命名的文件夹，但不能证明 0 字节写入；也没有检查注册表。WebView2 运行时本身是微软组件，可能通过 Windows 更新机制联网，这不在应用控制范围内。
2. **源码地址是占位符**：关于页和 LICENSE 中的 `https://github.com/mindscope-project/mindscope` 还不存在（2026-10-25 已替换为 https://github.com/EvanLi-0505/MindScope-Personality-Assessment），需要你建好仓库后替换（`packages/core/src/index.ts` 和 `scripts/package-portable.ps1`）。
3. **网页端日志**只保存在当前标签页内存中（浏览器无法写日志文件）。
4. **网页端备份**是下载 `.db` 文件；浏览器在空间不足时可能清除数据，页面会提示定期备份。
5. 冒烟测试通过环境变量 `MINDSCOPE_SMOKE_PDF` 触发，仅用于自动化测试；正常启动时该路径不会被使用，且 `print_pdf_to` 命令只接受这一个路径。
6. 雷达图的轴顺序目前是 ECharts 默认的逆时针，Phase 2 会改成按功能对（Ni/Ne、Si/Se…）有意义的顺序排列。

## 6. 你可以自己验证

1. 解压 `release/MindScope-0.1.0-win-x64-portable.zip` 到任意可写位置（例如 `D:\MindScope`），双击 `MindScope.exe`。
2. 按引导创建人物卡 → 打开「数据与存储」查看文件夹、备份、清理日志/缓存。
3. 「设置 → 诊断 → PDF 导出测试」→「导出 PDF」，选择保存位置。
4. 网页版：`npm run dev:web` 后打开 http://localhost:5173 。
