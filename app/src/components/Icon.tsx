import type { ReactNode } from 'react'

type IconName = 'map' | 'question' | 'close' | 'back' | 'play' | 'pause' | 'subtitles'

const paths: Record<IconName, ReactNode> = {
  map: (
    <>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  question: (
    <>
      <path d="M9 9a3 3 0 1 1 4.5 2.6c-.9.6-1.5 1.2-1.5 2.4" />
      <path d="M12 18h.01" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  back: <path d="M15 5l-7 7 7 7" />,
  play: <path d="M8 5v14l11-7z" />,
  pause: <path d="M9 5v14M15 5v14" />,
  subtitles: (
    <>
      <path d="M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
      <path d="M7 15h4M14 15h3M7 11h10" />
    </>
  ),
}

export default function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
