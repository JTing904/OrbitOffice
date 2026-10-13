// 从 assets/icon/icon.svg 生成 App 图标：各尺寸的 PNG，以及 Windows 用的 icon.ico（里面放多个尺寸的 PNG）。
// 用本机的 Chrome / Edge 无界面模式把 SVG 画成图片，不需要额外装工具。
// 用法：node tools/make-icons.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const svgFile = path.join(root, "assets", "icon", "icon.svg");
const outDir = path.join(root, "assets", "icon");
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512];

const browsers = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const browser = browsers.find(b => fs.existsSync(b));
if (!browser) { console.error("需要 Chrome 或 Edge 来画图标"); process.exit(1); }

const svg = fs.readFileSync(svgFile, "utf8").replace(/^<\?xml[^>]*>\s*/, "");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "icons-"));
const pngs = {};
for (const size of SIZES) {
  // 画布比图标大一点再截图：有的浏览器版本截图尺寸会差一两个像素
  const html = path.join(tmp, size + ".html");
  fs.writeFileSync(html, `<!doctype html><html><body style="margin:0;background:transparent">${svg.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)}</body></html>`);
  const png = path.join(outDir, "icon-" + size + ".png");
  execFileSync(browser, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--default-background-color=00000000",
    "--user-data-dir=" + path.join(tmp, "profile"), "--window-size=" + size + "," + size, "--screenshot=" + png, "file:///" + html.replace(/\\/g, "/")], { stdio: "ignore" });
  pngs[size] = fs.readFileSync(png);
}
fs.copyFileSync(path.join(outDir, "icon-512.png"), path.join(outDir, "icon.png"));

// .ico：文件头 + 每个尺寸一条目录 + PNG 数据（Windows Vista 以后支持 ICO 里直接放 PNG）
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(icoSizes.length, 4);
const entries = [], datas = [];
let offset = 6 + 16 * icoSizes.length;
for (const size of icoSizes) {
  const data = pngs[size];
  const e = Buffer.alloc(16);
  e.writeUInt8(size >= 256 ? 0 : size, 0); e.writeUInt8(size >= 256 ? 0 : size, 1);   // 256 写成 0
  e.writeUInt8(0, 2); e.writeUInt8(0, 3); e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12);
  offset += data.length;
  entries.push(e); datas.push(data);
}
fs.writeFileSync(path.join(outDir, "icon.ico"), Buffer.concat([header, ...entries, ...datas]));
fs.rmSync(tmp, { recursive: true, force: true });
console.log("icons:", SIZES.join(", "), "+ icon.ico →", outDir);
