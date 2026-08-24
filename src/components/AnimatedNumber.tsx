"use client";

import NumberFlow from "@number-flow/react";
import { useEffect, useState } from "react";

type AnimatedNumberProps = {
  value: number;
  className?: string;
};

const numberTiming: EffectTiming = {
  duration: 220,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
};

export default function AnimatedNumber({ value, className }: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setDisplayValue(value));
    return () => window.cancelAnimationFrame(frame);
  }, [value]);

  return (
    <NumberFlow
      className={className}
      value={displayValue}
      locales="zh-CN"
      format={{ useGrouping: true, maximumFractionDigits: 0 }}
      trend={0}
      transformTiming={numberTiming}
      spinTiming={numberTiming}
      opacityTiming={{ duration: 140, easing: "ease-out" }}
      respectMotionPreference
    />
  );
}
