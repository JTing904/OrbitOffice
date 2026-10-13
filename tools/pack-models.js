// 把 assets/models/*.glb 打包成 assets/models.js（base64），这样直接双击 index.html（file://）也能加载模型。
// 用法：node tools/pack-models.js
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "assets", "models");
const out = path.join(__dirname, "..", "assets", "models.js");
const models = {};
for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".glb")).sort()) {
  models[path.basename(file, ".glb")] = fs.readFileSync(path.join(dir, file)).toString("base64");
}
fs.writeFileSync(out, "// 由 tools/pack-models.js 生成，请勿手改。模型源文件：tools/blender/build_models.py\nwindow.OFFICE_MODELS = " + JSON.stringify(models) + ";\n");
console.log("packed", Object.keys(models).join(", "), "->", (fs.statSync(out).size / 1024).toFixed(0) + " KB");
