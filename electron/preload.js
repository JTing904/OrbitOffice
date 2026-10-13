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
  // 连接器：接上外部工具。配置里的密钥只能写入，读不回来。
  connectors: {
    list: () => ipcRenderer.invoke("conn:list"),
    add: text => ipcRenderer.invoke("conn:add", text),
    update: (id, patch) => ipcRenderer.invoke("conn:update", id, patch),
    reconnect: id => ipcRenderer.invoke("conn:reconnect", id),
    remove: id => ipcRenderer.invoke("conn:remove", id),
  },
  // 办公室和员工的定义文件
  office: {
    load: () => ipcRenderer.invoke("office:load"),
    write: change => ipcRenderer.invoke("office:write", change),
    addRefFiles: id => ipcRenderer.invoke("office:addRefFiles", id),
    addRefText: (id, name, text) => ipcRenderer.invoke("office:addRefText", id, name, text),
    removeRef: (id, name) => ipcRenderer.invoke("office:removeRef", id, name),
    pickFiles: () => ipcRenderer.invoke("office:pickFiles"),
    openDir: () => ipcRenderer.invoke("office:openDir"),
  },
  files: {
    read: rel => ipcRenderer.invoke("files:read", rel),
    reveal: rel => ipcRenderer.invoke("files:reveal", rel),
    notes: () => ipcRenderer.invoke("files:notes"),
    memory: () => ipcRenderer.invoke("files:memory"),
  },
  // 员工真干活：在项目文件夹里读写文件
  agent: {
    available: () => ipcRenderer.invoke("agent:available"),
    run: req => ipcRenderer.invoke("agent:run", req),
    answer: (askId, allow) => ipcRenderer.send("agent:answer", askId, allow),
    cancel: taskId => ipcRenderer.send("agent:cancel", taskId),
    say: req => ipcRenderer.invoke("agent:say", req),
    talkStop: () => ipcRenderer.send("agent:talkStop"),
    compose: req => ipcRenderer.invoke("agent:compose", req),
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
    usage: () => ipcRenderer.invoke("pool:usage"),
  },
});
