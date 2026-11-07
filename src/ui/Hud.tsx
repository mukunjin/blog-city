import type { CatalogStats } from "../../shared/blogs";

interface HudProps {
  stats: CatalogStats;
  onDirectory: () => void;
  onRandom: () => void;
  onAbout: () => void;
  onHelp: () => void;
}

const fmt = (n: number) => n.toLocaleString("en-US");

export default function Hud({ stats, onDirectory, onRandom, onAbout, onHelp }: HudProps) {
  return (
    <>
      <header className="brand">
        <div className="brand-mark">
          <span className="brand-cn">博客之城</span>
          <span className="brand-en">BLOG CITY</span>
        </div>
        <p className="brand-meta">
          <strong>{fmt(stats.total)}</strong> 座大厦 · <strong>{fmt(stats.dead)}</strong> 座疑似废弃
        </p>
      </header>

      <div className="top-actions">
        <button className="btn" onClick={onDirectory}>
          搜索
        </button>
        <button className="btn" onClick={onRandom}>
          随机
        </button>
        <button className="btn" onClick={onAbout}>
          关于
        </button>
        <button className="btn" onClick={onHelp} aria-label="操作说明">
          操作
        </button>
      </div>

      <p className="hint">
        左键平移 · 右键旋转 · 滚轮缩放 · 点击大厦 · <kbd>R</kbd> 随机 · <kbd>?</kbd> 操作
      </p>
    </>
  );
}
