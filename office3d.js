"use strict";

// 3D 办公室：基于 Three.js r128（全局 THREE）。模型由 Blender 生成（tools/blender/build_models.py），经 assets/models.js 载入。
// 场景：深色太空背景里悬浮着几座「团队岛」，中间是共享大脑；员工在各自的岛上工作、休息。
// 对外接口：init(el, agents, teams, handlers) / setLabel / setWorking / setWaiting / isAtDesk / celebrate / handoff /
//   setBrainText / setTeamLabel / setAgentColor / setSelected / focus / getLayout / setInset。
// init 返回 Promise<boolean>：false 表示不支持（缺少 Three.js 或 WebGL），app.js 会回退到 2D 布局。
// 注意：顶层不能引用 THREE（CDN 失败时脚本也要能加载），THREE 相关对象都在 init 里创建。
(function () {
  const O = { layer: null, ready: false };
  window.Office3D = O;

  const FONT = '"Microsoft YaHei","PingFang SC",system-ui,sans-serif';
  // 岛围着大脑放射状摆放（绕竖直轴的角度），开口朝外。默认是三座岛的摆法；四座岛时在 init 里换成每 90° 一座。
  let ISLAND_ANGLES = [-2 * Math.PI / 3, 2 * Math.PI / 3, 0];
  let ISLAND_RADIUS = 10.5;
  const BRAIN_POS = [0, 2.4, 0];
  const ISLAND_W = 8.8, ISLAND_D = 6.4;   // 岛的宽和进深（与 Blender 模型一致）
  // 岛内（局部）工位坐标：两人一岛或三人一岛
  const DESK_LAYOUTS = {
    1: [[0, -1.4]], 2: [[-2.2, -1.4], [2.2, -1.4]], 3: [[-2.9, -1.4], [0, -1.4], [2.9, -1.4]],
    4: [[-3.3, -1.4], [-1.1, -1.4], [1.1, -1.4], [3.3, -1.4]],
    5: [[-2.9, -1.4], [0, -1.4], [2.9, -1.4], [-1.6, 0.9], [1.6, 0.9]],
    6: [[-2.9, -1.4], [0, -1.4], [2.9, -1.4], [-2.9, 0.9], [0, 0.9], [2.9, 0.9]],
  };
  const MAX_PER_ISLAND = 6;
  const SEAT_DZ = 1.05;       // 椅子在桌子前方的距离
  const LANE_Z = 0.9;         // 岛内通往休息区的走道
  const SPEED = 2.4;          // 走路速度（单位/秒）
  const LABEL_HALF_W = 75;    // 员工标签半宽，需与 style.css 里 .labels .desk 的宽度一致

  // 每座岛的休息点（局部坐标）：左边咖啡机、右边沙发
  const SPOT_DEFS = [
    { x: -3.2, z: 1.7, face: -Math.PI / 2, kind: "coffee" },
    { x: -3.2, z: 2.7, face: -Math.PI / 2, kind: "coffee" },
    { x: 3.2, z: 1.7, face: Math.PI / 2, kind: "chat" },
    { x: 3.2, z: 2.7, face: Math.PI / 2, kind: "chat" },
  ];

  // 每位员工的外观：配饰节点（模型里的 AccXxx）与发色
  const LOOKS = {
    planner: { acc: ["AccGlasses"], hair: 0x2b2118 },
    reviewer: { acc: ["AccGlasses", "AccTie"], hair: 0x4a4038 },
    debugger: { acc: ["AccHeadset"], hair: 0x1b1b22 },
    tester: { acc: ["AccCap"], hair: 0x3a2a1c },
    writer: { acc: [], hair: 0x5a3b25 },
    devops: { acc: ["AccHeadset", "AccCap"], hair: 0x22252b },
    designer: { acc: [], hair: 0x8a5a3c },
    developer: { acc: ["AccGlasses", "AccHeadset"], hair: 0x1f2937 },
    attacker: { acc: ["AccCap"], hair: 0x111318 },
    security: { acc: ["AccTie", "AccHeadset"], hair: 0x3b3027 },
  };
  const ACCESSORIES = ["AccGlasses", "AccHeadset", "AccCap", "AccTie"];
  const models = {};   // 名字 -> 载入后的模型（THREE.Group），使用时 clone

  const states = {};   // agentId -> 状态
  const labels = {};   // agentId -> 悬浮标签元素
  const anchors = [];  // 团队名、大脑等固定标签
  const islands = [];
  const clickable = [];
  const flights = [];  // 正在传递的文件
  const links = [];    // 网络连线上流动的光点
  let renderer, scene, camera, controls, container, onPick, clock, tmp;
  let handlers = {};
  let WHITE;
  let tween = null;             // 镜头飞行动画
  const teamEls = {};           // teamId -> { name, cnt }
  let HOME_POS = [0, 30, 27];
  let HOME_TARGET = [0, 0.3, 0];
  let brain, brainEl, brainKey = "";
  const inset = { x: 0, y: 0, tx: 0, ty: 0 };   // 被界面遮挡的区域（右侧抽屉、底部指令栏），场景会平滑避让

  const hex = s => parseInt(s.slice(1), 16);
  const mat = (color, extra) =>
    new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0 }, extra));
  const mix = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k);

  // 解析 assets/models.js 里的 GLB。颜色从线性空间转回 sRGB 数值，和场景里直接写十六进制颜色的材质保持同一套观感。
  function loadModels() {
    const src = window.OFFICE_MODELS;
    if (!src || !THREE.GLTFLoader) return Promise.reject(new Error("models unavailable"));
    const loader = new THREE.GLTFLoader();
    const seen = new Set();
    return Promise.all(Object.keys(src).map(name => new Promise((resolve, reject) => {
      const bin = atob(src[name]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      loader.parse(bytes.buffer, "", gltf => {
        gltf.scene.traverse(n => {
          if (!n.isMesh) return;
          n.castShadow = n.receiveShadow = true;
          if (seen.has(n.material)) return;
          seen.add(n.material);
          n.material.color.convertLinearToSRGB();
          n.material.emissive.convertLinearToSRGB();
        });
        models[name] = gltf.scene;
        resolve();
      }, reject);
    })));
  }
  const inst = name => models[name].clone(true);
  // 给实例里指定名字的材质换色（克隆材质，不影响其他实例）；返回 材质名 -> 新材质
  function tint(obj, colors) {
    const made = {};
    obj.traverse(n => {
      if (!n.isMesh || !(n.material.name in colors)) return;
      const key = n.material.name;
      if (!made[key]) {
        made[key] = n.material.clone();
        made[key].color.set(colors[key]);
        if (made[key].emissive.getHex()) { made[key].emissive.set(colors[key]); made[key].color.set(0x000000); }   // 自发光材质只靠发光显色
      }
      n.material = made[key];
    });
    return made;
  }

  function box(parent, w, h, d, material, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  function canvasTexture(w, h) {
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const tex = new THREE.CanvasTexture(canvas);
    return { canvas, ctx: canvas.getContext("2d"), tex };
  }

  // 朝目标角度转，走最短方向
  function turnToward(cur, target, k) {
    const d = ((target - cur + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    return cur + d * k;
  }

  // ---- 世界：星空、大脑 ----
  function buildWorld() {
    const n = 450, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 55 + Math.random() * 30, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) * 0.8 + 6;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th) - 20;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9db0ff, size: 0.35, transparent: true, opacity: 0.8 })));

    // 共享大脑：发光核心 + 线框外壳 + 两道光环 + 底座（Blender 模型）
    brain = inst("brain");
    brain.position.set(...BRAIN_POS);
    const core = brain.getObjectByName("Core"), shell = brain.getObjectByName("Shell");
    const ring1 = brain.getObjectByName("Ring1"), ring2 = brain.getObjectByName("Ring2");
    core.material = core.material.clone();
    core.castShadow = shell.castShadow = ring1.castShadow = ring2.castShadow = false;
    ring1.rotation.x = Math.PI / 2.3;
    ring2.rotation.set(Math.PI / 3, Math.PI / 3, 0);
    brain.add(new THREE.PointLight(0x22d3ee, 1.6, 18));
    brain.userData = { core, shell, ring1, ring2, pulse: 0 };
    scene.add(brain);

    brainEl = document.createElement("div");
    brainEl.className = "brain-label";
    brainEl.addEventListener("click", () => handlers.brain && handlers.brain());
    O.layer.append(brainEl);
    anchors.push({ el: brainEl, obj: brain, off: new THREE.Vector3(0, 2.7, 0), below: false });
  }

  // 从 from 指向 to 的方向上，落在岛边缘的点（世界坐标）
  // 岛上的局部点 -> 世界坐标（岛是旋转过的）
  function islandPoint(isl, lx, lz) {
    const c = Math.cos(isl.angle), s = Math.sin(isl.angle);
    return new THREE.Vector3(isl.x + lx * c + lz * s, -0.25, isl.z - lx * s + lz * c);
  }
  function addLink(a, b, color, opacity, pulses) {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y -= 1.2;   // 中间微微下垂，像悬着的光缆
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.04, 6, false),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity }));
    scene.add(tube);
    for (let i = 0; i < pulses; i++) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      scene.add(dot);
      links.push({ curve, dot, t: i / pulses, speed: 0.16 + Math.random() * 0.06, color: new THREE.Color(color) });
    }
  }
  function buildLinks() {
    const bx = BRAIN_POS[0], bz = BRAIN_POS[2], padY = BRAIN_POS[1] - 2.1;
    for (const isl of islands) {
      const d = Math.hypot(isl.x - bx, isl.z - bz);
      const start = new THREE.Vector3(bx + (isl.x - bx) / d * 1.95, padY, bz + (isl.z - bz) / d * 1.95);
      addLink(start, islandPoint(isl, 0, -ISLAND_D / 2 - 0.1), isl.color, 0.75, 3);
    }
    // 相邻的岛：用各自朝向对方的那一侧相连
    const side = (a, b) => {
      const local = (b.x - a.x) * Math.cos(a.angle) - (b.z - a.z) * Math.sin(a.angle);   // b 在 a 的左边还是右边
      return islandPoint(a, Math.sign(local) * (ISLAND_W / 2 + 0.1), 0);
    };
    for (let i = 0; i < (islands.length < 3 ? islands.length - 1 : islands.length); i++) {
      const a = islands[i], b = islands[(i + 1) % islands.length];
      addLink(side(a, b), side(b, a), "#8fa0d8", 0.3, 1);
    }
  }

  // ---- 团队岛：悬浮平台 + 后墙 + 工位 + 休息区 ----
  function buildIsland(team, idx, members) {
    const angle = ISLAND_ANGLES[idx % ISLAND_ANGLES.length];
    const px = Math.sin(angle) * ISLAND_RADIUS, pz = Math.cos(angle) * ISLAND_RADIUS;
    const g = new THREE.Group();
    g.position.set(px, 0, pz);
    g.rotation.y = angle;   // 局部 +z（开口方向）朝外
    scene.add(g);
    const col = hex(team.color);
    const D = ISLAND_D;

    // 平台、地砖、发光边框、后墙、岩石底（Blender 模型），按团队色换色
    const style = ["island_" + team.style, "island_" + team.id].find(k => models[k]) || "island_product";
    const island = inst(style);   // 每个团队一种办公室；自建的团队可以选用哪一种
    tint(island, {
      TileA: mix(col, 0x10142a, 0.7), TileB: mix(col, 0x10142a, 0.78), Side: mix(col, 0x0d1022, 0.65),
      Wall: mix(col, 0x10142a, 0.6), WallTrim: mix(col, 0x0a0d1a, 0.8), Rim: new THREE.Color(col),
    });
    g.add(island);

    // 氛围光
    const light = new THREE.PointLight(col, 0.9, 13);
    light.position.set(0, 5, 1);
    g.add(light);

    // 团队名标签（HTML，挂在岛前沿）
    const tl = document.createElement("div");
    tl.className = "team-label";
    tl.style.setProperty("--tc", team.color);
    const dot = document.createElement("i");
    const name = document.createElement("b");
    name.textContent = team.id;
    const cnt = document.createElement("span");
    teamEls[team.id] = { name, cnt };
    tl.addEventListener("click", () => handlers.team && handlers.team(team.id));
    tl.append(dot, name, cnt);
    O.layer.append(tl);
    anchors.push({ el: tl, obj: g, off: new THREE.Vector3(0, -0.2, D / 2 + 0.3), below: true });

    const isl = { id: team.id, x: px, z: pz, angle, color: team.color, group: g, phase: idx * 2.1, spots: SPOT_DEFS.map(p => Object.assign({ taken: null }, p)) };
    islands.push(isl);
    const desks = DESK_LAYOUTS[Math.min(members.length, MAX_PER_ISLAND)] || DESK_LAYOUTS[1];
    members.slice(0, desks.length).forEach((a, i) => buildStation(a, isl, desks[i][0], desks[i][1]));
    // 人多时（两排桌子）走道被第二排挡住：大家坐着不去休息区
    if (members.length > 3) for (const a of members) if (states[a.id]) states[a.id].noWander = true;
  }

  function drawScreen(s, t) {
    const c = s.ctx, w = 256, h = 160;
    c.fillStyle = s.typing ? "#10151c" : "#0a0d11";
    c.fillRect(0, 0, w, h);
    if (s.typing) {
      const shift = t * 30 / 16, base = Math.floor(shift), frac = shift - base;
      c.fillStyle = s.color;
      c.globalAlpha = 0.85;
      for (let i = 0; i < 11; i++) {
        const y = i * 16 - frac * 16 + 8;
        const seed = ((i + base) * 9301 + 49297) % 233;
        c.fillRect(12 + (seed % 3) * 14, y, 40 + (seed % 150), 6);
      }
      c.globalAlpha = 1;
    } else {
      c.fillStyle = "#2a3340";
      c.font = `bold 26px ${FONT}`;
      c.textAlign = "center";
      c.fillText("zZ", w / 2, h / 2 + 9);
    }
    s.tex.needsUpdate = true;
  }

  // ---- 工位、椅子、员工（坐标都是所在岛的局部坐标）----
  function buildStation(agent, isl, x, z) {
    const root = isl.group;
    const desk = inst("desk");
    desk.position.set(x, 0, z);
    root.add(desk);
    const accent = tint(desk, { Accent: agent.color }).Accent;

    // 显示器画面：动态 canvas 贴图（GLB 的 UV 以左上为原点，所以 flipY = false）
    const screen = canvasTexture(256, 160);
    screen.tex.flipY = false;
    const screenMesh = desk.getObjectByName("Screen");
    screenMesh.material = new THREE.MeshBasicMaterial({ map: screen.tex });
    screenMesh.castShadow = false;

    // 转椅（独立于员工，员工离开后椅子留在原地）
    const seat = { x, z: z + SEAT_DZ };
    const chair = inst("chair");
    chair.position.set(seat.x, 0, seat.z);
    root.add(chair);

    const ch = makeCharacter(agent);
    ch.group.position.set(seat.x, 0, seat.z);
    root.add(ch.group);

    const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.78, 40),
      new THREE.MeshBasicMaterial({ color: hex(agent.color), transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    ring.visible = false;
    ch.group.add(ring);

    const s = Object.assign(ch, {
      id: agent.id, color: agent.color, island: isl, chair, seat, desk, accent, ring,
      mode: "seated", sit: 1, path: [], returning: false, spot: null,
      want: false, waiting: false, typing: false, jump: 0,
      walkAmt: 0, walkPhase: 0, awayTimer: 0, idleTimer: 4 + Math.random() * 8,
      armLv: -0.1, armRv: -0.1,
      phase: Math.random() * 6, ctx: screen.ctx, tex: screen.tex, nextDraw: 0, dirty: true,
    });
    states[agent.id] = s;
    const tag = o => { if (o.isMesh && o !== ring) { o.userData.agentId = agent.id; clickable.push(o); } };
    // 注：隐藏的配饰仍会被 traverse 到，但它们都贴在头部附近，不影响点选
    ch.group.traverse(tag);
    chair.traverse(tag);
    drawScreen(s, 0);
  }

  // 角色（Blender 模型）：站立姿态、脚踩地面、朝向局部 +z。
  // 关节是模型里的空节点：Body 整体、Head 头、ArmL/R 肩、HipL/R 髋、KneeL/R 膝；坐下时 Body 下移 0.34，大腿水平、小腿垂下。
  function makeCharacter(agent) {
    const group = inst("character");
    const look = agent.look || LOOKS[agent.id] || { acc: [], hair: 0x2b2118 };
    const mats = tint(group, { Shirt: agent.color, Hair: new THREE.Color(look.hair) });
    for (const name of ACCESSORIES) group.getObjectByName(name).visible = look.acc.includes(name);
    const node = name => group.getObjectByName(name);
    return {
      group, body: node("Body"), head: node("Head"), armL: node("ArmL"), armR: node("ArmR"),
      hipL: node("HipL"), hipR: node("HipR"), kneeL: node("KneeL"), kneeR: node("KneeR"), shirt: mats.Shirt,
    };
  }

  // ---- 行为：坐着 / 起身 / 走路 / 休息区 / 坐下 ----
  function pickSpot(s) {
    const free = s.island.spots.filter(p => !p.taken);
    if (!free.length) return null;
    const p = free[Math.floor(Math.random() * free.length)];
    p.taken = s.id;
    return p;
  }
  function releaseSpot(s) {
    if (s.spot) { s.spot.taken = null; s.spot = null; }
  }

  function startWander(s) {
    const spot = pickSpot(s);
    if (!spot) { s.idleTimer = 5; return; }
    s.spot = spot;
    s.returning = false;
    s.path = [{ x: s.seat.x, z: LANE_Z }, { x: spot.x, z: LANE_Z }, { x: spot.x, z: spot.z }];
    s.mode = "standup";
  }

  function goHome(s) {
    releaseSpot(s);
    if (s.mode === "standup") { s.mode = "sit"; s.returning = false; return; }
    const p = s.group.position;
    s.path = [{ x: p.x, z: LANE_Z }, { x: s.seat.x, z: LANE_Z }, { x: s.seat.x, z: s.seat.z }];
    s.returning = true;
    s.mode = "walk";
  }

  function updateAgent(s, dt, t) {
    const g = s.group;
    const k6 = 1 - Math.exp(-dt * 6), k10 = 1 - Math.exp(-dt * 10);

    // 决策
    if (s.mode === "seated") {
      if (s.want || s.waiting) s.idleTimer = 6 + Math.random() * 10;
      else if (!s.noWander && (s.idleTimer -= dt) <= 0) startWander(s);
    } else if (s.want && !s.returning && s.mode !== "sit") {
      goHome(s);
    }

    switch (s.mode) {
      case "seated":
        g.position.x = s.seat.x; g.position.z = s.seat.z;
        g.rotation.y = turnToward(g.rotation.y, s.want ? Math.PI : 0, k6);
        s.chair.rotation.y = g.rotation.y;
        break;
      case "standup": {
        const p = s.path[0];
        g.rotation.y = turnToward(g.rotation.y, Math.atan2(p.x - g.position.x, p.z - g.position.z), k10);
        s.sit = Math.max(0, s.sit - dt * 2.5);
        if (s.sit === 0) s.mode = "walk";
        break;
      }
      case "sit":
        g.position.x = s.seat.x; g.position.z = s.seat.z;
        g.rotation.y = turnToward(g.rotation.y, Math.PI, k10);
        s.chair.rotation.y = g.rotation.y;
        s.sit = Math.min(1, s.sit + dt * 2.5);
        if (s.sit === 1) s.mode = "seated";
        break;
      case "walk": {
        const p = s.path[0];
        const dx = p.x - g.position.x, dz = p.z - g.position.z, d = Math.hypot(dx, dz), step = SPEED * dt;
        if (d <= step) {
          g.position.x = p.x; g.position.z = p.z;
          s.path.shift();
          if (!s.path.length) {
            if (s.returning) { s.returning = false; s.mode = "sit"; }
            else { s.mode = "away"; s.awayTimer = 5 + Math.random() * 6; }
          }
        } else {
          g.position.x += dx / d * step;
          g.position.z += dz / d * step;
          g.rotation.y = turnToward(g.rotation.y, Math.atan2(dx, dz), k10);
        }
        s.walkPhase += dt * SPEED * 3.5;
        break;
      }
      case "away":
        g.rotation.y = turnToward(g.rotation.y, s.spot ? s.spot.face : 0, k6);
        if ((s.awayTimer -= dt) <= 0) goHome(s);
        break;
    }

    // 姿态
    s.walkAmt += ((s.mode === "walk" ? 1 : 0) - s.walkAmt) * Math.min(1, dt * 8);
    const sit = s.sit, w = s.walkAmt, wp = s.walkPhase, stand = 1 - sit;
    s.body.position.y = -0.34 * sit;
    const swing = Math.sin(wp) * 0.6 * w * stand;
    s.hipL.rotation.x = -Math.PI / 2 * sit + swing;
    s.hipR.rotation.x = -Math.PI / 2 * sit - swing;
    s.kneeL.rotation.x = Math.PI / 2 * sit + Math.max(0, -Math.sin(wp)) * 0.7 * w * stand;
    s.kneeR.rotation.x = Math.PI / 2 * sit + Math.max(0, Math.sin(wp)) * 0.7 * w * stand;

    let aL = -0.1 + Math.sin(t * 1.5 + s.phase) * 0.03, aR = aL;
    const typing = s.mode === "seated" && s.want;
    if (s.jump > 0) {
      s.jump = Math.max(0, s.jump - dt);
      g.position.y = Math.abs(Math.sin(s.jump * Math.PI * 3)) * 0.3;
      aL = aR = -2.8;
    } else {
      g.position.y = 0;
      if (typing) {
        aL = -1.15 + Math.sin(t * 14 + s.phase) * 0.07;
        aR = -1.15 + Math.cos(t * 13 + s.phase) * 0.07;
      } else if (s.mode === "seated" && s.waiting) {
        aR = -2.9 + Math.sin(t * 7) * 0.25;                    // 举手等批准
      } else if (s.mode === "walk") {
        aL = -Math.sin(wp) * 0.5 * w;
        aR = Math.sin(wp) * 0.5 * w;
      } else if (s.mode === "away" && s.spot && s.spot.kind === "coffee" && Math.sin(t * 0.9 + s.phase) > 0.3) {
        aR = -1.7;                                              // 喝咖啡
      }
    }
    s.armLv += (aL - s.armLv) * Math.min(1, dt * 10);
    s.armRv += (aR - s.armRv) * Math.min(1, dt * 10);
    s.armL.rotation.x = s.armLv;
    s.armR.rotation.x = s.armRv;

    s.head.rotation.x = typing ? Math.sin(t * 3 + s.phase) * 0.05 : 0;
    s.head.rotation.y = typing || s.mode === "walk" ? 0 : Math.sin(t * 0.7 + s.phase) * 0.45;

    if (s.ring.visible) s.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.06);

    if (typing !== s.typing) { s.typing = typing; s.dirty = true; }
    if (s.typing && t >= s.nextDraw) { s.nextDraw = t + 0.1; drawScreen(s, t); s.dirty = false; }
    else if (s.dirty) { drawScreen(s, t); s.dirty = false; }
  }

  // 传递文件的小动画：从发送者工位飞到共享大脑，再飞到接收者工位
  function deskWorld(s) {
    return s.island.group.localToWorld(new THREE.Vector3(s.desk.position.x, 1.1, s.desk.position.z));
  }
  function spawnFlight(from, to) {
    const group = new THREE.Group();
    box(group, 0.4, 0.04, 0.5, mat(0xffffff), 0, 0, 0);
    box(group, 0.4, 0.045, 0.1, mat(hex(from.color)), 0, 0.01, 0.15);
    scene.add(group);
    flights.push({
      group, t: 0, dur: 2.2, pulsed: false,
      a: deskWorld(from), b: deskWorld(to),
      c: new THREE.Vector3(BRAIN_POS[0], BRAIN_POS[1] + 2.2, BRAIN_POS[2]),
    });
  }

  // ---- 初始化 ----
  O.init = async function (el, agents, teams, hnd) {
    if (!window.THREE || !THREE.OrbitControls || !teams) return false;
    try { await loadModels(); } catch (_) { return false; }
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (_) { return false; }

    clock = new THREE.Clock();
    WHITE = new THREE.Color(0xffffff);
    tmp = new THREE.Vector3();
    container = el;
    handlers = hnd || {};
    onPick = handlers.pick;
    container.classList.add("is3d");
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.append(renderer.domElement);

    O.layer = document.createElement("div");
    O.layer.className = "labels";
    container.append(O.layer);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(40, 1.5, 0.1, 200);
    // 岛的摆法：三座、四座用调好的角度；其余数量均匀排一圈（按角度从小到大，相邻的岛才连线）。
    // 半径保证相邻两座岛之间至少留出约 4 个单位的空隙；镜头按半径拉远。
    const n = Math.max(1, teams.length);
    if (n === 3) ISLAND_ANGLES = [-2 * Math.PI / 3, 2 * Math.PI / 3, 0];
    else if (n === 4) ISLAND_ANGLES = [-3 * Math.PI / 4, 3 * Math.PI / 4, Math.PI / 4, -Math.PI / 4];
    else if (n === 1) ISLAND_ANGLES = [0];
    else if (n === 2) ISLAND_ANGLES = [-Math.PI / 2, Math.PI / 2];
    else ISLAND_ANGLES = Array.from({ length: n }, (_, i) => -Math.PI + (i + 0.5) * 2 * Math.PI / n);
    ISLAND_RADIUS = n === 1 ? 8 : n === 2 ? 10.5 : Math.max(10.5, 3.2 + (4 + (ISLAND_W / 2) * Math.cos(Math.PI / n)) / Math.sin(Math.PI / n));
    if (n === 4) ISLAND_RADIUS = 13.5;
    const zoom = 1 + Math.max(0, ISLAND_RADIUS - 10.5) / 10.5 * 1.6;
    // 镜头对准大脑稍后方一点：后排的岛离顶栏远一些，头顶的标签放得下
    HOME_TARGET = [0, 0.3, -Math.max(0, ISLAND_RADIUS - 10.5) * 0.9];
    HOME_POS = [0, 30 * zoom, 27 * zoom + HOME_TARGET[2]];
    camera.position.set(...HOME_POS);
    camera.far = Math.max(200, HOME_POS[1] * 4);
    camera.updateProjectionMatrix();

    scene.add(new THREE.HemisphereLight(0x9db4ff, 0x1a1f3a, 0.7));
    const sun = new THREE.DirectionalLight(0xdfe6ff, 0.65);
    sun.position.set(-8, 20, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const span = ISLAND_RADIUS + 13;
    Object.assign(sun.shadow.camera, { left: -span, right: span, top: span - 3, bottom: -span + 3, near: 1, far: 60 + span * 2 });
    scene.add(sun);

    buildWorld();
    teams.forEach((team, i) => buildIsland(team, i, agents.filter(a => a.team === team.id)));
    buildLinks();

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(...HOME_TARGET);
    controls.addEventListener("start", () => { tween = null; });   // 用户一动手就取消镜头飞行
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.minDistance = 8;
    controls.maxDistance = Math.max(60, Math.hypot(HOME_POS[1], HOME_POS[2]) * 1.4);
    controls.maxPolarAngle = 1.35;

    // 点击员工：区分点击与拖拽
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let down = null;
    renderer.domElement.addEventListener("pointerdown", e => { down = [e.clientX, e.clientY]; });
    renderer.domElement.addEventListener("pointerup", e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(clickable, false)[0];
      if (hit && onPick) onPick(hit.object.userData.agentId);
    });

    const resize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      // 保证水平视野不小于约 50°，窄屏时自动加大垂直视野
      camera.fov = Math.min(75, Math.max(40, 2 * Math.atan(Math.tan(25 * Math.PI / 180) / camera.aspect) * 180 / Math.PI));
      camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(container);
    resize();

    O.ready = true;
    requestAnimationFrame(loop);
    return true;
  };

  O.setLabel = function (id, el) {
    labels[id] = el;
    el.addEventListener("click", () => onPick && onPick(id));
  };
  O.setWorking = function (id, v) { if (states[id]) states[id].want = !!v; };
  O.setWaiting = function (id, v) { if (states[id]) states[id].waiting = !!v; };
  O.isAtDesk = function (id) { return !!states[id] && states[id].mode === "seated"; };
  // 告诉场景右侧和底部被界面挡住了多少像素，镜头会把场景挪到剩余的可见区域中央
  O.setInset = function (right, bottom) { inset.tx = right; inset.ty = bottom; };
  O.celebrate = function (id) {
    if (states[id]) states[id].jump = 1;
    if (brain) brain.userData.pulse = Math.max(brain.userData.pulse, 0.6);
  };
  O.handoff = function (fromId, toId) {
    if (O.ready && states[fromId] && states[toId]) spawnFlight(states[fromId], states[toId]);
  };
  // 大脑标签（文字由 app 按当前语言传入）
  O.setBrainText = function (titleText, subText) {
    if (!brainEl) return;
    const key = titleText + "|" + subText;
    if (key === brainKey) return;
    brainKey = key;
    const title = document.createElement("b");
    title.textContent = titleText;
    const sub = document.createElement("span");
    sub.textContent = subText;
    brainEl.replaceChildren(title, sub);
  };
  O.setTeamLabel = function (id, nameText, countText) {
    const e = teamEls[id];
    if (!e) return;
    if (e.name.textContent !== nameText) e.name.textContent = nameText;
    if (e.cnt.textContent !== countText) e.cnt.textContent = countText;
  };
  O.setAgentColor = function (id, color) {
    const s = states[id];
    if (!s) return;
    const c = hex(color);
    s.color = color;
    s.shirt.color.setHex(c);
    s.accent.color.setHex(c);
    s.ring.material.color.setHex(c);
    s.dirty = true;
  };
  let selectedId = null;
  O.setSelected = function (id) {
    selectedId = id;
    for (const k in states) states[k].ring.visible = k === id;
  };
  O.getLayout = function () {
    return { radius: ISLAND_RADIUS, islands: islands.map(i => ({ id: i.id, x: i.x, z: i.z, color: i.color })), brain: { x: BRAIN_POS[0], z: BRAIN_POS[2] } };
  };
  // 镜头飞到某座岛 / 大脑 / 全景
  O.focus = function (which) {
    if (!O.ready) return;
    let target, offset;
    const isl = islands.find(i => i.id === which);
    if (which === "brain") { target = new THREE.Vector3(BRAIN_POS[0], 1.2, BRAIN_POS[2]); offset = new THREE.Vector3(0, 11, 7.5); }
    else if (isl) { target = new THREE.Vector3(isl.x, 0.5, isl.z); offset = new THREE.Vector3(Math.sin(isl.angle) * 11, 11, Math.cos(isl.angle) * 11); }
    else { target = new THREE.Vector3(...HOME_TARGET); offset = new THREE.Vector3(HOME_POS[0] - HOME_TARGET[0], HOME_POS[1] - HOME_TARGET[1], HOME_POS[2] - HOME_TARGET[2]); }
    tween = {
      t: 0, dur: 0.9,
      fromP: camera.position.clone(), fromT: controls.target.clone(),
      toP: target.clone().add(offset), toT: target,
    };
  };

  // ---- 员工标签：放在头顶，互相重叠时往上叠成一列 ----
  // 先放重要的（等你回复的、选中的、正在干活的、离镜头近的），后放的遇到重叠就挪到挡住它的标签上面；
  // 挪得太远还放不下的闲置标签先隐藏。标签大小每半秒量一次（每帧都量会拖慢渲染）。
  const labelSize = {};
  let sizeAt = 0, topLimit = 122;
  function placeLabels(w, h, fixed) {
    const now = performance.now();
    const remeasure = now - sizeAt > 500;
    if (remeasure) {
      sizeAt = now;
      // 顶栏（中间那排标签页）下面才算可用区域：按它实际的位置算，窗口大小变了也对
      const bar = document.getElementById("tabs");
      topLimit = bar ? Math.max(40, bar.getBoundingClientRect().bottom - container.getBoundingClientRect().top + 8) : 122;
    }
    const items = [];
    for (const id in labels) {
      const s = states[id];
      if (!s) continue;
      s.group.getWorldPosition(tmp);
      tmp.y += 2.45 + 0.35 * (1 - s.sit);
      const p = project(tmp.clone(), w, h);
      const el = labels[id];
      if (!p.visible) { el.style.display = "none"; continue; }
      if (remeasure || !labelSize[id]) {
        if (el.style.display === "none") el.style.display = "";
        el.classList.remove("mini");   // 按完整大小量
        labelSize[id] = { w: el.offsetWidth || LABEL_HALF_W * 2, h: el.offsetHeight || 36 };
      }
      const size = labelSize[id];
      const half = size.w / 2;
      const cls = el.classList;
      const prio = cls.contains("waiting") ? 4 : id === selectedId ? 3 : cls.contains("working") ? 2 : 1;
      items.push({ id, el, prio, depth: tmp.distanceToSquared(camera.position), w: size.w, h: size.h,
        x: Math.min(w - half - 4, Math.max(half + 4, p.x)),   // 不超出画面左右边缘
        y: Math.max(p.y, topLimit + 6) });                     // 留出顶栏的高度
    }
    items.sort((a, b) => b.prio - a.prio || a.depth - b.depth);
    const placed = (fixed || []).slice();
    const hit = (x, y, it) => placed.find(r => x - it.w / 2 < r.r && x + it.w / 2 > r.l && y - it.h < r.b && y > r.t);
    const TOP = topLimit;
    const fits = (it, y, other) => !other && it.y - y <= 120 && y - it.h >= TOP;
    const settle = it => { let y = it.y, tries = 0, other; while ((other = hit(it.x, y, it)) && tries < 6) { y = other.t - 3; tries++; } return { y, other }; };
    for (const it of items) {
      let { y, other } = settle(it);
      // 闲置的放不下：先缩成只有头像的小圆点再试；还放不下才隐藏。正在干活的一定显示，停在顶栏下面
      let mini = false;
      if (it.prio === 1 && !fits(it, y, other)) {
        mini = true;
        Object.assign(it, { w: 26, h: 26 });
        ({ y, other } = settle(it));
      }
      it.el.classList.toggle("mini", mini);
      const hidden = it.prio === 1 && !fits(it, y, other);
      it.el.style.display = hidden ? "none" : "";
      if (hidden) continue;
      if (y - it.h < TOP) y = TOP + it.h;
      placed.push({ l: it.x - it.w / 2, r: it.x + it.w / 2, t: y - it.h, b: y });
      it.el.style.transform = `translate(${it.x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  }

  // ---- 主循环 ----
  function project(worldPos, w, h) {
    tmp.copy(worldPos).project(camera);
    return { x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h, visible: tmp.z < 1 };
  }

  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;

    for (const isl of islands) isl.group.position.y = Math.sin(t * 0.7 + isl.phase) * 0.12;   // 岛在轻轻漂浮
    for (const id in states) updateAgent(states[id], dt, t);

    // 大脑：旋转、呼吸、被文件触发时脉冲
    const bu = brain.userData;
    bu.pulse = Math.max(0, bu.pulse - dt * 0.9);
    brain.position.y = BRAIN_POS[1] + Math.sin(t * 0.9) * 0.15;
    bu.shell.rotation.y = t * 0.3; bu.shell.rotation.x = t * 0.15;
    bu.ring1.rotation.z = t * 0.5; bu.ring2.rotation.z = -t * 0.4;
    bu.core.material.emissiveIntensity = 0.9 + Math.sin(t * 2) * 0.15 + bu.pulse * 1.8;
    bu.shell.scale.setScalar(1 + bu.pulse * 0.15);

    for (const l of links) {
      l.t = (l.t + dt * l.speed) % 1;
      l.dot.position.copy(l.curve.getPoint(l.t));
      l.dot.material.color.copy(l.color).lerp(WHITE, 0.55 + Math.sin(l.t * Math.PI) * 0.35);
    }

    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i];
      f.t += dt / f.dur;
      if (f.t >= 1) { scene.remove(f.group); flights.splice(i, 1); continue; }
      // 二次贝塞尔：发送者 -> 大脑上空 -> 接收者
      const u = f.t, k = 1 - u;
      f.group.position.set(
        k * k * f.a.x + 2 * k * u * f.c.x + u * u * f.b.x,
        k * k * f.a.y + 2 * k * u * f.c.y + u * u * f.b.y,
        k * k * f.a.z + 2 * k * u * f.c.z + u * u * f.b.z);
      f.group.rotation.y = u * Math.PI * 4;
      if (!f.pulsed && u > 0.5) { f.pulsed = true; bu.pulse = 1; }
    }

    const w = container.clientWidth, h = container.clientHeight;
    const ki = 1 - Math.exp(-dt * 8);
    inset.x += (inset.tx - inset.x) * ki;
    inset.y += (inset.ty - inset.y) * ki;
    camera.setViewOffset(w, h, inset.x / 2, inset.y / 2, w, h);

    if (tween) {
      tween.t += dt / tween.dur;
      const u = Math.min(1, tween.t), k = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;   // easeInOutQuad
      camera.position.lerpVectors(tween.fromP, tween.toP, k);
      controls.target.lerpVectors(tween.fromT, tween.toT, k);
      if (u >= 1) tween = null;
    }

    controls.update();
    renderer.render(scene, camera);

    // 组名、大脑这些固定标签先放，员工标签再绕开它们
    const fixed = [];
    for (const a of anchors) {
      tmp.copy(a.off);
      a.obj.localToWorld(tmp);
      const p = project(tmp.clone(), w, h);
      a.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, ${a.below ? "0" : "-100%"})`;
      a.el.style.display = p.visible ? "" : "none";
      if (!p.visible) continue;
      if (!a.size || performance.now() - sizeAt > 500) a.size = { w: a.el.offsetWidth, h: a.el.offsetHeight };
      const top = a.below ? p.y : p.y - a.size.h;
      fixed.push({ l: p.x - a.size.w / 2, r: p.x + a.size.w / 2, t: top, b: top + a.size.h });
    }
    placeLabels(w, h, fixed);
  }
})();
