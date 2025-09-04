// dashboard-ui/src/components/ui/switch.tsx
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as React from "react";

export interface SwitchProps extends Omit<
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>,
  "checked" | "onCheckedChange"
> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(function Switch(
  { checked, onCheckedChange, disabled, className, ...rest },
  ref
) {
  const base =
    "w-12 h-7 rounded-full bg-surface-2 border border-white/10 " +
    "data-[state=checked]:bg-primary/30 relative outline-none " +
    "focus:ring-2 focus:ring-[var(--color-primary)]";
  return (
    <SwitchPrimitive.Root
      ref={ref}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={className ? `${base} ${className}` : base}
      {...rest}
    >
      <SwitchPrimitive.Thumb
        className="block w-5 h-5 rounded-full bg-white shadow absolute top-1 left-1 transition-transform data-[state=checked]:translate-x-5"
      />
    </SwitchPrimitive.Root>
  );
});
