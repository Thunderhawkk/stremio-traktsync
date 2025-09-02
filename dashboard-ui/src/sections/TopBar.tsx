import React from "react";
import { Button } from "../components/ui/button";

const setAttr = (name:string, val:string) => document.documentElement.setAttribute(name, val);
const getAttr = (name:string, fallback:string) => document.documentElement.getAttribute(name) || fallback;

export default function TopBar(){
  const onCompact = () => {
    const cur = getAttr("data-density", "cozy");
    const next = cur === "compact" ? "cozy" : "compact";
    setAttr("data-density", next); localStorage.setItem("ui-density", next);
  };
  const onBackground = () => {
    const cur = getAttr("data-bg", "off");
    const next = cur === "on" ? "off" : "on";
    setAttr("data-bg", next); localStorage.setItem("ui-bg", next);
  };
  const onTheme = () => {
    const cur = getAttr("data-theme", "dark");
    const next = cur === "light" ? "dark" : "light";
    setAttr("data-theme", next); localStorage.setItem("ui-theme", next);
  };
  React.useEffect(()=>{
    const t = localStorage.getItem("ui-theme"); if (t) setAttr("data-theme", t);
    const d = localStorage.getItem("ui-density"); if (d) setAttr("data-density", d);
    const b = localStorage.getItem("ui-bg"); if (b) setAttr("data-bg", b);
  }, []);
  return (
    <header className="fixed top-4 right-6 z-50">
      <div className="inline-flex gap-2 bg-surface-1/90 border border-white/10 shadow-card rounded-full px-2 py-2 backdrop-blur">
        <Button variant="secondary" size="sm" onClick={onCompact}>Compact</Button>
        <Button variant="secondary" size="sm" onClick={onBackground}>Background</Button>
        <Button variant="secondary" size="sm" onClick={onTheme}>Theme</Button>
        <Button variant="secondary" size="sm" onClick={()=>{ fetch("/api/auth/logout",{method:"POST",credentials:"include"}).then(()=>location.replace("/login")); }}>Logout</Button>
      </div>
    </header>
  );
}
