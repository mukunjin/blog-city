import { useEffect, useRef, useState } from "react";
import type { CatalogStats } from "../../shared/blogs";

interface HudProps {
  stats: CatalogStats;
  onDirectory: () => void;
  onRandom: () => void;
}

const fmt = (n: number) => n.toLocaleString("en-US");

export default function Hud({ stats, onDirectory, onRandom }: HudProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // the sheet closes the way every other overlay does: click outside or Esc
  useEffect(() => {
    if (!helpOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setHelpOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHelpOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [helpOpen]);

  return (
    <>
      <header className="brand">
        <div className="brand-mark">
          <span className="brand-cn">博客之城</span>
          <span className="brand-en">BLOG CITY</span>
        </div>
        <p className="brand-meta">
          <strong>{fmt(stats.total)}</strong> 座大厦 · <strong>{fmt(stats.alive)}</strong> 仍在更新 ·{" "}
          <strong>{fmt(stats.dead)}</strong> 座疑似失效
        </p>
      </header>

      <div className="top-actions">
        <button className="btn" onClick={onDirectory}>
          搜索
        </button>
        <button className="btn" onClick={onRandom}>
          随机
        </button>
        <div className="help-wrap" ref={wrap}>
          <button
            className={`btn${helpOpen ? " is-on" : ""}`}
            onClick={() => setHelpOpen((v) => !v)}
            aria-expanded={helpOpen}
            aria-label="操作说明"
          >
            操作
          </button>
          {helpOpen && (
            <div className="help-pop" role="dialog" aria-label="操作说明">
              <p className="help-h">视角</p>
              <dl className="help-rows">
                <div>
                  <dt>左键拖动</dt>
                  <dd>旋转、俯仰</dd>
                </div>
                <div>
                  <dt>右键拖动</dt>
                  <dd>平移，旋转中心跟着走</dd>
                </div>
                <div>
                  <dt>滚轮</dt>
                  <dd>缩放</dd>
                </div>
                <div>
                  <dt>点大厦</dt>
                  <dd>飞过去，右侧看详情</dd>
                </div>
                <div>
                  <dt>点空白 / Esc</dt>
                  <dd>收起卡片，回到城市中心</dd>
                </div>
                <div>
                  <dt>R</dt>
                  <dd>随机看一间</dd>
                </div>
              </dl>

              <p className="help-h">怎么读一栋楼</p>
              <dl className="help-rows">
                <div>
                  <dt>楼高</dt>
                  <dd>最近发文越近，楼越高</dd>
                </div>
                <div>
                  <dt>亮着的窗</dt>
                  <dd>活跃度越高，灯越密</dd>
                </div>
                <div>
                  <dt>楼宽</dt>
                  <dd>标签越多越宽</dd>
                </div>
                <div>
                  <dt>矮而全黑</dt>
                  <dd>RSS 已抓不到，楼还立着</dd>
                </div>
                <div>
                  <dt>离市中心</dt>
                  <dd>越靠中心越活跃</dd>
                </div>
              </dl>

              <p className="help-foot">活跃度 = 1 / (1 + 距上次发文天数 / 90)</p>
            </div>
          )}
        </div>
      </div>

      <p className="hint">
        拖动旋转 · 滚轮缩放 · 点击大厦 · <kbd>R</kbd> 随机 · <kbd>Esc</kbd> 关闭
      </p>
    </>
  );
}
