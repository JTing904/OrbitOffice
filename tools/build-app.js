// 打包成可双击运行的 Windows 程序（免安装）：dist/<产品名>/<产品名>.exe
// 做法：复制 Electron 运行时，改名，再把 App 文件放进 resources/app。不需要安装器。
// 用法：node tools/build-app.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const runtime = path.join(root, "node_modules", "electron", "dist");
const NAME = require(path.join(root, "package.json")).productName || "OrbitOffice";
const out = path.join(root, "dist", NAME);
const appDir = path.join(out, "resources", "app");

if (!fs.existsSync(path.join(runtime, "electron.exe"))) {
  console.error("找不到 Electron 运行时：" + runtime);
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(runtime, out, { recursive: true });
fs.renameSync(path.join(out, "electron.exe"), path.join(out, NAME + ".exe"));
fs.rmSync(path.join(out, "resources", "default_app.asar"), { force: true });

// App 本体：页面、脚本、本地库、模型、桌面外壳
fs.mkdirSync(appDir, { recursive: true });
for (const f of ["index.html", "style.css", "app.js", "ui.js", "chat.js", "i18n.js", "office3d.js", "office-def.js", "office-ui.js", "package.json"]) {
  fs.copyFileSync(path.join(root, f), path.join(appDir, f));
}
fs.cpSync(path.join(root, "vendor"), path.join(appDir, "vendor"), { recursive: true });
fs.cpSync(path.join(root, "skills-catalog"), path.join(appDir, "skills-catalog"), { recursive: true });
fs.copyFileSync(path.join(root, "connectors-catalog.json"), path.join(appDir, "connectors-catalog.json"));
fs.cpSync(path.join(root, "electron"), path.join(appDir, "electron"), { recursive: true });
fs.mkdirSync(path.join(appDir, "assets"), { recursive: true });
fs.copyFileSync(path.join(root, "assets", "models.js"), path.join(appDir, "assets", "models.js"));
fs.mkdirSync(path.join(appDir, "assets", "icon"), { recursive: true });
fs.copyFileSync(path.join(root, "assets", "icon", "icon.png"), path.join(appDir, "assets", "icon", "icon.png"));

const size = dir => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
console.log("built", path.join(out, NAME + ".exe"), "—", (size(out) / 1048576).toFixed(0) + " MB");
