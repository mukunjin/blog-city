import { usePresence } from "../lib/usePresence";

interface HelpProps {
  open: boolean;
  onClose: () => void;
}

const CONTROLS: [string, string][] = [
  ["左键拖动", "平移城市。旋转中心跟着你走，不会永远锁在城中心"],
  ["右键拖动", "绕当前位置旋转 / 俯仰"],
  ["滚轮", "朝鼠标位置缩放（指针在哪就推近哪里）"],
  ["触屏 · 单指", "平移"],
  ["触屏 · 双指", "缩放 + 旋转"],
  ["方向键", "平移（和左键拖动一样）"],
  ["点大厦", "飞过去，右侧打开它的卡片"],
  ["点空白 / Esc", "收起卡片，并把旋转中心交还城中心"],
  ["R", "随机看一间"],
  ["?", "打开这张操作表"],
];

const READING: [string, string][] = [
  ["楼高", "活跃度 + 标签广度"],
  ["亮窗", "越新越亮"],
  ["楼宽", "标签越多越宽"],
  ["矮而暗", "疑似失效的博客（楼还立着）"],
  ["中心 → 外围", "最近发文 → 久未更新"],
];

export default function Help({ open, onClose }: HelpProps) {
  const { mounted, shown } = usePresence(open, 240);
  if (!mounted) return null;

  return (
    <div className={`modal${shown ? " is-open" : ""}`} role="dialog" aria-label="操作说明">
      <div className="modal-card">
        <div className="drawer-head">
          <div>
            <h2>怎么逛这座城</h2>
            <p>相机是地图式的：平移、旋转、缩放各自独立</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <h3>视角</h3>
          <dl className="keys">
            {CONTROLS.map(([key, desc]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{desc}</dd>
              </div>
            ))}
          </dl>

          <h3>怎么读一栋楼</h3>
          <dl className="keys">
            {READING.map(([key, desc]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{desc}</dd>
              </div>
            ))}
          </dl>

          <p className="muted">
            城市在你不动它的时候会自己慢慢转；任何一次拖动、缩放都会让它停下，之后不再自动转。
          </p>
        </div>
      </div>
    </div>
  );
}
