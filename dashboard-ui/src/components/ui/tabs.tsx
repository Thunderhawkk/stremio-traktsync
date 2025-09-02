import * as TabsPrimitive from "@radix-ui/react-tabs";
import React from "react";

export function Tabs({ value, onValueChange, className="", children }){
  return <TabsPrimitive.Root value={value} onValueChange={onValueChange} className={className}>{children}</TabsPrimitive.Root>;
}
export function TabsList({ className="", children }){
  return <TabsPrimitive.List className={["inline-flex p-1 gap-1 rounded-lg", className].join(" ")}>{children}</TabsPrimitive.List>;
}
export function TabsTrigger({ value, className="", children }){
  return (
    <TabsPrimitive.Trigger
      value={value}
      className={["px-3 h-9 rounded-md text-sm border border-transparent data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:border-transparent bg-surface-2 text-fg hover:bg-surface-3", className].join(" ")}
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}
export function TabsContent({ value, className="", children }){
  return <TabsPrimitive.Content value={value} className={className}>{children}</TabsPrimitive.Content>;
}
