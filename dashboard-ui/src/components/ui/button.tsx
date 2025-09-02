import React from "react";
const base = "inline-flex items-center justify-center rounded-md border text-sm font-medium transition-colors focus:outline-none focus:ring-2 disabled:opacity-60 disabled:pointer-events-none";
const variants = {
  default: "bg-primary text-white border-transparent hover:opacity-95",
  secondary: "bg-surface-2 text-fg border-white/10 hover:bg-surface-3",
  destructive: "bg-danger/20 text-red-200 border-red-400/50 hover:bg-danger/30"
};
const sizes = { sm:"h-8 px-3", md:"h-10 px-4", lg:"h-11 px-5" };
export function Button({ variant="default", size="md", className="", ...props }){
  return <button className={[base, variants[variant], sizes[size], className].join(" ")} {...props} />;
}
