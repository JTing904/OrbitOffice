// 滚动到眼前时淡入；不支持 IntersectionObserver 的浏览器直接全部显示
const items = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  items.forEach(el => io.observe(el));
} else {
  items.forEach(el => el.classList.add("in"));
}
document.getElementById("year").textContent = new Date().getFullYear();
