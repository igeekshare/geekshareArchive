"use client";

import React, { useState, forwardRef } from "react";
import Link from "next/link";

interface Reaction {
  emoji: string;
  count: string;
}

interface Media {
  type: "photo" | "video" | "file";
  url: string;
  thumb?: string;
  width?: string;
  height?: string;
  title?: string;
  description?: string;
}

interface MessageProps {
  id: string;
  date: string;
  from: string;
  text: string;
  media?: Media | null;
  replyTo?: string | null;
  reactions?: Reaction[] | null;
  onScrollToReply?: (replyId: string) => void;
}

const MessageCard = forwardRef<HTMLDivElement, MessageProps>(
  (
    { id, date, from, text, media, replyTo, reactions, onScrollToReply },
    ref,
  ) => {
    const [isImageOpen, setIsImageOpen] = useState(false);

    // Time mapping: Parse Telegram date format "09.05.2022 16:36:05 UTC+08:00"
    let formattedDate = date;
    let formattedTime = "";
    try {
      const parts = date.split(" ");
      if (parts.length >= 2) {
        const [d, m, y] = parts[0].split(".");
        const time = parts[1].substring(0, 5); // Extract HH:mm
        formattedDate = `${y}年${m}月${d}日`;
        formattedTime = time;
      }
    } catch (e) {
      // Fallback to original string if parsing fails
    }

    // Render media components (Photos, Videos, Files)
    const renderMedia = () => {
      if (!media) return null;

      if (media.type === "photo") {
        return (
          <>
            <div
              className="relative cursor-zoom-in overflow-hidden rounded-xl bg-gray-100 dark:bg-zinc-800/50 mt-3 border border-gray-200 dark:border-zinc-800 transition-opacity hover:opacity-95"
              onClick={() => setIsImageOpen(true)}
            >
              <img
                src={`/${media.thumb || media.url}`}
                alt="Message Photo"
                className="max-w-full max-h-[400px] w-auto h-auto object-contain mx-auto"
                loading="lazy"
              />
            </div>

            {/* Simple Lightbox */}
            {isImageOpen && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 sm:p-8 cursor-zoom-out animate-in fade-in duration-200"
                onClick={() => setIsImageOpen(false)}
              >
                <img
                  src={`/${media.url}`}
                  alt="Enlarged Photo"
                  className="max-w-full max-h-full object-contain drop-shadow-2xl rounded-md"
                />
              </div>
            )}
          </>
        );
      }

      if (media.type === "video") {
        return (
          <div className="mt-3 relative rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center group border border-gray-200 dark:border-zinc-800">
            {media.thumb && (
              <img
                src={`/${media.thumb}`}
                alt="Video Thumbnail"
                className="absolute inset-0 w-full h-full object-cover opacity-50"
              />
            )}
            <a
              href={`/${media.url}`}
              target="_blank"
              rel="noreferrer"
              className="relative z-10 flex flex-col items-center gap-2 transform transition group-hover:scale-110"
            >
              <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center shadow-lg border border-white/30 text-white">
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-6 h-6 ml-1"
                >
                  <path d="M5.536 21.886a1.004 1.004 0 001.033-.064l13-9a1 1 0 000-1.644l-13-9A1 1 0 005 3v18a1 1 0 00.536.886z" />
                </svg>
              </div>
            </a>
          </div>
        );
      }

      if (media.type === "file") {
        return (
          <a href={`/${media.url}`} download className="mt-3 block group">
            <div className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/30 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors">
              <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <svg
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-6 h-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate text-gray-900 dark:text-gray-100">
                  {media.title || "下载附件"}
                </p>
                {media.description && (
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {media.description}
                  </p>
                )}
              </div>
              <div className="text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                <svg
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
              </div>
            </div>
          </a>
        );
      }

      return null;
    };

    const initial = from ? from.charAt(0) : "?";
    const numericId = id.replace("message", "");

    return (
      <div
        id={id}
        ref={ref}
        className="flex gap-4 p-5 sm:p-6 bg-white dark:bg-zinc-900/80 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 transition-all hover:shadow-md group"
      >
        {/* Sender Avatar */}
        <div className="shrink-0 pt-1">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
            {initial}
          </div>
        </div>

        {/* Message Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4 mb-1.5">
            <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm sm:text-base truncate">
              {from}
            </h3>
            <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500 shrink-0">
              <span title={date} className="font-medium tracking-wide">
                {formattedDate} {formattedTime}
              </span>
              <Link
                href={`/message/${id}`}
                className="opacity-0 group-hover:opacity-100 hover:text-blue-500 transition-opacity font-mono"
              >
                #{numericId}
              </Link>
            </div>
          </div>

          {/* Reply Context */}
          {replyTo && (
            <div
              className="mb-3 pl-3 py-2 border-l-2 border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20 rounded-r-md text-sm text-zinc-600 dark:text-zinc-400 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
              onClick={() => {
                if (onScrollToReply) {
                  onScrollToReply(replyTo);
                }
              }}
            >
              <span className="text-blue-700 dark:text-blue-400 text-xs font-semibold block mb-0.5">
                回复了消息
              </span>
              <span className="truncate pr-2 block italic text-[13px]">
                点击向上滚动查看原消息
              </span>
            </div>
          )}

          {/* Text Content with Tags Styling */}
          {text && (
            <div
              className="text-[15px] sm:text-base leading-relaxed break-words text-zinc-800 dark:text-zinc-200
                         prose-p:mb-2 prose-p:last:mb-0
                         [&_a]:break-all [&_a]:text-blue-600 [&_a]:dark:text-blue-400 [&_a]:bg-blue-50 [&_a]:dark:bg-blue-900/30 [&_a]:px-1.5 [&_a]:py-0.5 [&_a]:rounded-md [&_a]:no-underline hover:[&_a]:bg-blue-100 hover:[&_a]:dark:bg-blue-900/50 [&_a]:transition-colors [&_a]:font-medium"
              dangerouslySetInnerHTML={{
                __html: text.replace(
                  /(^|\s|>)#([A-Za-z0-9_\u4e00-\u9fa5]+)/g,
                  '$1<span class="inline-block bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-md text-sm font-medium mr-1 cursor-pointer transition-colors hover:bg-blue-100 dark:hover:bg-blue-900/50 active:scale-95" title="点击过滤此标签">#$2</span>',
                ),
              }}
            />
          )}

          {renderMedia()}

          {/* Reactions */}
          {reactions && reactions.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3.5">
              {reactions.map((r, i) => (
                <div
                  key={i}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/50 text-[13px] hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors cursor-default shadow-sm"
                >
                  <span>{r.emoji}</span>
                  <span className="text-zinc-600 dark:text-zinc-400 font-semibold">
                    {r.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  },
);

MessageCard.displayName = "MessageCard";

export default MessageCard;
