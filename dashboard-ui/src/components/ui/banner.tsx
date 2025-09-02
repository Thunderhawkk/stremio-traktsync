import React from "react";

export function Banner({
  kind = "info",
  children,
  polite = true
}: {
  kind?: "info" | "ok" | "err";
  children?: React.ReactNode;
  polite?: boolean;
}) {
  const role = kind === "err" ? "alert" : "status";
  return (
    <div
      className={`banner ${kind}`}
      role={role}
      aria-live={kind === "err" ? "assertive" : (polite ? "polite" : "off")}
      aria-atomic="true"
    >
      {children}
    </div>
  );
}
