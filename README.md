# GeoPhoto Globe

一个按地理位置浏览照片的 Web 应用，包含公开前台和图片 CMS 后台。

项目目录：`/Users/dawei/Desktop/geophoto-globe`

## 项目目标

这个项目要解决两件事：

1. 提供一个公开可访问的 3D 地球前台，用户可以按地理位置浏览照片。
2. 提供一个图片 CMS 后台，管理员可以导入照片、编辑信息、补充 GPS、批量管理显示状态，并把 GPS 信息写回图片 EXIF。

核心体验不是“普通相册”，而是“按地点浏览照片库”。

## 产品方案

### 公开前台

前台首页是一个可交互的 3D 地球：

- 支持鼠标或触控交互
- 能看到海洋和陆地边界
- 有基础地势高低起伏
- 照片按经纬度映射到地球表面
- 远景下显示聚合点
- 近景下展开为单张照片缩略图
- 桌面端支持 hover 放大缩略图
- 点击照片后全屏显示大图和文字介绍

用户浏览逻辑：

1. 进入地球页面
2. 旋转、缩放地球
3. 远景看区域聚合
4. 拉近后看单张照片缩略图
5. 点击某张照片进入全屏灯箱
6. 查看图片、介绍、拍摄时间、地点信息

### 图片 CMS 后台

后台是单管理员使用的管理系统，负责维护整个照片库。

后台需要具备：

- 图片列表页
- 缩略图展示
- 图片详情编辑页
- 无 GPS 照片筛选
- 手动设置 GPS
- 根据地址联网搜索经纬度
- 将 GPS 写入图片 EXIF
- 批量删除
- 批量恢复
- 批量显示 / 隐藏
- 批量设置 GPS

管理员操作逻辑：

1. 登录 CMS
2. 批量导入照片
3. 查看缩略图列表
4. 点击缩略图进入单图编辑
5. 编辑标题、介绍、地点标签
6. 对无 GPS 图片手动补点
7. 输入地址搜索坐标并确认写入
8. 进行批量显示 / 隐藏、批量删除、批量 GPS 设置

## 技术方案

### 前端

- `React`
- `Vite`
- `React Router`
- `React Three Fiber`
- `@react-three/drei`
- `Three.js`

选这个方案的原因：

- 适合完整 Web 应用，而不只是 3D 演示页
- 前台 3D 地球和后台 CMS 可以放在一个工程里维护
- 方便后续继续扩展筛选、搜索、时间轴、标签、更多详情页

### 后端

- `Node.js`
- `Express`
- `SQLite`
- `multer` 处理上传
- `sharp` 生成缩略图和展示图
- `exifr` 读取 EXIF
- `exiftool-vendored` 写回 EXIF

### 数据存储

当前实现使用本地 SQLite 保存照片元数据和导入任务：

- `data/geophoto-globe.sqlite`

兼容首版历史数据：

- 如果存在旧的 `data/photos.json`，服务启动或执行数据库引导脚本时会在数据库为空时自动执行一次性导入

图片资源分目录保存：

- `storage/originals`
- `storage/managed`
- `storage/thumbs`
- `storage/display`

设计原则：

- 原图保留不改动
- 系统只修改托管副本
- 缩略图和展示图独立生成
- 元数据和导入任务统一落到 SQLite，便于后续同时服务 Web CMS 和小程序后台

### 地理编码服务

首版使用：

- `OpenStreetMap / Nominatim`

用途：

- 根据管理员输入的地址搜索候选坐标
- 选定后写入数据库和 EXIF

## 数据模型

每张照片至少包含以下字段：

- `id`
- `originalAssetPath`
- `managedAssetPath`
- `thumbnailUrl`
- `displayImageUrl`
- `title`
- `description`
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

状态约束：

- `visibilityStatus` 只有 `visible` 和 `hidden`
- 删除采用软删除，用 `deletedAt` 标记
- 前台只显示：
  - `visible`
  - `deletedAt = null`
  - `hasGeo = true`

## 前台交互策略

### 桌面端

- 鼠标拖拽旋转地球
- 滚轮缩放
- hover 缩略图放大
- 点击打开照片灯箱
- 使用更高的渲染密度和更多展开图片数量

### 移动端

- 单指旋转
- 双指缩放
- 不依赖 hover
- 点击选中图片
- 降低纹理精度和同时显示的图片数量

### 设备判断策略

设备策略不是只看 UA，而是组合判断：

- `pointer: coarse/fine`
- 屏幕尺寸
- 浏览器能力
- 可用内存信号

### 性能优先原则

前端必须以流畅度为第一优先级。

具体策略：

- 地球使用低精度球体
- 远景只显示聚合点
- 近景才展开缩略图
- 单次展开图片数量有限制
- 大图只在灯箱打开时加载
- 移动端降低渲染预算
- WebGL 不可用时可继续补 2D 降级方案

## 图片导入与处理流程

管理员上传照片后，服务端按以下流程处理：

1. 管理端先创建一个批量导入 job
2. 前端把选中的文件放入本地上传队列
3. 前端按小并发逐个把文件上传到该 job
4. 每个文件进入独立的导入处理流程：
   - 保存原始文件到 `storage/originals`
   - 复制一份托管副本到 `storage/managed`
   - 读取 EXIF 信息
   - 提取拍摄时间、GPS、海拔等元数据
   - 生成缩略图到 `storage/thumbs`
   - 生成展示图到 `storage/display`
   - 将照片元数据写入 SQLite
5. 服务端持续更新 job 和 job item 的状态、成功数、失败数和错误信息

如果图片没有 GPS：

- 照片仍然导入
- 后台可见
- 前台不显示

## GPS 编辑方案

### 单张编辑

管理员在图片编辑页可：

- 直接输入经纬度
- 输入地址搜索坐标
- 选定结果后保存

保存后系统会：

1. 更新数据库记录
2. 将 GPS 写入托管副本 EXIF
3. 让该图片具备前台展示资格

### 批量设置 GPS

首版批量 GPS 采用统一地点模式：

- 选中多张照片
- 输入同一组经纬度，或输入一个地址
- 系统解析后把同一地点写入所有选中照片

这是首版最稳妥的批量模式，不做逐张半自动匹配。

## CMS 功能范围

### 已规划的功能

- 管理员登录
- 图片列表
- 缩略图卡片浏览
- 搜索
- 单图编辑
- 地址搜索坐标
- GPS 写回 EXIF
- 批量显示
- 批量隐藏
- 批量软删除
- 批量恢复
- 批量 GPS 设置
- 导入照片

### 当前版本的简化点

- 只支持单管理员
- 导入任务当前仍在服务进程内顺序执行，不是独立后台队列
- 前端上传队列当前固定并发为 `2`
- 批量 GPS 用弹窗输入，尚未做完整工作流界面
- 还没有回收站独立页面
- 还没有地理编码缓存与限流队列
- 还没有 2D 降级浏览页

## API 设计

### 公开接口

- `GET /api/photos?mode=cluster|items&deviceTier=...`
- `GET /api/photos/:id`

### 后台接口

- `POST /api/admin/login`
- `GET /api/admin/photos`
- `GET /api/admin/photos/:id`
- `PATCH /api/admin/photos/:id`
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

## 运行方式

### 开发环境

前置要求：

- Node.js `22.x`
- npm `10+`

建议先执行：

```bash
nvm use
cp .env.example .env
npm run db:bootstrap
```

仓库已附带默认 `.env`，不需要改动也能本地启动；如果你要改管理员密码或端口，再编辑 `.env`。

如果本机没有全局 Node，也可以直接使用仓库内已放好的本地运行时：

```bash
./scripts/with-local-node.sh npm install
./scripts/with-local-node.sh npm run db:bootstrap
./scripts/with-local-node.sh npm run dev
```

```bash
npm install
npm run db:bootstrap
npm run dev
```

默认地址：

- 前端：`http://localhost:5173`
- 服务端：`http://localhost:8787`

### 生产构建

```bash
npm run build
npm start
```

### 本地验证

最小本地验证流程：

```bash
npm run verify
npm run dev
```

如果你走的是仓库内本地 Node，则把上面两条替换为：

```bash
./scripts/with-local-node.sh npm run verify
./scripts/with-local-node.sh npm run dev
```

验证点：

- 打开 `http://localhost:5173`
- 前台应能看到地球和已发布照片点位
- 打开 `http://localhost:5173/admin/login`
- 使用 `.env` 里的 `ADMIN_PASSWORD` 登录 CMS
- 在后台编辑已有照片 GPS 时，系统会自动兼容旧机器导出的绝对图片路径

### 环境变量

参考：

- `.env.example`

当前支持：

- `ADMIN_PASSWORD`
- `PORT`
- `DATABASE_PATH`

### SQLite 初始化与历史 JSON 迁移

- 默认数据库文件是 `data/geophoto-globe.sqlite`
- 执行 `npm run db:bootstrap` 会：
  - 创建 SQLite 文件和表结构
  - 如果数据库当前没有照片记录，并且存在旧的 `data/photos.json`，则自动导入旧数据
- 服务启动时也会执行相同的数据库引导逻辑，因此本地开发不需要手动跑迁移系统

### 导入任务机制

- 推荐导入流程：
  - `POST /api/admin/import-jobs` 创建批量任务
  - `POST /api/admin/import-jobs/:id/files` 将单个文件上传并处理到该任务下
  - `GET /api/admin/import-jobs/:id` 查询任务和每个文件的状态
- 当前管理端使用本地上传队列，固定并发 `2`
- 每个文件拥有独立状态：
  - `queued`
  - `uploading`
  - `processing`
  - `success`
  - `failed`
- 当前导入仍然在当前 Node 进程内执行，但会把进度、成功数、失败数和错误信息写入 SQLite
- 可通过以下接口查看导入状态：
  - `GET /api/admin/import-jobs`
  - `GET /api/admin/import-jobs/:id`
- 为兼容旧调用，`POST /api/admin/photos/import` 仍保留，并继续返回：
  - `jobId`
  - `job`
  - `results`
- 每个上传请求当前限制为单张图片、最大 `50MB`
- 如果服务在导入中重启，处于 `uploading` / `processing` 的文件会在下一次启动后被标记为失败，错误信息为 `Server restarted during import`

## 当前默认设置

- 默认管理员密码：`admin123`
- 默认服务端端口：`8787`
- 默认前端端口：`5173`
- 默认 SQLite 路径：`data/geophoto-globe.sqlite`
- 默认地理编码服务：`Nominatim`
- 默认删除方式：软删除
- 默认永久删除方式：管理员手动批量 purge
- 默认图片状态：`visible`
- 默认无 GPS 图片：导入但不在前台显示

## 测试与验收标准

### 前台

- 地球可旋转和缩放
- 海陆边界可见
- 地势有基础起伏
- 远景显示聚合点
- 近景展开缩略图
- 桌面端 hover 可放大
- 移动端无 hover 依赖
- 点击后灯箱正常打开
- 大图与介绍信息显示正确

### 后台

- 可登录
- 可导入照片
- 可按 job 方式分批导入多张照片
- 可看到每张照片的上传 / 处理状态与最终错误
- 可显示缩略图列表
- 可进入编辑页
- 可编辑标题和介绍
- 可编辑地点标签
- 可给无 GPS 照片补点
- 可通过地址搜索坐标
- 可批量设置 GPS
- 可批量显示 / 隐藏
- 可批量软删除和恢复

### 数据一致性

- 修改 GPS 后数据库同步更新
- 修改 GPS 后托管副本 EXIF 同步更新
- 原图不被覆盖
- 前台显示状态与后台设置保持一致

## 当前实现状态

当前代码已经完成一个可运行首版，包括：

- 前台 3D 地球浏览
- 桌面端 / 移动端差异交互
- 灯箱查看图片
- 后台 CMS 登录
- 图片导入
- 图片列表
- 单图编辑
- 地址搜索坐标
- EXIF 写回
- 批量显示 / 隐藏
- 批量软删除 / 恢复
- 批量 GPS 设置
- 本地开发环境基础配置
- SQLite 元数据存储
- 轻量级导入任务进度与失败记录
- 管理端批量上传队列与逐文件导入
- repository / service / db 分层

当前仓库状态补充说明：

- 如果存在 `data/photos.json`，系统会在 SQLite 为空时自动做一次性导入
- 历史数据中的绝对文件路径已在服务端做兼容，便于跨机器本地调试
- 还没有自动化测试框架，当前只提供构建级 `npm run verify` 冒烟校验

## 后续建议

下一步优先建议做这几项：

1. 前台和 CMS 做动态拆包，减小前端首包体积
2. 给地理编码增加缓存、限流和失败重试
3. 把批量 GPS 从 `prompt` 交互升级为正式表单弹层
4. 增加无 WebGL 时的 2D 降级浏览页
5. 将当前进程内导入任务升级为可替换的后台队列执行器
6. 给失败文件增加正式重试按钮和更细的导入历史页面
7. 继续抽离共享后台能力，为未来小程序管理端复用服务层
