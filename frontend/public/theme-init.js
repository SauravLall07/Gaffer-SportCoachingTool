/* ── Theme detection + background colour before first paint ──────────
 * Sets the "dark" class AND hardcoded background colours on <html>
 * and <body> so the very first frame the browser paints already has
 * the correct theme — no white flash, no dark-mode flash.
 * Uses hardcoded hex values because CSS custom properties from
 * index.css have not loaded at this point.                            */
try {
  var t = localStorage.getItem("sport-coaching-theme");
  var d = t === "dark" || (!t && matchMedia("(prefers-color-scheme:dark)").matches);
  if (d) {
    document.documentElement.className = "dark";
    document.documentElement.style.background = "#090A0B";
  } else {
    document.documentElement.style.background = "#F5F3F0";
  }
  document.querySelector('meta[name="theme-color"]').setAttribute("content", d ? "#090A0B" : "#F5F3F0");
} catch {
  document.documentElement.style.background = "#F5F3F0";
}
