# 博客之城 · Blog City

把[中文独立博客列表](https://github.com/timqian/chinese-independent-blogs)变成一座 3D 像素城市：
**每个博客是一栋楼**，越活跃楼越高、灯越亮，久未更新的缩在城郊。

站点只吃静态资源，直接跑在 **Cloudflare Workers（静态资源）** 上，没有数据库、没有服务端。

---

## 本地跑起来

```bash
npm install
npm run dev          # http://localhost:3210
```

## 数据从哪来

城市不读数据库，也没有任何实时抓取。所有信息都来自那个仓库的两个文件：

| 文件 | 提供什么 |
| --- | --- |
| `blogs-original.csv` | 名单本体：名称、网址、RSS、标签 |
| `README.md` | 活跃度：表格按最近发文时间排序；「疑似失效」小节给出失败原因 |

`npm run data` 把两者读成 `src/data/blogs.json`（博客数量随上游名单变化，不在代码里写死）：

```bash
npm run data              # 读同级目录的 chinese-independent-blogs 克隆（含它的 README）
npm run sync              # 直接从 GitHub 拉最新的 blogs-original.csv + README.md
```

数据是**构建时打进包里**的：同步完要重新 `npm run build` 才会有新城市。

抓取的节奏（已核对上游仓库）：

- **每小时**：`frontend/worker` 的 cron（`wrangler.jsonc` 里 `7 * * * *`）检测到期的 RSS，写进 D1；
- **每天**：GitHub Actions（`.github/workflows/updateInfo.yml`，`cron: 0 0 * * *`）跑 `scripts/render-readme.mjs`，
  把检测结果重新渲染进 README 并提交。

所以「README 的顺序 = 最近发文时间」这件事是上游保证的，城市只是消费它。

## 计算公式

所有数值都在生成数据时算好写进 JSON，前端不再随机；刷新页面、换设备，城市长得一模一样。

### 活跃度

```
fresh = 1 − (在 README 活跃列表中的名次 ÷ 活跃博客总数)
```

名次 0 的博客 `fresh = 1`，最久没更新的趋近 0；出现在「疑似失效」小节的记 `dead = true`、`fresh = 0`。

### 楼

```
breadth = min(标签数, 8) ÷ 8                 // 兴趣广度
j       = 由 blog.id 哈希得到的 0~1 定值      // 同一个博客永远同一栋楼

score   = 0.60 · fresh^0.5
        + 0.26 · breadth^0.65
        + 0.14 · j

楼高     = 14 + 200 × score                   // 14 ~ 214
楼层数   = round(楼高 ÷ 3.2)
亮窗比例 = 0.08 + 0.80 · fresh^0.75
楼宽     = 7.6 + 3.8 × breadth + 1.8 × j      // 约 8 ~ 13
楼深     = 楼宽 × (0.90 + 0.22 × j₂)
窗列数   = max(2, round(楼宽 ÷ 2.7))

// 疑似失效的楼
楼高     = 9 + 13 · j
亮窗比例 = 0.015 + 0.02 · j
```

### 摆在哪

没有网格。城市先由**路网**定形：从市中心放射出 8 条大道，外侧套 3 环（半径 = 0.34 / 0.62 / 0.88 × R）。
楼是一颗颗撒在道路之间的：按 `fresh` 从高到低，每栋楼取一个「以市中心为圆心的半径环」
（`r = R · √(i / n)`，保证面积上均匀）+ 随机角度，然后用 AABB + 空间哈希做拒绝采样，
撞到别的楼、或离路面太近就换个角度重试；连续撞到 55% 的尝试次数后，才允许它往外圈滑。

结果：最新的博客密集在市中心，久未更新的自然漂到边缘；没有两栋楼重叠，也没有一条对齐的街道，
但大道和环路把城市串成了一个整体。

### 市中心

中间是一片半径 96 的圆盘：外圈是环形车道，里面是绿岛，岛上立着 BLOG / CITY 两行像素字
（5×7 位图字体，每个亮点是一个盒子，两组正交摆放，四面都能读）。楼和树都不许进这个圈
（树让到半径 126 外，楼让到 127 外），所以转盘四周是一圈真正的空地。

大道上停着约 180 辆小车：车身、车厢、前后灯、四个轮子，共 8 个盒子拼成一辆，
全部烘焙进**一个 InstancedMesh**，构建时算一次，之后完全静止、零每帧开销。
一条车道朝外、一条朝内，间距是随机的，所以会自然地聚成车流，而不是均匀排队。

### 树

两遍：先沿每条大道两侧、每条环路内外侧种行道树（间距 ~9.5），再在空地里撒一些零散的。
种之前逐个检查，落在路面上、压到楼的地基上、或离另一棵树太近（< 15.5）的都丢掉。
当前约 1.4k 棵，分阔叶和针叶两种，树干 / 阔叶 / 针叶各一个 InstancedMesh。

## 部署到 Cloudflare Workers

```bash
npx wrangler login    # 一次性
npm run deploy        # = vite build && wrangler deploy
```

首次部署会得到 `https://blog-city.<你的子域>.workers.dev`。
绑自定义域名就往 `wrangler.jsonc` 里加一条 routes：

```jsonc
"routes": [{ "pattern": "city.example.com", "custom_domain": true }]
```

`npm run deploy:dry` 可以先本地 dry-run 打包，不上传。
想从 CI 部署，在 GitHub Secrets 里放 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`，然后跑 `npx wrangler deploy`。

## 添加新博客

1. 往 `chinese-independent-blogs/blogs-original.csv` 尾部加一行：`名称, 网址, RSS, 标签`
   （长期做法是给上游仓库提 PR，让所有人都有这栋楼）；
2. `npm run data` 重新生成城市数据；
3. `npm run deploy` 发布。

还没进 README 的新博客会按「最新收录」处理，先给一个偏高的活跃度；等上游把 README 同步之后，位置就按真实发文时间落定。

## 代码结构

```
shared/blogs.mjs        CSV + README 解析、快照构建（Node 与浏览器通用）
scripts/build-blogs.mjs 生成 src/data/blogs.json
src/lib/metrics.ts      楼的视觉编码（高度 / 亮窗 / 占地）
src/lib/layout.ts       城市平面：方格路网 → 中心向外分配地块 → 落楼
src/scene/Buildings.tsx 全城一次 draw call 的实例化楼体，窗户由 shader 程序化绘制
src/scene/Backdrop.tsx  天空、星空、月亮、统一色的地面与环城路
src/ui/                 HUD、搜索目录、博客详情、关于
wrangler.jsonc          Workers 静态资源配置
```

## 数据与致谢

- 名单来自 [timqian/chinese-independent-blogs](https://github.com/timqian/chinese-independent-blogs)（ISC）。
- 3D 城市的玩法参考了 [srizzon/git-city](https://github.com/srizzon/git-city)（AGPL-3.0）——本项目代码为独立实现，未复制其源码。
- 楼体、天空、地面均为自制 shader，无第三方美术资源。
