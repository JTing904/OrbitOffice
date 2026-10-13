"""MyAIOffice 的全部 3D 素材，用 Blender 生成并导出为 GLB。

运行（在仓库根目录）：
    blender -b --factory-startup --python tools/blender/build_models.py -- assets/models [预览图目录]

约定：
- 坐标按 three.js 的习惯书写（x 右、y 上、z 朝前），P()/S() 负责换算成 Blender 坐标；
  这样这里的数字和 office3d.js 里的数字一一对应。1 单位 = 1 米左右。
- 节点名就是 office3d.js 查找的名字（Body / Head / ArmL / HipL / KneeL / Screen / Core …），不要带点号。
- 需要在网页里按员工或团队换色的材质，用固定的材质名（Shirt / Accent / TileA / Rim …）。
"""
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else "assets/models")
PREVIEW = os.path.abspath(argv[1]) if len(argv) > 1 else None
os.makedirs(OUT, exist_ok=True)
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)

P = lambda x, y, z: (x, -z, y)      # three.js 位置 -> Blender 位置
S = lambda w, h, d: (w, d, h)       # three.js 尺寸（宽、高、深）-> Blender 尺寸


# ---------- 基础工具 ----------
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgba(hexstr):
    h = hexstr.lstrip("#")
    return tuple(lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


def mat(name, hexstr, rough=0.7, emit=None, metal=0.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = rgba(hexstr)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = rgba(emit)
        b.inputs["Emission Strength"].default_value = 1.0
    return m


def link(obj, parent=None, loc=(0, 0, 0)):
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    obj.location = P(*loc)
    return obj


def empty(name, loc=(0, 0, 0), parent=None):
    return link(bpy.data.objects.new(name, None), parent, loc)


def mesh_obj(name, bm, material, parent, loc, smooth=True, bevel=0.0, segs=3):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    me.materials.append(material)
    obj = link(bpy.data.objects.new(name, me), parent, loc)
    if bevel > 0:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segs
        mod.limit_method = "ANGLE"
        obj.modifiers.new("WN", "WEIGHTED_NORMAL").keep_sharp = True
    return obj


def box(name, size, loc, material, parent=None, bevel=0.03, segs=3, rot_y=0.0):
    """size / loc 都是 three.js 写法；rot_y 绕竖直轴旋转（弧度）。"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    sx, sy, sz = S(*size)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if rot_y:
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(rot_y, 3, "Z"), verts=bm.verts)
    return mesh_obj(name, bm, material, parent, loc, bevel=min(bevel, min(sx, sy, sz) * 0.45), segs=segs)


def sphere(name, r, loc, material, parent=None, scale=(1, 1, 1), segs=24, rings=14):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    bmesh.ops.scale(bm, vec=S(*scale), verts=bm.verts)
    return mesh_obj(name, bm, material, parent, loc)


def ico(name, r, loc, material, parent=None, sub=1, smooth=False, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    bmesh.ops.scale(bm, vec=S(*scale), verts=bm.verts)
    return mesh_obj(name, bm, material, parent, loc, smooth=smooth)


def cyl(name, r, h, loc, material, parent=None, r_top=None, segs=24, smooth=True, bevel=0.0, axis="y"):
    """竖直圆柱 / 圆台（r 为底部半径，r_top 为顶部半径）。axis='x' 或 'z' 时横放。"""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r if r_top is None else r_top, depth=h)
    if axis == "x":
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Y"), verts=bm.verts)
    elif axis == "z":
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "X"), verts=bm.verts)
    obj = mesh_obj(name, bm, material, parent, loc, smooth=smooth, bevel=bevel, segs=2)
    if smooth and not bevel:
        obj.data.set_sharp_from_angle(angle=math.radians(40))   # 圆柱侧面平滑、端面保持硬边
    return obj


def capsule(name, r, length, loc, material, parent=None, segs=16, axis="y"):
    """胶囊体（总长 length，含两端半球），loc 是中心。axis='x'/'z' 时横放。"""
    bm = bmesh.new()
    half = max(length / 2 - r, 0.001)
    bmesh.ops.create_cone(bm, cap_ends=False, segments=segs, radius1=r, radius2=r, depth=half * 2)
    for z in (-half, half):
        ball = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=8, radius=r)
        bmesh.ops.translate(bm, vec=(0, 0, z), verts=ball["verts"])
    if axis == "x":
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Y"), verts=bm.verts)
    elif axis == "z":
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "X"), verts=bm.verts)
    return mesh_obj(name, bm, material, parent, loc)


def torus(name, R, r, loc, material, parent=None, axis="y", major=64, minor=10):
    """圆环。axis 是圆环的轴线方向（three.js 坐标）：'y' 平放，'z' 立起来正对前方，'x' 立起来朝侧面。"""
    bm = bmesh.new()
    verts = []
    for i in range(major):
        a = 2 * math.pi * i / major
        ring = []
        for j in range(minor):
            b = 2 * math.pi * j / minor
            rr = R + r * math.cos(b)
            ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), r * math.sin(b))))   # 轴线 = Blender Z = three y
        verts.append(ring)
    for i in range(major):
        for j in range(minor):
            a, b = verts[i], verts[(i + 1) % major]
            bm.faces.new((a[j], b[j], b[(j + 1) % minor], a[(j + 1) % minor]))
    if axis == "z":
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "X"), verts=bm.verts)
    elif axis == "x":
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Y"), verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, material, parent, loc)


def export(name):
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=False,
                              export_apply=True, export_yup=True, export_cameras=False, export_lights=False)
    print("EXPORTED", name, os.path.getsize(path), "bytes")
    if PREVIEW:
        render_preview(name)


def render_preview(name):
    sc = bpy.context.scene
    pts = [o.matrix_world @ Vector(c) for o in sc.objects if o.type == "MESH" for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center, size = (lo + hi) / 2, max((hi - lo).length, 0.5)
    cam = bpy.data.objects.new("PreviewCam", bpy.data.cameras.new("PreviewCam"))
    sc.collection.objects.link(cam)
    cam.location = center + Vector((0.75, -1.0, 0.7)).normalized() * size * 1.25
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 50
    sc.camera = cam
    for loc, energy in (((4, -6, 9), 4.0), ((-6, -2, 4), 1.5)):
        light = bpy.data.objects.new("PreviewSun", bpy.data.lights.new("PreviewSun", "SUN"))
        light.data.energy = energy
        sc.collection.objects.link(light)
        light.rotation_euler = (center - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    world = bpy.data.worlds.new("W")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.02, 0.025, 0.06, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    sc.world = world
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = 900, 700
    sc.render.filepath = os.path.join(PREVIEW, name + ".png")
    bpy.ops.render.render(write_still=True)


# ---------- 角色 ----------
def build_character():
    reset()
    shirt, skin, hair = mat("Shirt", "#4c8fd9"), mat("Skin", "#f2c9a0", 0.6), mat("Hair", "#2b2118", 0.8)
    pants, shoes, eye, dark = mat("Pants", "#39424e"), mat("Shoes", "#1c1f26", 0.5), mat("Eye", "#15171c", 0.3), mat("Dark", "#22252b", 0.4)

    root = empty("Char")
    body = empty("Body", parent=root)
    sphere("Torso", 0.5, (0, 1.28, 0), shirt, body, scale=(0.68, 0.84, 0.5), segs=28, rings=18)
    sphere("Hips", 0.5, (0, 0.95, 0), pants, body, scale=(0.6, 0.3, 0.45), segs=24, rings=12)
    cyl("Neck", 0.09, 0.14, (0, 1.66, 0), skin, body)

    head = empty("Head", (0, 1.9, 0), body)
    sphere("Skull", 0.31, (0, 0.03, 0), skin, head, scale=(1, 1.02, 1), segs=28, rings=18)
    sphere("HairTop", 0.318, (0, 0.12, -0.04), hair, head, scale=(1.04, 0.86, 1.06), segs=28, rings=18)
    sphere("Fringe", 0.2, (0, 0.24, 0.17), hair, head, scale=(1.2, 0.45, 0.7), segs=18, rings=10)
    for sx in (-1, 1):
        sphere("Ear", 0.06, (sx * 0.305, 0.0, 0), skin, head, segs=12, rings=8)
        sphere("Eye", 0.045, (sx * 0.115, 0.02, 0.278), eye, head, scale=(1, 1.25, 0.6), segs=12, rings=8)
        sphere("Cheek", 0.05, (sx * 0.19, -0.07, 0.235), mat("Cheek", "#f0a8a0", 0.7), head, scale=(1, 0.6, 0.4), segs=10, rings=6)
    sphere("Nose", 0.03, (0, -0.04, 0.305), skin, head, segs=10, rings=6)

    # 可选配饰：网页里按员工显示 / 隐藏
    glasses = empty("AccGlasses", parent=head)
    for sx in (-1, 1):
        torus("Lens", 0.085, 0.014, (sx * 0.115, 0.02, 0.3), dark, glasses, axis="z", major=24, minor=6)
    capsule("Bridge", 0.012, 0.08, (0, 0.03, 0.305), dark, glasses, segs=8, axis="x")
    headset = empty("AccHeadset", parent=head)
    torus("Band", 0.325, 0.024, (0, 0.05, 0), dark, headset, axis="z", major=32, minor=6)
    for sx in (-1, 1):
        sphere("Cup", 0.1, (sx * 0.32, 0.0, 0), dark, headset, scale=(0.5, 1, 1), segs=16, rings=10)
    capsule("Mic", 0.016, 0.24, (-0.29, -0.12, 0.13), dark, headset, segs=8, axis="z")
    cap = empty("AccCap", parent=head)
    cap_mat = mat("Cap", "#eef1f6", 0.7)
    sphere("CapDome", 0.325, (0, 0.15, -0.01), cap_mat, cap, scale=(1.05, 0.7, 1.07), segs=28, rings=14)
    sphere("CapBrim", 0.2, (0, 0.14, 0.31), cap_mat, cap, scale=(1.05, 0.12, 0.9), segs=20, rings=8)
    tie = empty("AccTie", parent=body)
    sphere("Tie", 0.2, (0, 1.36, 0.235), mat("Tie", "#b3364a", 0.6), tie, scale=(0.26, 0.95, 0.1), segs=14, rings=10)

    for name, sx in (("ArmL", -1), ("ArmR", 1)):
        arm = empty(name, (sx * 0.4, 1.56, 0), body)
        capsule("Sleeve", 0.095, 0.66, (0, -0.24, 0), shirt, arm)
        sphere("Hand", 0.092, (0, -0.63, 0), skin, arm, segs=14, rings=10)

    for hip_name, knee_name, sx in (("HipL", "KneeL", -1), ("HipR", "KneeR", 1)):
        hip = empty(hip_name, (sx * 0.17, 0.87, 0), body)
        capsule("Thigh", 0.12, 0.6, (0, -0.2, 0), pants, hip)
        knee = empty(knee_name, (0, -0.42, 0), hip)
        capsule("Shin", 0.105, 0.52, (0, -0.17, 0), pants, knee)
        sphere("Shoe", 0.5, (0, -0.39, 0.07), shoes, knee, scale=(0.25, 0.15, 0.4), segs=18, rings=10)
    export("character")


# ---------- 工位 ----------
def screen_plane(name, w, h, loc, material, parent):
    """朝前（three +z）的平面，UV 铺满，供网页贴动态画面。"""
    bm = bmesh.new()
    vs = [bm.verts.new(c) for c in ((-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2))]
    face = bm.faces.new(vs)
    uv = bm.loops.layers.uv.new("UVMap")
    for loop, co in zip(face.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = co
    return mesh_obj(name, bm, material, parent, loc, smooth=False)


def build_desk():
    reset()
    wood, metal, dark = mat("Wood", "#c9a57a", 0.6), mat("Metal", "#5b6068", 0.4, metal=0.6), mat("Dark", "#22252b", 0.4)
    white, key = mat("White", "#eef1f6", 0.5), mat("Key", "#3a3f48", 0.6)
    root = empty("Desk")
    box("Top", (2.5, 0.09, 1.2), (0, 0.84, 0), wood, root, bevel=0.045, segs=5)
    for sx in (-1, 1):
        for sz in (-1, 1):
            capsule("Leg", 0.04, 0.84, (sx * 1.1, 0.4, sz * 0.46), metal, root, segs=12)
        capsule("Foot", 0.04, 1.0, (sx * 1.1, 0.04, 0), metal, root, segs=12, axis="z")
    capsule("Beam", 0.03, 2.2, (0, 0.6, -0.46), metal, root, segs=10, axis="x")
    box("Drawer", (0.5, 0.42, 0.8), (-0.8, 0.59, -0.02), white, root, bevel=0.09, segs=5)
    capsule("Handle", 0.016, 0.22, (-0.8, 0.66, 0.39), metal, root, segs=8, axis="x")

    cyl("MonBase", 0.2, 0.03, (0, 0.9, -0.32), dark, root, segs=28, bevel=0.012)
    cyl("MonNeck", 0.04, 0.34, (0, 1.07, -0.34), dark, root, segs=12)
    box("MonBody", (1.24, 0.78, 0.07), (0, 1.55, -0.325), dark, root, bevel=0.034, segs=5)
    screen_plane("Screen", 1.14, 0.68, (0, 1.55, -0.288), mat("Screen", "#0a0d11", 0.3), root)

    box("Keyboard", (0.7, 0.035, 0.24), (0, 0.9, 0.3), dark, root, bevel=0.017, segs=4)
    box("Keys", (0.64, 0.012, 0.18), (0, 0.918, 0.3), key, root, bevel=0.004)
    sphere("Mouse", 0.05, (0.52, 0.905, 0.3), dark, root, scale=(0.8, 0.45, 1.25), segs=14, rings=8)
    cyl("Mug", 0.065, 0.13, (-0.95, 0.95, 0.2), white, root, segs=18)
    torus("MugHandle", 0.04, 0.012, (-1.02, 0.95, 0.2), white, root, axis="z", major=16, minor=6)
    box("Notebook", (0.36, 0.05, 0.26), (0.85, 0.91, 0.3), mat("Accent", "#4c8fd9", 0.6), root, bevel=0.024, segs=4)
    cyl("LampBase", 0.1, 0.03, (1.02, 0.9, -0.36), dark, root, segs=18)
    cyl("LampPole", 0.018, 0.5, (1.02, 1.16, -0.36), metal, root, segs=8)
    capsule("LampHead", 0.06, 0.36, (0.9, 1.42, -0.34), dark, root, segs=14, axis="x")
    capsule("LampGlow", 0.035, 0.28, (0.9, 1.385, -0.34), mat("LampGlow", "#fff1c9", 0.4, emit="#ffe9a8"), root, segs=10, axis="x")
    export("desk")


def build_chair():
    reset()
    fabric, metal = mat("ChairFabric", "#343a44", 0.85), mat("ChairMetal", "#1d2026", 0.4, metal=0.5)
    root = empty("Chair")
    sphere("Seat", 0.5, (0, 0.37, 0), fabric, root, scale=(0.84, 0.17, 0.84), segs=28, rings=12)
    sphere("Back", 0.5, (0, 0.86, -0.38), fabric, root, scale=(0.78, 0.72, 0.16), segs=28, rings=14)
    box("Spine", (0.08, 0.34, 0.04), (0, 0.52, -0.43), metal, root, bevel=0.012)
    for sx in (-1, 1):
        capsule("ArmPad", 0.035, 0.42, (sx * 0.43, 0.6, -0.02), metal, root, segs=10, axis="z")
        capsule("ArmPost", 0.022, 0.24, (sx * 0.43, 0.49, -0.1), metal, root, segs=8)
    cyl("Pole", 0.04, 0.28, (0, 0.2, 0), metal, root, segs=12)
    for i in range(5):
        a = i * 2 * math.pi / 5
        box("BaseLeg", (0.07, 0.05, 0.36), (math.sin(a) * 0.18, 0.06, math.cos(a) * 0.18), metal, root, bevel=0.024, segs=4, rot_y=a)
        sphere("Caster", 0.04, (math.sin(a) * 0.36, 0.04, math.cos(a) * 0.36), metal, root, segs=10, rings=6)
    export("chair")


# ---------- 团队岛（三种不同的办公室）----------
W, D = 8.8, 6.4   # 岛的宽和进深；工位在 (±2.2, -1.4)，走道 z=0.9，休息点在 x=±3.2、z=1.7~2.7，陈设要避开这些位置


def island_base(tiles_x, tiles_z):
    """平台、地砖、发光边框、矮隔断、岩石底。返回根节点。"""
    side, rim = mat("Side", "#1a2240", 0.8), mat("Rim", "#2fbf8f", 0.4, emit="#2fbf8f")
    tile_a, tile_b = mat("TileA", "#1f5a55", 0.85), mat("TileB", "#236b63", 0.85)
    root = empty("Island")
    box("Slab", (W, 0.5, D), (0, -0.29, 0), side, root, bevel=0.05)
    tw, td = W / tiles_x, D / tiles_z
    for i in range(tiles_x):
        for j in range(tiles_z):
            box("Tile", (tw - 0.03, 0.04, td - 0.03), (-W / 2 + tw * (i + 0.5), -0.02, -D / 2 + td * (j + 0.5)),
                tile_a if (i + j) % 2 else tile_b, root, bevel=0.02, segs=3)
    for sz in (-1, 1):
        box("RimZ", (W + 0.12, 0.08, 0.12), (0, 0.02, sz * D / 2), rim, root, bevel=0.02)
    for sx in (-1, 1):
        box("RimX", (0.12, 0.08, D), (sx * W / 2, 0.02, 0), rim, root, bevel=0.02)
    # 矮隔断：不挡视线，从任何角度都能看到员工
    box("WallBack", (W, 0.95, 0.18), (0, 0.475, -D / 2 + 0.1), mat("Wall", "#1c4a4a", 0.8), root, bevel=0.085, segs=5)
    capsule("WallTop", 0.045, W - 0.3, (0, 0.97, -D / 2 + 0.1), rim, root, segs=10, axis="x")

    rock = mat("Rock", "#1a1f3a", 1.0)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=4, radius1=0.28, radius2=1.0, depth=1.6)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 4, 3, "Z"), verts=bm.verts)
    bmesh.ops.scale(bm, vec=(W / 2 * 0.93, D / 2 * 0.93, 1), verts=bm.verts)
    mesh_obj("Rock", bm, rock, root, (0, -0.5 - 0.8, 0), smooth=False)
    for i in range(5):
        x, z = random.uniform(-2.6, 2.6), random.uniform(-1.8, 1.8)
        h = random.uniform(0.5, 1.1)
        cyl("Stalactite", 0.05, h, (x, -2.0 - h / 2 + 0.4, z), rock, root, r_top=random.uniform(0.3, 0.5), segs=5, smooth=False)
    return root


def plant_at(root, x, z, scale=1.0):
    cyl("Pot", 0.22 * scale, 0.45 * scale, (x, 0.225 * scale, z), mat("Terracotta", "#b5651d", 0.8), root, r_top=0.3 * scale, segs=14)
    leaf = mat("Leaf", "#3f9d6c", 0.8)
    for i in range(7):
        a, up = i * 2.4, (0.62 + i * 0.12) * scale
        ico("Leaf", (0.25 - i * 0.018) * scale, (x + math.sin(a) * 0.16 * scale, up, z + math.cos(a) * 0.16 * scale), leaf, root, sub=3, smooth=True, scale=(1, 0.85, 1))


def sofa_at(root, x, z):
    fab, fab2 = mat("SofaFabric", "#4d6d92", 0.9), mat("SofaCushion", "#6f93bd", 0.9)
    box("SofaBase", (0.9, 0.4, 2.2), (x, 0.22, z), fab, root, bevel=0.16, segs=5)
    box("SofaBack", (0.34, 0.85, 2.2), (x + 0.36, 0.56, z), fab, root, bevel=0.15, segs=5)
    for sz in (-1, 1):
        box("SofaArm", (0.9, 0.62, 0.28), (x, 0.33, z + sz * 1.1), fab, root, bevel=0.125, segs=5)
        sphere("Cushion", 0.5, (x - 0.08, 0.47, z + sz * 0.48), fab2, root, scale=(0.64, 0.2, 0.94), segs=22, rings=10)
    sphere("Pillow", 0.5, (x + 0.14, 0.7, z + 0.55), mat("Pillow", "#e8a33d", 0.9), root, scale=(0.18, 0.38, 0.38), segs=18, rings=10)


def build_island_product():
    """创意工作室：白板 + 便利贴、书架、咖啡吧、沙发、地毯。"""
    reset()
    random.seed(7)
    dark, white, metal = mat("Dark", "#22252b", 0.4), mat("White", "#eef1f6", 0.5), mat("Metal", "#5b6068", 0.4, metal=0.6)
    root = island_base(4, 3)

    # 带轮白板，立在两张桌子之间的后方
    for sx in (-1, 1):
        capsule("BoardLeg", 0.03, 1.9, (sx * 1.0, 0.95, -2.55), metal, root, segs=10)
        capsule("BoardFoot", 0.03, 0.6, (sx * 1.0, 0.04, -2.55), metal, root, segs=10, axis="z")
    box("Board", (2.2, 1.15, 0.05), (0, 1.45, -2.55), white, root, bevel=0.024, segs=4)
    notes = ["#ffd166", "#ef476f", "#06d6a0", "#8ecae6", "#ffd166", "#c77dff"]
    for i, c in enumerate(notes):
        box("Note", (0.2, 0.2, 0.012), (-0.75 + (i % 3) * 0.42 + random.uniform(-0.04, 0.04), 1.68 - (i // 3) * 0.36, -2.52),
            mat("Note" + str(i), c, 0.8), root, bevel=0.004)

    # 书架（左后角）
    wood = mat("ShelfWood", "#b08a5e", 0.7)
    box("Shelf", (0.9, 1.7, 0.36), (-3.75, 0.85, -2.7), wood, root, bevel=0.03, segs=3)
    books = ["#ef476f", "#118ab2", "#ffd166", "#06d6a0", "#8338ec", "#f77f00"]
    for row in range(3):
        for k in range(5):
            box("Book", (0.1, 0.3 + random.uniform(-0.05, 0.04), 0.22), (-4.05 + k * 0.15, 0.38 + row * 0.5, -2.56),
                mat("Book" + str((row + k) % 6), books[(row + k) % 6], 0.7), root, bevel=0.012)
    plant_at(root, 3.8, -2.6)

    # 咖啡吧（左前）
    box("Counter", (0.7, 0.86, 1.6), (-4.0, 0.43, 2.2), mat("CounterWood", "#8a6a4a", 0.7), root, bevel=0.1, segs=5)
    box("CounterTop", (0.78, 0.06, 1.68), (-4.0, 0.885, 2.2), white, root, bevel=0.03, segs=4)
    box("Machine", (0.4, 0.5, 0.36), (-4.0, 1.16, 1.9), dark, root, bevel=0.11, segs=5)
    sphere("MachineTop", 0.5, (-4.0, 1.43, 1.9), mat("CoffeeRed", "#c0392b", 0.5), root, scale=(0.42, 0.14, 0.38), segs=20, rings=10)
    for z in (2.4, 2.6, 2.8):
        cyl("Cup", 0.05, 0.09, (-3.98, 0.955, z), white, root, segs=12)

    # 沙发 + 圆地毯（右前）
    cyl("Rug", 1.25, 0.02, (2.6, 0.012, 2.1), mat("Rug", "#e9c46a", 0.95), root, segs=40)
    sofa_at(root, 3.95, 2.2)
    export("island_product")


def build_island_quality():
    """测试实验室：数据大屏、设备测试台、饮水机、懒人沙发。"""
    reset()
    random.seed(11)
    dark, white, metal = mat("Dark", "#22252b", 0.4), mat("White", "#eef1f6", 0.5), mat("Metal", "#5b6068", 0.4, metal=0.6)
    root = island_base(8, 1)   # 长条地板

    # 数据大屏：立柱 + 三块发光图表屏（两张桌子之间的后方）
    for sx in (-1, 1):
        capsule("ScreenPost", 0.04, 2.1, (sx * 1.25, 1.05, -2.6), metal, root, segs=10)
    box("BigScreen", (2.9, 1.2, 0.08), (0, 1.55, -2.6), dark, root, bevel=0.036, segs=4)
    bars = [("#3ddc97", 0.55), ("#3ddc97", 0.8), ("#ffd166", 0.4), ("#3ddc97", 0.7), ("#ef476f", 0.3), ("#3ddc97", 0.9), ("#5b86ff", 0.6), ("#5b86ff", 0.75)]
    for i, (c, h) in enumerate(bars):
        box("Bar", (0.2, h * 0.8, 0.02), (-1.12 + i * 0.32, 1.08 + h * 0.4, -2.55), mat("Bar" + c, c, 0.4, emit=c), root, bevel=0.006)

    # 设备测试台（左前）：台面上立着几台手机 / 平板
    box("Bench", (0.75, 0.06, 1.7), (-3.95, 0.86, 2.2), white, root, bevel=0.028, segs=4)
    for sz in (-1, 1):
        capsule("BenchLeg", 0.035, 0.86, (-3.95, 0.42, 2.2 + sz * 0.72), metal, root, segs=10)
    for i, (z, w, h) in enumerate(((1.65, 0.16, 0.3), (2.05, 0.3, 0.4), (2.5, 0.16, 0.3), (2.85, 0.16, 0.3))):
        box("Device", (0.03, h, w), (-3.98, 0.9 + h / 2, z), dark, root, bevel=0.012)
        box("DeviceGlow", (0.012, h - 0.05, w - 0.04), (-3.955, 0.9 + h / 2, z), mat("DeviceGlow" + str(i % 2), ("#8ecae6", "#b7e4c7")[i % 2], 0.3, emit=("#8ecae6", "#b7e4c7")[i % 2]), root, bevel=0.003)

    # 饮水机（左后角）
    box("Cooler", (0.42, 1.0, 0.42), (-3.9, 0.5, -2.6), white, root, bevel=0.09, segs=5)
    capsule("Bottle", 0.17, 0.52, (-3.9, 1.25, -2.6), mat("Water", "#8ecae6", 0.2), root, segs=16)
    plant_at(root, 3.8, -2.6, 0.9)

    # 懒人沙发 + 小圆桌（右前）
    sphere("BeanBag1", 0.5, (3.7, 0.3, 1.6), mat("BeanA", "#5b86ff", 0.95), root, scale=(1.05, 0.62, 1.05), segs=22, rings=12)
    sphere("BeanBag2", 0.5, (3.75, 0.28, 2.8), mat("BeanB", "#9db4ff", 0.95), root, scale=(1.0, 0.58, 1.0), segs=22, rings=12)
    cyl("SideTable", 0.3, 0.04, (2.75, 0.42, 2.2), white, root, segs=24, bevel=0.012)
    capsule("SideTableLeg", 0.03, 0.42, (2.75, 0.21, 2.2), metal, root, segs=10)
    export("island_quality")


def build_island_engineering():
    """机房：服务器机柜（带指示灯）、工具柜、高脚桌和凳子、货箱。"""
    reset()
    random.seed(23)
    dark, white, metal = mat("Dark", "#22252b", 0.4), mat("White", "#eef1f6", 0.5), mat("Metal", "#5b6068", 0.4, metal=0.6)
    root = island_base(2, 2)   # 大块地砖

    # 服务器机柜：后方两角各两台，中间留空
    rack = mat("Rack", "#14171d", 0.5, metal=0.3)
    leds = [mat("LedG", "#062b16", 0.4, emit="#3ddc97"), mat("LedA", "#2b2206", 0.4, emit="#ffd166"), mat("LedB", "#06172b", 0.4, emit="#5b86ff")]
    for x in (-3.85, -3.15, 3.15, 3.85):
        box("ServerRack", (0.62, 1.9, 0.6), (x, 0.95, -2.55), rack, root, bevel=0.035, segs=3)
        for row in range(7):
            box("RackSlot", (0.5, 0.03, 0.02), (x, 0.3 + row * 0.24, -2.245), metal, root, bevel=0.006)
            for k in range(3):
                box("Led", (0.035, 0.035, 0.02), (x - 0.18 + k * 0.08, 0.38 + row * 0.24, -2.24), random.choice(leds), root, bevel=0.006)
    # 机柜之间的地面光带
    box("FloorGlow", (4.6, 0.02, 0.1), (0, 0.006, -2.55), mat("Rim", "#2fbf8f", 0.4, emit="#2fbf8f"), root, bevel=0.006)

    # 工具柜（左前）
    box("Cabinet", (0.7, 1.5, 1.5), (-4.0, 0.75, 2.2), mat("CabinetRed", "#b23a48", 0.6), root, bevel=0.07, segs=4)
    for row in range(4):
        box("CabinetDrawer", (0.02, 0.26, 1.34), (-3.645, 0.3 + row * 0.33, 2.2), mat("CabinetFace", "#8f2d3a", 0.6), root, bevel=0.008)
        capsule("CabinetHandle", 0.018, 0.5, (-3.62, 0.36 + row * 0.33, 2.2), metal, root, segs=8, axis="z")

    # 高脚桌 + 两张凳子（右前）
    cyl("HighTable", 0.55, 0.05, (3.75, 1.05, 2.2), mat("TableWood", "#c9a57a", 0.6), root, segs=32, bevel=0.016)
    capsule("HighTableLeg", 0.04, 1.05, (3.75, 0.52, 2.2), metal, root, segs=12)
    cyl("HighTableFoot", 0.32, 0.03, (3.75, 0.015, 2.2), metal, root, segs=24)
    for z in (1.35, 3.0):
        cyl("Stool", 0.2, 0.06, (3.9, 0.66, z), dark, root, segs=20, bevel=0.02)
        capsule("StoolLeg", 0.03, 0.66, (3.9, 0.33, z), metal, root, segs=10)

    # 货箱（中间后方）
    crate = mat("Crate", "#a47c48", 0.8)
    box("Crate1", (0.7, 0.6, 0.6), (-0.3, 0.3, -2.55), crate, root, bevel=0.04, segs=3)
    box("Crate2", (0.6, 0.5, 0.55), (0.45, 0.25, -2.5), crate, root, bevel=0.04, segs=3, rot_y=0.3)
    box("Crate3", (0.5, 0.42, 0.5), (-0.25, 0.81, -2.55), crate, root, bevel=0.04, segs=3, rot_y=-0.2)
    export("island_engineering")


def build_island_security():
    """安全作战室：威胁态势大屏、金库门、储物柜和警示灯、护盾发生器、靶子和圆凳。"""
    reset()
    random.seed(31)
    dark, white, metal = mat("Dark", "#22252b", 0.4), mat("White", "#eef1f6", 0.5), mat("Metal", "#5b6068", 0.4, metal=0.6)
    steel = mat("Steel", "#8a929e", 0.3, metal=0.8)
    red, cyan = mat("AlertRed", "#3a0a10", 0.4, emit="#ef4444"), mat("ShieldCyan", "#06222b", 0.3, emit="#38bdf8")
    root = island_base(6, 4)   # 小格地板

    # 威胁态势大屏（两张桌子之间的后方）：经纬网格、雷达圈、红色告警点和青色安全点
    for sx in (-1, 1):
        capsule("ScreenPost", 0.04, 2.1, (sx * 1.25, 1.05, -2.6), metal, root, segs=10)
    box("ThreatScreen", (2.9, 1.3, 0.08), (0, 1.55, -2.6), dark, root, bevel=0.036, segs=4)
    grid = mat("GridLine", "#0b2530", 0.4, emit="#1f6f8a")
    for i in range(5):
        box("GridH", (2.7, 0.012, 0.012), (0, 1.07 + i * 0.24, -2.552), grid, root, bevel=0.002)
    for i in range(8):
        box("GridV", (0.012, 1.14, 0.012), (-1.26 + i * 0.36, 1.55, -2.552), grid, root, bevel=0.002)
    for R in (0.22, 0.42):
        torus("Radar", R, 0.012, (-0.72, 1.55, -2.545), cyan, root, axis="z", major=40, minor=6)
    for x, y, m in ((-0.72, 1.55, cyan), (0.3, 1.85, red), (0.95, 1.3, red), (0.55, 1.5, cyan), (1.15, 1.9, cyan), (0.1, 1.2, cyan), (-0.2, 1.75, red)):
        sphere("Blip", 0.045, (x, y, -2.545), m, root, scale=(1, 1, 0.4), segs=12, rings=8)

    # 金库门（左后角）：门框、圆门、转盘把手
    box("VaultFrame", (1.5, 1.7, 0.3), (-3.6, 0.85, -2.7), mat("VaultFrame", "#2b3038", 0.5, metal=0.4), root, bevel=0.06, segs=4)
    cyl("VaultDoor", 0.66, 0.12, (-3.6, 0.9, -2.52), steel, root, segs=40, bevel=0.03, axis="z")
    torus("VaultWheel", 0.3, 0.03, (-3.6, 0.9, -2.42), dark, root, axis="z", major=32, minor=8)
    for k in range(3):
        a = k * math.pi / 3
        capsule("VaultSpoke", 0.022, 0.6, (-3.6, 0.9, -2.42), dark, root, segs=8, axis="x").rotation_euler = (0, a, 0)
    sphere("VaultHub", 0.07, (-3.6, 0.9, -2.41), steel, root, segs=14, rings=10)
    for k in range(8):
        a = k * math.pi / 4
        sphere("VaultBolt", 0.035, (-3.6 + math.cos(a) * 0.55, 0.9 + math.sin(a) * 0.55, -2.455), dark, root, segs=10, rings=8)

    # 储物柜 + 警示灯（右后角）
    locker = mat("Locker", "#3b4a6b", 0.5, metal=0.3)
    for x in (3.3, 3.85):
        box("Locker", (0.5, 1.8, 0.5), (x, 0.9, -2.65), locker, root, bevel=0.03, segs=3)
        for row in range(3):
            box("LockerVent", (0.28, 0.02, 0.02), (x, 1.45 + row * 0.07, -2.395), dark, root, bevel=0.004)
        sphere("LockerKnob", 0.03, (x + 0.15, 0.95, -2.39), steel, root, segs=10, rings=8)
    cyl("BeaconBase", 0.12, 0.06, (3.55, 1.83, -2.65), dark, root, segs=18)
    sphere("Beacon", 0.11, (3.55, 1.93, -2.65), red, root, scale=(1, 1.15, 1), segs=16, rings=10)

    # 护盾发生器（左前）：六边形基座、光环、悬浮的护盾
    cyl("ShieldBase", 0.48, 0.5, (-4.0, 0.25, 2.2), mat("ShieldBase", "#262c3a", 0.5, metal=0.4), root, r_top=0.38, segs=6, smooth=False, bevel=0.02)
    cyl("ShieldCap", 0.34, 0.05, (-4.0, 0.525, 2.2), dark, root, segs=6, smooth=False)
    torus("ShieldRing", 0.34, 0.02, (-4.0, 0.6, 2.2), cyan, root, axis="y", major=36, minor=6)
    sphere("ShieldBody", 0.5, (-4.0, 1.2, 2.2), cyan, root, scale=(0.1, 0.78, 0.68), segs=24, rings=14)
    sphere("ShieldKeyhole", 0.085, (-3.945, 1.28, 2.2), white, root, scale=(0.3, 1, 1), segs=16, rings=10)   # 钥匙孔
    box("ShieldKeyslot", (0.022, 0.24, 0.07), (-3.945, 1.13, 2.2), white, root, bevel=0.01)

    # 靶子（右前）：三脚支架上的环形靶，旁边两张圆凳
    for dz in (-0.3, 0.3):
        capsule("TargetLeg", 0.025, 1.3, (4.05, 0.62, 2.2 + dz), metal, root, segs=8)
    target_mats = [mat("TargetRed", "#c0392b", 0.7), white, mat("TargetRed", "#c0392b", 0.7), white, red]
    for i, (r, m) in enumerate(zip((0.5, 0.4, 0.3, 0.2, 0.09), target_mats)):
        cyl("TargetRing", r, 0.03, (4.05 - i * 0.012, 1.25, 2.2), m, root, segs=36, axis="x")
    for z in (1.35, 3.0):
        cyl("Stool", 0.22, 0.07, (3.85, 0.46, z), locker, root, segs=20, bevel=0.025)
        capsule("StoolLeg", 0.035, 0.46, (3.85, 0.23, z), metal, root, segs=10)
    export("island_security")


# ---------- 共享大脑 ----------
def build_brain():
    reset()
    root = empty("Brain")
    core_mat = mat("BrainCore", "#0e3b4a", 0.4, emit="#22d3ee")
    glow = mat("BrainGlow", "#0b2530", 0.4, emit="#67e8f9")

    core = ico("Core", 0.8, (0, 0, 0), core_mat, root, sub=4, smooth=True)
    tex = bpy.data.textures.new("Folds", "CLOUDS")
    tex.noise_scale = 0.32
    disp = core.modifiers.new("Folds", "DISPLACE")
    disp.texture = tex
    disp.strength = 0.16

    shell = ico("Shell", 1.25, (0, 0, 0), glow, root, sub=1)
    wf = shell.modifiers.new("Wire", "WIREFRAME")
    wf.thickness = 0.022
    wf.use_replace = True

    torus("Ring1", 1.7, 0.03, (0, 0, 0), glow, root, axis="z")
    torus("Ring2", 1.95, 0.025, (0, 0, 0), glow, root, axis="z")
    cyl("Pad", 2.0, 0.25, (0, -2.1, 0), mat("Pad", "#151a33", 0.6), root, r_top=1.8, segs=48, bevel=0.03)
    cyl("PadDisc", 1.3, 0.02, (0, -1.965, 0), mat("PadDisc", "#0e2a3a", 0.5, emit="#0e7490"), root, segs=48)
    torus("PadGlow", 1.9, 0.04, (0, -1.97, 0), mat("PadGlow", "#0b2530", 0.4, emit="#22d3ee"), root, axis="y")
    export("brain")


ONLY = argv[2].split(",") if len(argv) > 2 else None   # 第三个参数：只重新生成这几个，例如 island_security
for build in (build_character, build_desk, build_chair, build_island_product, build_island_quality, build_island_engineering, build_island_security, build_brain):
    if not ONLY or build.__name__[len("build_"):] in ONLY:
        build()
print("ALL_DONE")
