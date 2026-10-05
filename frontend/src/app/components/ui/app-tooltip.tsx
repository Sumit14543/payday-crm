import { type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export function AppTooltip({
  children,
  label,
  side = "top",
}: {
  children: ReactNode;
  label: string;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={10} collisionPadding={16}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
