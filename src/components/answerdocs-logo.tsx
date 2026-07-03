import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

type AnswerDocsLogoProps = SVGProps<SVGSVGElement> & {
  title?: string;
};

export function AnswerDocsLogo({
  className,
  title = "AnswerDocs",
  ...props
}: AnswerDocsLogoProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label={title}
      className={cn("h-5 w-5", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <g transform="translate(16 16) scale(1.12) translate(-16 -16)">
        <path
          d="M9.25 6.75h9.6l4.15 4.2v14.3H9.25V6.75Z"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinejoin="round"
        />
        <path
          d="M18.75 6.9v4.35h4.1"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinejoin="round"
        />
        <path
          d="M13 15.15h6.7M13 19h5.25"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M6.5 18.7c2.65 0 4.8 2.15 4.8 4.8M6.5 21.8c.94 0 1.7.76 1.7 1.7"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <circle cx="6.5" cy="24.6" r="1.15" fill="currentColor" />
        <path
          d="M25.15 16.2l.65 1.2 1.2.65-1.2.65-.65 1.2-.65-1.2-1.2-.65 1.2-.65.65-1.2Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}
