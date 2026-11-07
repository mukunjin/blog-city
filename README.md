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
占地     = 0.58 + 0.12 × breadth + 0.06 × j   // 乘以地块可用边长
窗列数   = max(2, round(占地边长 ÷ 2.7))

// 疑似失效的楼
楼高     = 9 + 13 · j
亮窗比例 = 0.015 + 0.02 · j
```

### 摆在哪

没有网格。楼是一颗颗撒在地面上的：按 `fresh` 从高到低，每栋楼取一个「以市中心为圆心的半径环」
（`r = R · √(i / n)`，保证面积上均匀）+ 随机角度，然后用 AABB + 空间哈希做拒绝采样，
撞到已有的楼就换个角度重试；连续撞到 55% 的尝试次数后开始允许它往外圈滑。

结果：最新的博客密集在市中心，久未更新的自然漂到边缘；没有两栋楼重叠，也没有一条对齐的街道。

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
