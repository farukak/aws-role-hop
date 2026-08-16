export type AccessModeChoice = 'iam' | 'sso';

interface AccessModeMarkProps {
  mode: AccessModeChoice;
  size?: number;
}

/**
 * Two marks for the two access paths. Both keep the AWS Role Hop arc so they read
 * as one product; the hue and the badge separate them — a key for the role a
 * Console session assumes, a doorway for the access portal you start from.
 */
export function AccessModeMark({ mode, size = 44 }: AccessModeMarkProps) {
  const iam = mode === 'iam';
  return (
    <svg
      className={`access-mode-mark access-mode-mark--${mode}`}
      width={size}
      height={size}
      viewBox="0 0 128 128"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="128" height="128" rx="30" fill={iam ? '#646be0' : '#12857a'} />
      <path
        d="M30 100 Q56 24 100 62"
        fill="none"
        stroke="#ffffff"
        strokeWidth="18"
        strokeLinecap="round"
      />
      <circle cx="94" cy="94" r="25" fill="#ffffff" />
      {iam ? (
        <g fill="none" stroke="#4a51c9" strokeWidth="6" strokeLinecap="round">
          <circle cx="86" cy="94" r="7" />
          <path d="M93 94h13" />
          <path d="M102 94v7" />
        </g>
      ) : (
        <g
          fill="none"
          stroke="#0e6f66"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M93 82H83v24h10" />
          <path d="M90 94h16" />
          <path d="M101 89l5 5-5 5" />
        </g>
      )}
    </svg>
  );
}
