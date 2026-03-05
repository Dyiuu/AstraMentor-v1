import { useCallback } from 'react';

interface SteppedSliderProps {
  /** 当前值（从 1 开始的整数） */
  value: number;
  /** 值变化回调 */
  onChange: (value: number) => void;
  /** 各档位标签数组，长度决定总步数 */
  steps: string[];
  /** 禁用状态 */
  disabled?: boolean;
}

/**
 * 分段滑块组件
 * NOTE: 使用原生 range input 实现离散档位选择，
 * 下方均匀分布档位标签，高亮当前选中项
 */
export function SteppedSlider({ value, onChange, steps, disabled = false }: SteppedSliderProps) {
  const max = steps.length;
  const percentage = ((value - 1) / (max - 1)) * 100;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value));
    },
    [onChange]
  );

  return (
    <div className="w-full space-y-2">
      {/* 滑块轨道 */}
      <div className="relative w-full h-6 flex items-center">
        {/* 背景轨道 */}
        <div className="absolute w-full h-1.5 rounded-full bg-muted" />
        {/* 高亮填充轨道 */}
        <div
          className="absolute h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-200"
          style={{ width: `${percentage}%` }}
        />
        {/* 分段刻度点 */}
        {steps.map((_, i) => {
          const left = (i / (max - 1)) * 100;
          const isActive = i + 1 <= value;
          return (
            <div
              key={i}
              className={`absolute w-2.5 h-2.5 rounded-full border-2 transition-colors duration-200 ${
                isActive
                  ? 'bg-blue-500 border-blue-500'
                  : 'bg-background border-muted-foreground/30'
              }`}
              style={{ left: `${left}%`, transform: 'translateX(-50%)' }}
            />
          );
        })}
        {/* 原生 range input（透明叠加层，负责交互） */}
        <input
          type="range"
          min={1}
          max={max}
          step={1}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          className="absolute w-full h-6 opacity-0 cursor-pointer disabled:cursor-not-allowed"
          style={{ zIndex: 10 }}
        />
        {/* 自定义拖动手柄 */}
        <div
          className={`absolute w-5 h-5 rounded-full shadow-md border-2 transition-all duration-200 pointer-events-none ${
            disabled
              ? 'bg-muted border-muted-foreground/30'
              : 'bg-white border-blue-500 shadow-blue-500/25'
          }`}
          style={{ left: `${percentage}%`, transform: 'translateX(-50%)' }}
        />
      </div>

      {/* 档位标签 */}
      <div className="flex justify-between px-0">
        {steps.map((label, i) => {
          const isSelected = i + 1 === value;
          return (
            <span
              key={i}
              className={`text-xs transition-colors duration-200 select-none ${
                isSelected
                  ? 'text-blue-500 font-semibold'
                  : 'text-muted-foreground'
              }`}
            >
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
