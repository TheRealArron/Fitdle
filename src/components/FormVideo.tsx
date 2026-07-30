'use client';

import { CirclePlay, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import {
  formVideoId,
  searchVideoUrl,
  videoThumbnailUrl,
  type Answer,
} from '@/data/exercises';

/**
 * Link to a curated form video, with a thumbnail pulled straight from YouTube's
 * CDN. No embed and no API key: an iframe would be blocked by the extension's
 * MV3 CSP, and an embedded player in a 600px popup is worse than a link anyway.
 *
 * If the thumbnail fails to load — offline, CDN blocked, video pulled — the
 * image is dropped and the row degrades to a plain link rather than showing a
 * broken frame. The search fallback below it can never 404.
 */
export function FormVideo({ answer }: { answer: Answer }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const id = formVideoId(answer.name);

  if (!id) {
    return (
      <a
        href={searchVideoUrl(answer.videoQuery)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-xl bg-white/5 px-4 py-3 text-sm font-semibold text-white ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/10"
      >
        <CirclePlay className="h-4 w-4" />
        Find {answer.display} form videos
      </a>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <a
        href={`https://www.youtube.com/watch?v=${id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-3 overflow-hidden rounded-xl bg-white/5 p-2 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/10"
      >
        {!thumbFailed && (
          <span className="relative block h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-black/40">
            {/* eslint-disable-next-line @next/next/no-img-element --
                next/image needs a loader and remote-host config that a static
                export cannot use; this is one small CDN image. */}
            <img
              src={videoThumbnailUrl(id)}
              alt=""
              loading="lazy"
              onError={() => setThumbFailed(true)}
              className="h-full w-full object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover:bg-black/10">
              <CirclePlay className="h-6 w-6 text-white drop-shadow" />
            </span>
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-white">
            Watch {answer.display} form
          </span>
          <span className="block truncate text-xs text-slate-400">
            Coached walkthrough on YouTube
          </span>
        </span>
        <ExternalLink className="mr-1 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
      </a>

      <a
        href={searchVideoUrl(answer.videoQuery)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-center text-xs text-slate-500 underline-offset-2 transition-colors hover:text-slate-300 hover:underline"
      >
        More {answer.display} videos
      </a>
    </div>
  );
}
