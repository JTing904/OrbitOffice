"use strict";

// 暴露给页面的桌面能力。页面只能调用这里列出的几个函数，拿不到 Node 或 Electron 本身。
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  windowControl: action => ipcRenderer.send("window-control", action),
  notify: (title, body) => ipcRenderer.send("notify", title, body),
  getProject: () => ipcRenderer.invoke("project:get"),
  pickProject: () => ipcRenderer.invoke("project:pick"),
  caps: {
    get: () => ipcRenderer.invoke("caps:get"),
    set: caps => ipcRenderer.invoke("caps:set", caps),
  },
  files: {
    read: rel => ipcRenderer.invoke("files:read", rel),
    reveal: rel => ipcRenderer.invoke("files:reveal", rel),
    notes: () => ipcRenderer.invoke("files:notes"),
  },
  // 员工真干活：在项目文件夹里读写文件
  agent: {
    available: () => ipcRenderer.invoke("agent:available"),
    run: req => ipcRenderer.invoke("agent:run", req),
    answer: (askId, allow) => ipcRenderer.send("agent:answer", askId, allow),
    onEvent: cb => ipcRenderer.on("agent:event", (_e, payload) => cb(payload)),
  },
  // AI 池：多个来源。Key 只能写入，读不回来。
  pool: {
    list: () => ipcRenderer.invoke("pool:list"),
    save: source => ipcRenderer.invoke("pool:save", source),
    remove: id => ipcRenderer.invoke("pool:remove", id),
    move: (id, dir) => ipcRenderer.invoke("pool:move", id, dir),
    setKey: (id, key) => ipcRenderer.invoke("pool:setKey", id, key),
    models: id => ipcRenderer.invoke("pool:models", id),
    test: id => ipcRenderer.invoke("pool:test", id),
    scan: id => ipcRenderer.invoke("pool:scan", id),
    scanStatus: id => ipcRenderer.invoke("pool:scanStatus", id),
  },
});
