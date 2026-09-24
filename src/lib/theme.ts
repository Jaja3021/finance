// Theme preference: "light" | "dark" | "system", stored in a cookie so it
// survives restarts. THEME_SCRIPT runs in <head> before first paint and
// resolves it to <html data-theme="light|dark">, avoiding a flash of the
// wrong theme. With "system", it also follows OS changes live.

export type ThemePref = "light" | "dark" | "system";
export const THEME_COOKIE = "ft_theme";

export const THEME_SCRIPT = `(function(){try{
var r=document.documentElement,q=matchMedia("(prefers-color-scheme: dark)");
function pref(){var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark|system)/);return m?m[1]:"system";}
function apply(){var p=pref(),d=p==="dark"||(p==="system"&&q.matches);r.setAttribute("data-theme",d?"dark":"light");r.setAttribute("data-theme-pref",p);}
apply();q.addEventListener("change",function(){if(pref()==="system")apply();});
window.__applyTheme=apply;
requestAnimationFrame(function(){requestAnimationFrame(function(){r.setAttribute("data-theme-ready","")})});
}catch(e){}})()`;
