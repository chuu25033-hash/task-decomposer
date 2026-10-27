// 操作ボタン用のアイコン（色は currentColor なので、ボタン側の text-* / hover:text-* がそのまま効く）
// ✕ は「閉じる」専用にし、削除はゴミ箱で区別する

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const EditIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg {...base} className={className}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

export const TrashIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg {...base} className={className}>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v5M14 11v5" />
  </svg>
);

export const CheckIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg {...base} className={className}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
