"use client";

import { useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";

type MessageLightboxProps = {
  slides: Array<{ src: string; alt: string }>;
  initialIndex: number;
  onClose: () => void;
};

export default function MessageLightbox({ slides, initialIndex, onClose }: MessageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const multiple = slides.length > 1;

  return (
    <Lightbox
      open
      close={onClose}
      index={currentIndex}
      slides={slides}
      plugins={[Zoom]}
      on={{ view: ({ index }) => setCurrentIndex(index) }}
      labels={{
        Previous: "上一张",
        Next: "下一张",
        Close: "关闭图片查看",
        Slide: "图片",
        Carousel: "图片浏览器",
        Lightbox: "查看内容图片",
        "Photo gallery": "内容图片",
        "{index} of {total}": "第 {index} 张，共 {total} 张",
        "Zoom in": "放大",
        "Zoom out": "缩小",
      }}
      animation={{ fade: 180, swipe: 260 }}
      carousel={{ finite: true, padding: 16 }}
      controller={{ closeOnBackdropClick: true, closeOnPullDown: true }}
      render={{
        buttonPrev: multiple ? undefined : () => null,
        buttonNext: multiple ? undefined : () => null,
        controls: multiple
          ? () => (
              <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center px-4">
                <span className="rounded-full bg-black/65 px-3 py-1.5 text-xs font-medium tabular-nums text-white shadow-sm backdrop-blur-sm">
                  {currentIndex + 1} / {slides.length}
                </span>
              </div>
            )
          : undefined,
      }}
      styles={{
        container: { backgroundColor: "hsl(222 30% 7% / 0.96)" },
        button: { filter: "drop-shadow(0 1px 2px rgb(0 0 0 / 0.45))" },
      }}
    />
  );
}
