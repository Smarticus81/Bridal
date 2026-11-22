import { Link } from "wouter";
import { cn } from "@/lib/utils";

type GlimpseLogoProps = {
  variant?: "full" | "mark";
  className?: string;
  href?: string;
};

export function GlimpseLogo({
  variant = "full",
  className,
  href = "/",
}: GlimpseLogoProps) {
  const lettering = (
    <span
      className={cn(
        "maison-wordmark",
        variant === "mark" && "maison-monogram",
        className,
      )}
    >
      {variant === "mark" ? "G" : "Glimpse"}
      <i aria-hidden="true">.</i>
    </span>
  );
  return href ? (
    <Link href={href} aria-label="Glimpse home" className="maison-logo-link">
      {lettering}
    </Link>
  ) : (
    lettering
  );
}
