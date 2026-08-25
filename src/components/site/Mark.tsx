export function Mark({ size = 30 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[10px]"
      style={{
        width: size,
        height: size,
        background: "var(--grad)",
        boxShadow: "0 6px 18px -8px rgba(109,91,208,0.7)",
      }}
    >
      <svg viewBox="0 0 16 16" width={size * 0.5} height={size * 0.5} aria-hidden>
        <path
          d="M1.7 5.5 8 2.2l6.3 3.3L8 8.8 1.7 5.5Z"
          fill="none"
          stroke="#fff"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path
          d="M2.6 9.2 8 12.1l5.4-2.9"
          fill="none"
          stroke="#fff"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.75"
        />
      </svg>
    </span>
  );
}
