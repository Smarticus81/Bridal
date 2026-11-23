import { Link } from "wouter";

export function AisleworkLogo({
  variant = "full",
  className = "",
  href = "/",
}: {
  variant?: "full" | "mark";
  className?: string;
  href?: string;
}) {
  const mark = (
    <span className={`aw-logo ${className}`}>
      <svg viewBox="0 0 40 30" fill="currentColor" aria-hidden="true">
        <path d="M0 28 15 2h9L9 28zm14 0L29 2h9L23 28zm12 0 6-10 6 10z" />
      </svg>
      {variant === "full" && <span>aislework</span>}
    </span>
  );
  return href ? (
    <Link className="aw-logo-link" aria-label="Aislework home" href={href}>
      {mark}
    </Link>
  ) : (
    mark
  );
}
