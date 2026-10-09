/* Theme tokens for /loading-screen.css — scoped to #preloader only so
   they do not override the app's :root / .dark variables after React. */
(function () {
  var pre = document.getElementById("preloader");
  if (!pre) return;
  var isDark = document.documentElement.classList.contains("dark");
  pre.style.setProperty("--background", isDark ? "#090A0B" : "#F5F3F0");
  pre.style.setProperty("--foreground", isDark ? "#ECEFED" : "#171717");
  pre.style.setProperty("--brand", isDark ? "#16D99A" : "#047857");
  pre.style.setProperty(
    "--font-display",
    '"Lyon", Georgia, "Times New Roman", serif',
  );
})();
