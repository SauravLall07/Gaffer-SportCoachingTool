(function () {
  var pre = document.getElementById("preloader");
  var root = document.getElementById("root");
  if (!pre || !root) return;

  var done = false;

  function check() {
    if (done) return;
    if (root.querySelector(".loading-overlay")) {
      done = true;
      /* Double-rAF: first frame ensures the browser has committed
         React's paint; second frame swaps layers seamlessly. */
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          root.style.display = "";
          pre.remove();
        });
      });
      return;
    }
    requestAnimationFrame(check);
  }
  requestAnimationFrame(check);

  /* Fallback: if React never mounts, reveal the root after 15 s. */
  setTimeout(function () {
    if (!done) {
      done = true;
      root.style.display = "";
      pre.remove();
    }
  }, 15000);
})();
