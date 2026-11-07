import type { CatalogStats } from "../../shared/blogs";
import { usePresence } from "../lib/usePresence";

interface AboutProps {
  open: boolean;
  onClose: () => void;
  stats: CatalogStats;
  generatedAt: string;
}

export default function About({ open, onClose, stats, generatedAt }: AboutProps) {
  const { mounted, shown } = usePresence(open, 240);
  if (!mounted) return null;
  const date = generatedAt ? new Date(generatedAt) : null;

  return (
    <div className={`modal${shown ? " is-open" : ""}`} role="dialog" aria-label="关于这座城">
      <div className="modal-card">
        <div className="drawer-head">
          <div>
            <h2>关于这座城</h2>
            <p>一张 CSV，变成一座可以飞的城</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <h3>它是什么</h3>
          <p>
            「博客之城」把 <code>chinese-independent-blogs</code> 收录的中文独立博客，变成一座 3D 像素城市：
            每个博客是一栋楼，越靠近城市中心越活跃，外围是久未更新的角落。
          </p>

          <h3>活跃度从哪来</h3>
          <p>
            不爬任何人的站点。列表仓库的 Worker 每小时检测一遍 RSS（<code>cron 7 * * * *</code>，把最新文章写进数据库），
            每天 00:00 UTC 由 GitHub Actions 把结果重新渲染进 README（<code>.github/workflows/updateInfo.yml</code>）。
            那份表格是<b>按最近一篇文章的发布时间排序</b>的，城市直接读这个顺序：
          </p>
          <pre className="formula">{`fresh = 1 − (在 README 活跃列表里的名次 ÷ 活跃博客总数)
        → 最新的博客 = 1，最久没更新的 = 0`}</pre>
          <p className="muted">
            连续抓取失败（404、证书错误、连不上、不是 RSS）并被移进「疑似失效」小节的博客，记作 dead，
            楼矮且几乎全黑；卡片里会显示抓取失败的原因。
          </p>

          <h3>楼的尺寸怎么算</h3>
          <pre className="formula">{`breadth = min(标签数, 8) ÷ 8              // 兴趣广度
j       = 由 blog.id 哈希得到的 0~1 定值    // 同一个博客永远同一栋楼

score   = 0.60 · fresh^0.5
        + 0.26 · breadth^0.65
        + 0.14 · j

楼高    = 14 + 200 × score                  // 14 ~ 214
楼层数  = round(楼高 ÷ 3.2)
亮窗比例 = 0.08 + 0.80 × fresh^0.75
占地    = 0.58 + 0.12 × breadth + 0.06 × j  // 乘以地块可用边长
窗列数  = max(2, round(占地边长 ÷ 2.7))

// 疑似失效
楼高    = 9 + 13 × j
亮窗比例 = 0.015 + 0.02 × j`}</pre>
          <p className="muted">
            楼高、亮窗、占地都只由上面这些量决定，没有运行时随机：刷新页面、换设备，城市长得一模一样。
          </p>

          <h3>怎么加新博客</h3>
          <p>
            往 <code>chinese-independent-blogs/blogs-original.csv</code> 尾部加一行
            <code>名称, 网址, RSS, 标签</code>（长期做法是给上游仓库提 PR），然后在本项目跑：
          </p>
          <p className="muted">
            <code>npm run data</code> 重新读取 CSV + README 生成城市数据 → <code>npm run deploy</code> 发布。
            想跳过本地克隆直接用线上最新名单：<code>npm run data -- --remote</code>。
          </p>

          <h3>数据</h3>
          <p>
            名单来自{" "}
            <a href="https://github.com/timqian/chinese-independent-blogs" target="_blank" rel="noreferrer noopener">
              timqian/chinese-independent-blogs
            </a>
            ，当前快照 {stats.total.toLocaleString("en-US")} 个博客、{stats.dead} 个疑似失效。
            {date ? `生成于 ${date.toLocaleString("zh-CN", { hour12: false })}。` : ""}
            数量随上游名单每天变化，这里的数字都是读数据算出来的，没有写死。
          </p>

          <h3>技术</h3>
          <p>
            React · three.js（全城一次 draw call 的实例化楼体，窗户由 shader 程序化绘制）· Vite ·
            部署在 Cloudflare Workers 静态资源上，没有数据库。
          </p>
        </div>
      </div>
      <button className="drawer-backdrop" onClick={onClose} aria-label="关闭" />
    </div>
  );
}
