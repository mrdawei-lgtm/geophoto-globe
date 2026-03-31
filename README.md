# GeoPhoto Globe

一个按地理位置浏览照片的 Web 应用，包含公开前台和图片 CMS 后台。  
A web application for browsing photos by geography, including a public globe frontend and an admin CMS.

项目目录：`/Users/dawei/Desktop/geophoto-globe`  
Project path: `/Users/dawei/Desktop/geophoto-globe`

## 项目概览 | Overview

这个项目解决两件事：  
This project focuses on two core problems:

1. 提供一个公开可访问的 3D 地球前台，用户可以按地理位置浏览照片。  
   Provide a public 3D globe experience for browsing photos by location.
2. 提供一个图片 CMS 后台，管理员可以导入照片、编辑信息、补充 GPS、批量管理显示状态，并维护同地点共享简介。  
   Provide an admin CMS for importing photos, editing metadata, filling in GPS, managing visibility in batches, and maintaining shared intros per location.

核心体验不是普通相册，而是按地点浏览照片库。  
The core experience is not a conventional album, but a location-driven photo library.

## 产品方案 | Product Design

### 公开前台 | Public Frontend

前台首页是一个可交互的 3D 地球。  
The public homepage is an interactive 3D globe.

- 支持鼠标或触控交互  
  Supports mouse and touch interaction
- 能看到海洋和陆地边界  
  Shows oceans and land boundaries
- 使用预烘焙地球底图和独立矢量海岸线 / 国境线  
  Uses a prebaked earth texture plus separate vector coastlines and country borders
- 照片按经纬度映射到地球表面  
  Maps photos onto the globe by latitude and longitude
- 远景下显示聚合点  
  Shows cluster markers at distant zoom levels
- 近景下按屏幕中心区域展开为单张照片缩略图，外围继续显示聚合点  
  Expands into individual photo thumbnails near the center of the screen while keeping peripheral markers clustered
- 右上角支持切换 `Default`、`Dark`、`Bright` 三套公开页主题  
  Supports `Default`, `Dark`, and `Bright` public themes from the top-right selector
- 桌面端支持 hover 放大缩略图  
  Supports hover enlargement for thumbnails on desktop
- 点击照片后全屏显示大图和文字介绍，支持右上角关闭与图片填充切换  
  Opens a full-screen lightbox with image, metadata, a top-right close button, and fit/fill controls
- 地球上显示一组国际城市名称作为参考标注  
  Shows a curated set of international city labels as geographic reference points

用户浏览逻辑：  
User browsing flow:

1. 进入地球页面  
   Open the globe page
2. 旋转、缩放地球  
   Rotate and zoom the globe
3. 远景看区域聚合  
   Browse regional clusters from afar
4. 拉近后看单张照片缩略图  
   Zoom in to inspect individual thumbnails
5. 点击照片进入全屏灯箱  
   Open a full-screen lightbox
6. 查看图片、介绍、拍摄时间、地点信息  
   View the photo, description, capture time, and location

### 图片 CMS 后台 | Admin CMS

后台是单管理员使用的管理系统，负责维护整个照片库。  
The CMS is a single-admin system used to maintain the photo library.

已实现或已纳入当前范围的能力：  
Implemented or currently in scope:

- 图片列表页  
  Photo list page
- 照片组列表页  
  Photo-group list page
- 紧凑缩略图卡片与分组入口  
  Compact thumbnail cards with inline group entry points
- 图片详情编辑页  
  Photo detail editor
- 单图页组侧栏与组内导航  
  Group sidebar and in-group navigation in the single-photo editor
- 无 GPS 照片筛选  
  Missing-GPS filtering
- 无地名照片筛选  
  Missing-place-label filtering
- 手动设置 GPS  
  Manual GPS editing
- 粘贴式坐标输入  
  Paste-friendly coordinate input
- 根据地址联网搜索经纬度  
  Geocoding by address search
- 后台首页可控制前台测试窗口开关  
  Toggle the public homepage debug panel from the admin list page
- 工作队列快捷筛选与一键切换 / 取消  
  Work-queue shortcuts with one-click apply / clear behavior
- 批量删除  
  Batch soft delete
- 批量恢复  
  Batch restore
- 批量显示 / 隐藏  
  Batch show / hide
- 批量设置 GPS  
  Batch GPS update
- 组封面设置  
  Group cover-photo selection
- 拆组 / 合组  
  Group split / merge actions
- 单列组详情弹窗与组内紧凑缩略图管理  
  Single-column group detail modal with compact in-group thumbnail management
- 批量导入照片  
  Batch photo import
- 永久清理已软删除照片  
  Permanent purge for soft-deleted photos
- 单图详情页显示 GPS 反查地理信息  
  Show reverse-geocoded location details on the single-photo detail page
- 单图详情页可单独重生成当前照片组 AI 简介  
  Regenerate the shared AI intro for the current photo group from the single-photo detail page

管理员操作逻辑：  
Admin workflow:

1. 登录 CMS  
   Sign in to the CMS
2. 批量导入照片  
   Import photos in batches
3. 查看缩略图列表  
   Review imported thumbnails
4. 点击缩略图进入单图编辑  
   Open a photo editor
5. 在 `Photos` 与 `Groups` 两个视图之间切换  
   Switch between `Photos` and `Groups` views
6. 编辑标题、介绍、地点标签、拍摄时间  
   Edit title, description, location label, and capture time
   同组照片共用一段地点简介和 prompt  
   Photos in the same group share one location intro and prompt
7. 对无 GPS 图片手动补点  
   Add GPS to photos missing coordinates
8. 输入地址搜索坐标并确认写入  
   Search for coordinates by address and save them
9. 进入组详情编辑地点名称、坐标、prompt、简介，并设置封面图、拆组 / 合组、整组显示 / 隐藏  
   Open a group detail view to edit the location label, coordinates, prompt, and intro, then set a cover photo, split / merge groups, or show / hide the whole group
10. 进行批量显示 / 隐藏、删除 / 恢复、GPS 设置  
   Perform batch visibility, delete / restore, and GPS actions

## 视觉资源说明 | Visual Asset Credits

公开页主题背景图位于 `src/assets/themes/`。  
Public-theme background images live in `src/assets/themes/`.

- `dark-background.jpg` 来自 [Unsplash](https://unsplash.com/photos/KvgB81s4dF0)  
  `dark-background.jpg` is sourced from [Unsplash](https://unsplash.com/photos/KvgB81s4dF0)
- `bright-background.jpg` 来自 [Unsplash](https://unsplash.com/photos/lNoAcnHIRo0)  
  `bright-background.jpg` is sourced from [Unsplash](https://unsplash.com/photos/lNoAcnHIRo0)

如果后续替换这些背景图，请在更新资源的同时同步修改这里的来源说明。  
If these backgrounds are replaced later, update this attribution section at the same time.

## 技术栈 | Tech Stack

### 前端 | Frontend

- `React`
- `Vite`
- `React Router`
- `React Three Fiber`
- `@react-three/drei`
- `Three.js`

适合原因：  
Why this stack:

- 前台 3D 地球和后台 CMS 可以在一个工程里维护  
  The public globe and admin CMS can live in one codebase
- 便于继续扩展搜索、筛选、时间轴和更多详情视图  
  Easy to extend with search, filters, timelines, and richer detail views
- 对交互式 3D 场景和常规 Web UI 都足够灵活  
  Flexible enough for both interactive 3D scenes and standard web UI

### 后端 | Backend

- `Node.js`
- `Express`
- `SQLite`
- `multer` 处理上传  
  `multer` for uploads
- `sharp` 生成缩略图和展示图  
  `sharp` for thumbnails and display images
- `exifr` 读取 EXIF  
  `exifr` for EXIF parsing
- `exiftool-vendored` 读取补充元数据  
  `exiftool-vendored` for supplemental metadata reads

### 分层结构 | Backend Structure

当前后端已按可复用结构拆分：  
The backend is organized into reusable layers:

- `server/db/`
- `server/repositories/`
- `server/services/`
- `server/routes/`

这样可以把路由、数据访问和业务逻辑分开，方便未来复用到 Web CMS 和小程序后台。  
This separates routes, data access, and business logic, making future reuse easier across the web CMS and a mini-program admin client.

## 数据存储 | Data Storage

当前实现使用 SQLite 保存照片元数据和导入任务：  
The project uses SQLite as the source of truth for photo metadata and import jobs:

- `data/geophoto-globe.sqlite`

兼容首版历史数据：  
Legacy compatibility:

- 如果存在旧的 `data/photos.json`，并且数据库为空，服务启动或执行数据库引导脚本时会自动执行一次性导入  
  If a legacy `data/photos.json` exists and the database is empty, startup or bootstrap will import it once

图片资源目录：  
Image storage directories:

- `storage/originals`
- `storage/managed`
- `storage/thumbs`
- `storage/display`

设计原则：  
Design principles:

- 原图保留不改动  
  Keep original files untouched
- 托管副本主要用于导入阶段的统一元数据读取和兼容处理  
  Managed copies are primarily used for import-time metadata reads and compatibility handling
- 缩略图和展示图独立生成  
  Generate thumbnails and display images separately
- 元数据和导入任务统一落到 SQLite  
  Keep metadata and import jobs in SQLite

## 数据模型 | Data Model

每张照片当前至少包含以下字段：  
Each photo currently includes at least these fields:

- `id`
- `photoGroupId`
- `originalAssetPath`
- `managedAssetPath`
- `thumbnailUrl`
- `displayImageUrl`
- `title`
- `description`
- `descriptionSource`
- `capturedAt`
- `latitude`
- `longitude`
- `altitude`
- `hasGeo`
- `locationLabel`
- `visibilityStatus`
- `deletedAt`
- `importedAt`
- `updatedAt`

照片组当前至少包含以下字段：  
Each photo group currently includes at least these fields:

- `id`
- `latitude`
- `longitude`
- `locationLabel`
- `narrativePrompt`
- `description`
- `descriptionSource`
- `geoCountryEn`
- `geoRegionEn`
- `geoLocalityEn`
- `geoSummaryEn`
- `geoResolvedAt`
- `coverPhotoId`
- `createdAt`
- `updatedAt`

状态规则：  
State rules:

- `visibilityStatus` 只有 `visible` 和 `hidden`  
  `visibilityStatus` is either `visible` or `hidden`
- `descriptionSource` 只有 `none`、`auto` 和 `manual`  
  `descriptionSource` is either `none`, `auto`, or `manual`
- 删除采用软删除，用 `deletedAt` 标记  
  Deletion is soft deletion via `deletedAt`
- 前台只显示 `visible + deletedAt = null + hasGeo = true` 的记录  
  The public frontend only shows `visible + deletedAt = null + hasGeo = true`
- 第一版照片组仍按精确经纬度初始化，但后台之后以 `photo_group_id` 作为组标识  
  The first version still initializes groups from exact coordinates, but the admin backend now treats `photo_group_id` as the source of truth
- 同组照片共享 `description`、`narrativePrompt`、`locationLabel` 与地理摘要字段  
  Photos in the same group share `description`, `narrativePrompt`, `locationLabel`, and the resolved geo-summary fields
- 每个组可以指定一张 `coverPhotoId` 作为后台和前台分组展示的代表缩略图  
  Each group can assign one `coverPhotoId` as the representative thumbnail for admin and public grouped views

## 图片导入流程 | Photo Import Flow

管理员上传照片后，服务端按以下流程处理：  
After upload, the server processes each photo as follows:

1. 管理端先创建一个批量导入 job  
   The admin UI creates a batch import job
2. 前端把选中的文件放入本地上传队列  
   The frontend puts selected files into a local queue
3. 前端按小并发逐个把文件上传到该 job  
   The frontend uploads files into the job with small controlled concurrency
4. 每个文件独立处理：  
   Each file is processed independently:
   - 保存原始文件到 `storage/originals`  
     Save the original file to `storage/originals`
   - 复制托管副本到 `storage/managed`  
     Copy a managed version to `storage/managed`
   - 读取 EXIF 信息  
     Parse EXIF metadata
   - 提取拍摄时间、GPS、海拔  
     Extract capture time, GPS, and altitude
   - 若已有 GPS，则生成或复用对应照片组的中文简介  
     If GPS already exists, generate or reuse the shared Chinese intro for the corresponding photo group
   - 生成缩略图到 `storage/thumbs`  
     Generate a thumbnail in `storage/thumbs`
   - 生成展示图到 `storage/display`  
     Generate a display image in `storage/display`
   - 将元数据写入 SQLite  
     Persist metadata to SQLite
5. 服务端持续更新 job 和 job item 状态  
   The server continuously updates job and job-item status

如果图片没有 GPS：  
If a photo has no GPS:

- 照片仍然导入  
  The photo is still imported
- 后台可见  
  It remains visible in the admin CMS
- 前台不显示  
  It does not appear on the public globe

## 导入任务机制 | Import Job Model

当前导入机制是轻量级本地 job 系统，使用 SQLite 落盘：  
The import flow uses a lightweight local job system backed by SQLite:

- `import_jobs`
- `import_job_items`

推荐导入接口：  
Recommended import endpoints:

- `POST /api/admin/import-jobs`
- `POST /api/admin/import-jobs/:id/files`
- `GET /api/admin/import-jobs`
- `GET /api/admin/import-jobs/:id`

当前管理端上传队列固定并发为 `2`。  
The current admin upload queue runs with fixed concurrency `2`.

当前上传入口是管理端列表页中的弹出窗口，可在上传过程中最小化为右下角悬浮状态条。  
The current upload entry is a modal in the admin list page and can be minimized into a bottom-right floating status dock while uploads continue.

每个文件拥有独立状态：  
Each file has an independent lifecycle:

- `queued`
- `uploading`
- `processing`
- `success`
- `failed`

当前导入仍在当前 Node 进程内执行，但会把进度、成功数、失败数和错误信息写入 SQLite。  
Imports still run in-process, but progress, success counts, failure counts, and per-file errors are persisted in SQLite.

兼容旧调用：  
Legacy compatibility:

- `POST /api/admin/photos/import` 仍然保留，并继续返回 `jobId`、`job`、`results`  
  `POST /api/admin/photos/import` still exists and returns `jobId`, `job`, and `results`

## GPS 编辑方案 | GPS Editing

### 单张编辑 | Single Photo Editing

管理员在图片编辑页可：  
In the photo editor, the admin can:

- 直接粘贴 `latitude, longitude` 形式的坐标  
  Paste coordinates directly in `latitude, longitude` format
- 输入地址搜索坐标  
  Search by address
- 编辑 `description`、`locationLabel`、`narrativePrompt` 时，同组照片会自动同步  
  Editing `description`, `locationLabel`, or `narrativePrompt` automatically syncs the same group-level values to all photos in the same group
- 在组侧栏中查看组封面、组成员缩略图、上一张 / 下一张导航，并可把当前照片设为组封面  
  Use the group sidebar to inspect the group cover, member thumbnails, previous / next navigation, and set the current photo as the group cover
- 保存后更新数据库，并同步当前组的共享字段逻辑  
  Saving updates the database and synchronizes current group-level shared fields

### 批量设置 GPS | Batch GPS Update

首版批量 GPS 采用统一地点模式：  
The first version uses a shared-location batch GPS mode:

- 选中多张照片  
  Select multiple photos
- 输入一组 `latitude, longitude` 坐标，或输入一个地址  
  Enter one `latitude, longitude` pair or one address
- 系统把同一地点写入所有选中照片  
  The system applies the same location to all selected photos
- 系统随后把这些照片挂到同一照片组，并按该组生成或复用同一段中文简介  
  The system then places those photos into the same photo group and generates or reuses one shared Chinese intro for that group

### 照片组管理 | Photo Group Management

后台新增 `Groups` 视图，管理员可：  
The admin CMS now includes a `Groups` view where the admin can:

- 查看组封面、组内照片数、共享简介状态、prompt 状态和异常标签  
  Review group cover thumbnails, member counts, shared-intro state, prompt state, and issue tags
- 打开组详情弹窗，以单列表单编辑地点名称、坐标、共享 prompt 与共享简介  
  Open a group detail modal with a single-column form for location label, coordinates, shared prompt, and shared intro
- 选定组封面图  
  Choose a group cover image
- 点击组内缩略图直接进入单图页  
  Open the single-photo editor directly by clicking a member thumbnail
- 把选中成员拆成新组或移出为未分组  
  Split selected members into a new group or remove them into an ungrouped state
- 选中多个组后合并到第一选中的目标组  
  Merge multiple groups into the first selected target group
- 整组显示 / 隐藏  
  Show or hide an entire group

## API 摘要 | API Summary

### 公开接口 | Public APIs

- `GET /api/photos?mode=cluster|items&deviceTier=...`
- `GET /api/photos/:id`

### 后台接口 | Admin APIs

- `POST /api/admin/login`
- `GET /api/admin/photos`
- `GET /api/admin/photos/:id`
- `PATCH /api/admin/photos/:id`
- `POST /api/admin/photos/:id/regenerate-description`
- `GET /api/admin/photo-groups`
- `GET /api/admin/photo-groups/:id`
- `PATCH /api/admin/photo-groups/:id`
- `POST /api/admin/photo-groups/:id/set-cover`
- `POST /api/admin/photo-groups/:id/regenerate-description`
- `POST /api/admin/photo-groups/merge`
- `POST /api/admin/photo-groups/:id/remove-photos`
- `POST /api/admin/photo-groups/:id/add-photos`
- `POST /api/admin/photo-groups/:id/visibility`
- `POST /api/admin/import-jobs`
- `POST /api/admin/import-jobs/:id/files`
- `POST /api/admin/photos/import`
- `GET /api/admin/import-jobs`
- `GET /api/admin/import-jobs/:id`
- `POST /api/admin/photos/batch/visibility`
- `POST /api/admin/photos/batch/delete`
- `POST /api/admin/photos/batch/restore`
- `POST /api/admin/photos/batch/purge`
- `POST /api/admin/photos/batch/gps`
- `GET /api/admin/geocode/search?q=...`

## 运行方式 | Run Locally

### 开发环境 | Development

前置要求：  
Prerequisites:

- Node.js `22.x`
- npm `10+`

建议先执行：  
Recommended first steps:

```bash
nvm use
cp .env.example .env
npm run db:bootstrap
```

服务端和回填脚本会自动读取项目根目录下的 `.env`，无需先手动 `source .env`。  
The backend server and backfill scripts automatically load the project-root `.env`; manual `source .env` is not required.

如果本机没有全局 Node，也可以使用仓库内本地运行时：  
If you do not have a global Node installation, you can also use the local runtime in the repo:

```bash
./scripts/with-local-node.sh npm install
./scripts/with-local-node.sh npm run db:bootstrap
./scripts/with-local-node.sh npm run dev
```

常规启动方式：  
Standard local startup:

```bash
npm install
npm run db:bootstrap
npm run dev
```

可选环境变量（用于自动生成地点简介）：  
Optional environment variables for automatic location intros:

- `NARRATIVE_API_BASE_URL`
- `NARRATIVE_API_KEY`
- `NARRATIVE_MODEL`

默认地址：  
Default addresses:

- 前端：`http://localhost:5173`  
  Frontend: `http://localhost:5173`
- 服务端：`http://localhost:8787`  
  Server: `http://localhost:8787`

### 生产构建 | Production Build

```bash
npm run build
npm start
```

### 本地验证 | Local Verification

最小本地验证流程：  
Minimal verification flow:

```bash
npm run verify
npm run dev
npm run narrative:backfill
```

如果你使用仓库内本地 Node：  
If you are using the repo-local Node runtime:

```bash
./scripts/with-local-node.sh npm run verify
./scripts/with-local-node.sh npm run dev
./scripts/with-local-node.sh npm run narrative:backfill
```

验证点：  
Verification checklist:

- 打开 `http://localhost:5173`，前台应能看到地球和已发布照片点位  
  Open `http://localhost:5173` and confirm the public globe renders with published photos
- 打开 `http://localhost:5173/admin/login`，使用 `.env` 里的 `ADMIN_PASSWORD` 登录 CMS  
  Open `http://localhost:5173/admin/login` and sign in with `ADMIN_PASSWORD` from `.env`
- 在后台给一张无 GPS 图片补点，确认会自动接入对应照片组的共享简介  
  Add GPS to a photo that was missing coordinates and confirm it joins the expected photo group and receives that group's shared intro

## 服务器部署 | Deployment

推荐当前项目采用单机部署：  
This project is currently best deployed as a single-server application:

- `Node.js 22.x`
- `SQLite`
- 本地磁盘保存 `data/` 和 `storage/`  
  Local disk persistence for `data/` and `storage/`
- `systemd` 托管 Node 进程  
  `systemd` for process management
- `nginx` 反向代理到应用端口  
  `nginx` as a reverse proxy

适合当前项目的服务器规格：  
Recommended server size for the current project:

- `2 vCPU`
- `8 GB RAM`
- Linux 单机环境，例如 `OpenCloudOS 9`  
  Single Linux host, for example `OpenCloudOS 9`

推荐部署流程：  
Recommended deployment flow:

1. 在 GitHub 创建空仓库，并把本地仓库推到远程  
   Create an empty GitHub repository and push the local repo to it
2. 在服务器安装 `git`、`Node.js 22.x`、`nginx`  
   Install `git`, `Node.js 22.x`, and `nginx` on the server
3. 拉取代码  
   Pull the code:

```bash
git clone <your-repo-url>
cd geophoto-globe
npm install
```

4. 配置环境变量，例如 `.env`：  
   Configure environment variables, for example `.env`:

```bash
ADMIN_PASSWORD=replace-with-a-strong-password
PORT=8787
DATABASE_PATH=/opt/geophoto-globe/data/geophoto-globe.sqlite
NODE_ENV=production
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

`VITE_GA_MEASUREMENT_ID` 由 Vite 在前端构建时读取，因此必须在 `npm run build` 之前设置；后续如果修改该值，需要重新构建并重新部署。  
`VITE_GA_MEASUREMENT_ID` is read by Vite at frontend build time, so it must be set before `npm run build`; if it changes later, rebuild and redeploy.

5. 初始化数据库并构建：  
   Bootstrap the database and build:

```bash
npm run db:bootstrap
npm run build
```

6. 启动服务：  
   Start the service:

```bash
npm start
```

推荐通过 `systemd` 长驻运行，并让 `nginx` 对外提供 `80/443`，转发到 `127.0.0.1:8787`。  
In production, run the app under `systemd` and proxy `80/443` to `127.0.0.1:8787` via `nginx`.

部署时应将以下目录视为服务器本地持久化数据，不纳入 Git：  
Treat the following as server-local persistent data and do not store them in Git:

- `data/`
- `storage/`
- `uploads/`
- `.env`

后续更新代码的推荐方式：  
Recommended update flow for later deployments:

```bash
git pull
npm install
npm run build
sudo systemctl restart geophoto-globe
```

部署注意事项：  
Deployment notes:

- 当前项目默认会公开整个 `/storage` 静态目录，因此如果不希望外部直接访问原图，建议上线前收紧 `storage/originals` 的公开访问策略  
  The app currently serves the whole `/storage` directory; if you do not want originals to be publicly reachable, tighten access to `storage/originals` before going live
- SQLite 适合当前单机部署场景，不适合直接做多实例共享写入  
  SQLite is appropriate for the current single-server setup, but not for multi-instance shared writes
- 管理后台必须配合强密码和 HTTPS 使用  
  The admin CMS should always run behind strong credentials and HTTPS

## 环境变量 | Environment Variables

参考文件：  
Reference file:

- `.env.example`

当前支持：  
Currently supported:

- `ADMIN_PASSWORD`
- `PORT`
- `DATABASE_PATH`
- `NARRATIVE_API_BASE_URL`
- `NARRATIVE_API_KEY`
- `NARRATIVE_MODEL`

当前默认值：  
Current defaults:

- 默认管理员密码：`admin123`  
  Default admin password: `admin123`
- 默认服务端端口：`8787`  
  Default server port: `8787`
- 默认前端开发端口：`5173`  
  Default frontend dev port: `5173`
- 默认 SQLite 路径：`data/geophoto-globe.sqlite`  
  Default SQLite path: `data/geophoto-globe.sqlite`

## 当前状态 | Current Status

当前代码已经完成一个可运行首版，包括：  
The current codebase already delivers a working first version, including:

- 前台 3D 地球浏览  
  Public 3D globe browsing
- 灯箱查看图片  
  Lightbox photo viewing
- 右上角可折叠信息面板  
  Collapsible top-right info panel
- 左下角调试指标面板（默认隐藏，可在后台开关，含 FPS）  
  Bottom-left debug metrics panel including FPS, hidden by default and toggleable from the admin CMS
- 后台 CMS 登录  
  Admin CMS login
- 后台 `Photos | Groups` 双视图  
  Dual `Photos | Groups` admin views
- 批量导入照片  
  Batch photo import
- 管理端上传弹窗与最小化上传悬浮条  
  Admin upload modal with a minimizable floating upload dock
- 单图编辑  
  Single-photo editing
- 单图页组侧栏、组内导航与设封面功能  
  Single-photo group sidebar, in-group navigation, and cover-photo actions
- 地址搜索坐标  
  Address geocoding
- 粘贴式坐标输入  
  Paste-friendly coordinate input
- 后台列表固定工具栏与独立滚动缩略图区  
  Sticky admin toolbar with an independently scrolling thumbnail region
- 后台紧凑工具栏、整合搜索筛选与更小尺寸操作按钮  
  Compact admin toolbar with integrated search / filters and smaller action buttons
- 后台工作队列快捷入口与可切换取消的筛选状态  
  Admin work-queue shortcuts with toggle-off behavior
- 后台照片卡片首行地点标签、截断提示与组入口文字链接  
  Admin photo cards with first-row place labels, hover-tooltips for truncated names, and text-style group links
- 批量显示 / 隐藏  
  Batch visibility updates
- 批量软删除 / 恢复 / 永久清理  
  Batch soft delete / restore / purge
- 批量 GPS 设置  
  Batch GPS updates
- 持久化照片组与组封面图  
  Persistent photo groups and group cover images
- 同组共享 AI 简介与后台手动同步  
  Shared AI intros per persisted photo group with manual sync from the admin editor
- 单列组详情编辑、拆组 / 合组、整组显隐与更小成员缩略图  
  Single-column group-detail editing, split / merge actions, whole-group visibility changes, and smaller member thumbnails
- 单图详情页返回、地理摘要显示与单组 AI 重生成功能  
  Detail-page back navigation, geo summary display, and per-group AI regeneration
- SQLite 元数据存储  
  SQLite metadata storage
- 轻量级导入任务进度与失败记录  
  Lightweight import job tracking with persisted failures
- 管理端多文件上传队列与弹窗工作流  
  Multi-file upload queue with a modal-based admin workflow
- `repository / service / db` 分层  
  `repository / service / db` layering

补充说明：  
Additional notes:

- 如果存在 `data/photos.json`，系统会在 SQLite 为空时自动做一次性导入  
  If `data/photos.json` exists, the app performs a one-time import when SQLite is empty
- 历史数据中的绝对文件路径已在服务端做兼容  
  Legacy absolute image paths are normalized on the server
- 当前还没有自动化测试框架，主要提供构建级 `npm run verify` 冒烟校验  
  There is not yet a full automated test suite; current verification is mainly a build-level smoke check via `npm run verify`

## 已知简化点 | Current Simplifications

- 只支持单管理员  
  Single-admin only
- 导入任务当前仍在服务进程内执行，不是独立后台队列  
  Import jobs still execute in-process rather than in a separate worker
- 前端上传队列当前固定并发为 `2`  
  Frontend upload concurrency is currently fixed at `2`
- 还没有回收站独立页面  
  No dedicated recycle-bin page yet
- 组筛选和工作队列目前仍是轻量级列表过滤，不是完整任务面板  
  Group filters and work queues are still lightweight list filters rather than a full task dashboard
- 还没有地理编码缓存与限流队列  
  No geocoding cache or rate-limit queue yet
- 还没有 2D 降级浏览页  
  No 2D fallback viewer yet

## 后续建议 | Recommended Next Steps

1. 前台和 CMS 做动态拆包，减小前端首包体积  
   Add code-splitting to reduce the frontend bundle size
2. 给地理编码增加缓存、限流和失败重试  
   Add geocoding cache, rate limiting, and retry behavior
3. 把批量 GPS 进一步打磨成完整工作流界面  
   Turn batch GPS editing into a more polished workflow
4. 增加无 WebGL 时的 2D 降级浏览页  
   Add a 2D fallback viewer for browsers without WebGL
5. 将当前进程内导入任务升级为可替换的后台队列执行器  
   Upgrade the in-process import executor into a replaceable background job runner
6. 给失败文件增加正式重试按钮和更细的导入历史页面  
   Add retry controls and a richer import history view
7. 继续抽离共享后台能力，为未来小程序管理端复用服务层  
   Continue extracting reusable backend logic for a future mini-program admin client
