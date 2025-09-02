import React from "react";
export function Card({ className="", children }){ return <div className={["rounded-lg border shadow-card", className].join(" ")}>{children}</div>; }
export function CardHeader({ className="", children }){ return <div className={["px-6 pt-5", className].join(" ")}>{children}</div>; }
export function CardTitle({ className="", children }){ return <h3 className={["font-semibold", className].join(" ")}>{children}</h3>; }
export function CardContent({ className="", children }){ return <div className={["px-6 pb-6", className].join(" ")}>{children}</div>; }
