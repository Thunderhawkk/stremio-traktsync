import * as SwitchPrimitive from "@radix-ui/react-switch";
import React from "react";

export function Switch({ checked, onCheckedChange }){
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="w-12 h-7 rounded-full bg-surface-2 border border-white/10 data-[state=checked]:bg-primary/30 relative outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
    >
      <SwitchPrimitive.Thumb
        className="block w-5 h-5 rounded-full bg-white shadow absolute top-1 left-1 transition-transform data-[state=checked]:translate-x-5"
      />
    </SwitchPrimitive.Root>
  );
}
