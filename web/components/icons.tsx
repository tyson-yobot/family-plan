/**
 * A small set of calm, single-colour line icons.
 *
 * Drawn here rather than pulled from a package on purpose. This is an offline
 * installable app for five people; a font or an icon library would be a
 * download that has to succeed before a worksheet is readable, and none of
 * these shapes is worth that.
 *
 * Every icon is decorative. The words next to it always carry the meaning, so
 * each one is aria-hidden and nothing here is ever the only label.
 *
 * They are drawn in one weight and one colour so that an eleven year old and a
 * fifty three year old are looking at the same thing: warm and plain, not
 * cartoon stickers on one screen and enterprise glyphs on the next.
 */

export type IconName =
  | 'compass'
  | 'flag'
  | 'target'
  | 'wallet'
  | 'shield'
  | 'calendar'
  | 'heart'
  | 'activity'
  | 'briefcase'
  | 'book'
  | 'cloud'
  | 'house'
  | 'sun'
  | 'star'
  | 'users'
  | 'pen'
  | 'message'
  | 'check'
  | 'lock'
  | 'plus'
  | 'pencil'
  | 'trophy'
  | 'history'
  | 'clipboard'
  | 'signout';

/** The drawing for each name, on a 24 by 24 grid, stroked in the current colour. */
const PATHS: Record<IconName, React.ReactNode> = {
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5 13.6 13.6 8.5 15.5 10.4 10.4Z" />
    </>
  ),
  flag: (
    <>
      <path d="M6 21V4" />
      <path d="M6 4.5h10.5l-2 3.5 2 3.5H6" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14.5" r="1" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.2 19 6v5.5c0 4.2-2.8 7.3-7 9.3-4.2-2-7-5.1-7-9.3V6Z" />
      <path d="m9.2 12 2 2 3.6-3.8" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8.5 3v4M15.5 3v4" />
    </>
  ),
  heart: (
    <path d="M12 20.2C7.4 17.1 4 14.3 4 10.6A4.1 4.1 0 0 1 12 8.4a4.1 4.1 0 0 1 8 2.2c0 3.7-3.4 6.5-8 9.6Z" />
  ),
  activity: <path d="M3 12.5h4l2.5-6 4 13 2.5-7h5" />,
  briefcase: (
    <>
      <rect x="3" y="7.5" width="18" height="12.5" rx="2.5" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
      <path d="M3 13h18" />
    </>
  ),
  book: (
    <>
      <path d="M5 4.5h8.5A3.5 3.5 0 0 1 17 8v11.5H8.5A3.5 3.5 0 0 1 5 16Z" />
      <path d="M17 8h2v11.5h-2" />
    </>
  ),
  cloud: (
    <>
      <path d="M8 18.5a4 4 0 0 1-.4-8A5 5 0 0 1 17 11.4a3.6 3.6 0 0 1-.6 7.1Z" />
      <path d="M10.5 14.2c.6-.9 2.4-.9 3 0" />
    </>
  ),
  house: (
    <>
      <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z" />
      <path d="M9.5 20.5V14h5v6.5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.8v2.4M12 18.8v2.4M4.5 12H2.1M21.9 12h-2.4M6.7 6.7 5 5M19 19l-1.7-1.7M6.7 17.3 5 19M19 5l-1.7 1.7" />
    </>
  ),
  star: <path d="m12 3.8 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 10l5.9-.9Z" />,
  users: (
    <>
      <circle cx="9.5" cy="8.5" r="3.5" />
      <path d="M3.5 20a6 6 0 0 1 12 0" />
      <path d="M16 5.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M17.5 14.6A5.5 5.5 0 0 1 21 20" />
    </>
  ),
  pen: (
    <>
      <path d="M4 20h4L19.2 8.8a2.3 2.3 0 0 0-3.2-3.2L4.8 16.8Z" />
      <path d="m14.8 6.8 3.2 3.2" />
    </>
  ),
  message: (
    <>
      <path d="M20.5 15.5a2.5 2.5 0 0 1-2.5 2.5H8l-4.5 3.2V6.5A2.5 2.5 0 0 1 6 4h12a2.5 2.5 0 0 1 2.5 2.5Z" />
      <path d="M8 9h8M8 12.5h5" />
    </>
  ),
  check: <path d="m5 12.5 4.6 4.6L19 7.5" />,
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  pencil: (
    <>
      <path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5 4 20Z" />
      <path d="m14.5 6.5 3.5 3.5" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5.5H5.5v1.5a3 3 0 0 0 3 3M16 5.5h2.5V7a3 3 0 0 1-3 3" />
      <path d="M12 13v4M9 20h6" />
    </>
  ),
  history: (
    <>
      <path d="M4 12a8 8 0 1 0 2.6-5.9" />
      <path d="M4 4.5V9h4.5" />
      <path d="M12 8v4.5l3 1.8" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4.5" width="14" height="16" rx="2.5" />
      <path d="M9.5 4.5V3.2h5v1.3" />
      <path d="M9 11h6M9 14.5h4" />
    </>
  ),
  signout: (
    <>
      <path d="M14.5 4.5h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3" />
      <path d="M10 8.5 6 12l4 3.5M6 12h8.5" />
    </>
  ),
};

export function Icon({
  name,
  size = 20,
  className,
  strokeWidth = 1.6,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/**
 * The icon in a soft tinted circle, which is how it appears next to a question.
 * The tint is the person's own accent at low opacity, so the circle belongs to
 * whoever is filling this in rather than being a shared grey.
 */
export function IconBadge({ name, size = 36 }: { name: IconName; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: 'var(--accent-tint)',
        color: 'var(--accent-ink)',
      }}
      aria-hidden="true"
    >
      <Icon name={name} size={Math.round(size * 0.55)} />
    </span>
  );
}
