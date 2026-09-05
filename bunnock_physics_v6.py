"""
BUNNOCK PHYSICS v6 — THE ONE THAT WORKS
========================================
Close Blender → Open bunnock_clean.blend → Scripting → Open this → Run → Layout → Space
"""
import bpy, math, random
from mathutils import Quaternion, Vector

random.seed(42)
print("\n" + "="*50 + "\nBUNNOCK v6\n" + "="*50)

# ── CLEANUP ──
if bpy.context.scene.rigidbody_world:
    bpy.ops.rigidbody.world_remove()
for obj in bpy.data.objects:
    obj.animation_data_clear()
for obj in list(bpy.data.objects):
    if obj.name == "Ground": bpy.data.objects.remove(obj, do_unlink=True)

# ── REFERENCES ──
sample = next(o for o in bpy.data.objects if o.name.startswith("T1_S"))
bone_z = sample.location.z
bone_bottom_local = min(v.co.z for v in sample.data.vertices)
bone_bottom_world = bone_z + bone_bottom_local

t1_bones = [o for o in bpy.data.objects if o.name.startswith("T1_")]
t2_bones = [o for o in bpy.data.objects if o.name.startswith("T2_")]

# ── CREATE GROUND: covers Y=-3 to Y=13, top at bone bottom ──
gt = bone_bottom_world
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 5, gt - 0.5))
ground = bpy.context.active_object
ground.name = "Ground"
ground.scale = (5, 8, 0.5)  # 10m x 16m x 1m thick (Y covers -3 to 13)
bpy.ops.object.transform_apply(scale=True)
mat_g = bpy.data.materials.new("M_Ground")
mat_g.use_nodes = True
mat_g.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.42,0.36,0.28,1)
mat_g.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.92
ground.data.materials.append(mat_g)
actual_top = ground.location.z + ground.dimensions.z/2
print(f"Ground: Y={5-8:.0f} to {5+8:.0f}, top Z={actual_top:.4f}, bone bottom={bone_bottom_world:.4f}")

# ── BLACK GUARDS ──
mat_b = bpy.data.materials.new("M_Black")
mat_b.use_nodes = True
mat_b.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.02,0.02,0.02,1)
for n in ["T1_Guard_L","T1_Guard_R","T2_Guard_L","T2_Guard_R"]:
    o = bpy.data.objects.get(n)
    if o:
        o.data = o.data.copy()
        o.data.materials.clear()
        o.data.materials.append(mat_b)

# ── THROW LINES ──
mat_w = bpy.data.materials.new("M_Line")
mat_w.use_nodes = True
mat_w.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.95,0.95,0.9,1)
for name, y in [("Line_T1",0),("Line_Mid",5),("Line_T2",10)]:
    old = bpy.data.objects.get(name)
    if old: bpy.data.objects.remove(old, do_unlink=True)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,y,gt+0.001))
    ln = bpy.context.active_object
    ln.name = name
    ln.scale = (3,0.015,0.001)
    bpy.ops.object.transform_apply(scale=True)
    ln.data.materials.append(mat_w)

# ── PHYSICS WORLD ──
bpy.ops.rigidbody.world_add()
rbw = bpy.context.scene.rigidbody_world
rbw.point_cache.frame_end = 800
rbw.substeps_per_frame = 60
rbw.solver_iterations = 60
rbw.use_split_impulse = True

# Ground RB
bpy.context.view_layer.objects.active = ground
ground.select_set(True)
bpy.ops.rigidbody.object_add(type='PASSIVE')
ground.rigid_body.collision_shape = 'BOX'
ground.rigid_body.friction = 0.9
ground.rigid_body.restitution = 0.2
ground.select_set(False)

# T1: active from start, moderate damping
for obj in t1_bones:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.rigidbody.object_add(type='ACTIVE')
    rb = obj.rigid_body
    rb.collision_shape = 'BOX'
    rb.mass = 0.25
    rb.friction = 0.85
    rb.restitution = 0.15
    rb.linear_damping = 0.45
    rb.angular_damping = 0.50
    obj.select_set(False)

# T2: kinematic until round 2 (frame 360)
for obj in t2_bones:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.rigidbody.object_add(type='ACTIVE')
    rb = obj.rigid_body
    rb.collision_shape = 'BOX'
    rb.mass = 0.25
    rb.friction = 0.85
    rb.restitution = 0.15
    rb.linear_damping = 0.45
    rb.angular_damping = 0.50
    rb.kinematic = True
    rb.keyframe_insert(data_path="kinematic", frame=1)
    rb.kinematic = True
    rb.keyframe_insert(data_path="kinematic", frame=359)
    rb.kinematic = False
    rb.keyframe_insert(data_path="kinematic", frame=360)
    obj.select_set(False)

print(f"T1: {len(t1_bones)} active, T2: {len(t2_bones)} kinematic until F360")

# ── PICK TARGETS ──
gL = bpy.data.objects.get("T1_Guard_L")
gR = bpy.data.objects.get("T1_Guard_R")
t1_soldiers = [o for o in t1_bones if "Guard" not in o.name]
t2_soldiers = [o for o in t2_bones if "Guard" not in o.name]
random.shuffle(t1_soldiers)
random.shuffle(t2_soldiers)

throws = [
    # Round 1: aim at T1
    {"thr":"Thrower_1","tgt":gL,"s":30,"spin":"end_over_end","sr":3.5,"arc":1.5,"dir":-1},
    {"thr":"Thrower_2","tgt":gR,"s":110,"spin":"sideways","sr":4.0,"arc":2.0,"dir":-1},
    {"thr":"Thrower_3","tgt":t1_soldiers[0],"s":190,"spin":"compound","sr":3.0,"arc":1.2,"dir":-1},
    {"thr":"Thrower_4","tgt":t1_soldiers[5],"s":270,"spin":"end_over_end","sr":5.0,"arc":2.5,"dir":-1},
    # Round 2: aim at T2
    {"thr":"Thrower_5","tgt":bpy.data.objects["T2_Guard_L"],"s":380,"spin":"end_over_end","sr":3.8,"arc":1.6,"dir":1},
    {"thr":"Thrower_6","tgt":bpy.data.objects["T2_Guard_R"],"s":460,"spin":"sideways","sr":3.2,"arc":1.3,"dir":1},
    {"thr":"Thrower_7","tgt":t2_soldiers[0],"s":540,"spin":"compound","sr":4.5,"arc":1.8,"dir":1},
    {"thr":"Thrower_8","tgt":t2_soldiers[5],"s":620,"spin":"end_over_end","sr":3.0,"arc":1.0,"dir":1},
]

z180 = Quaternion((0,0,1), math.radians(180))
PUSH = 0.20

for t in throws:
    obj = bpy.data.objects[t["thr"]]
    tgt = t["tgt"]
    tx = tgt.location.x + random.uniform(-0.01, 0.01)
    tz = bone_z + random.uniform(-0.008, 0.005)
    s = t["s"]; d = t["dir"]; contact = s + 35
    arc = t["arc"] + random.uniform(-0.2, 0.2)
    spin = t["sr"] * 2 * math.pi
    stype = t["spin"]

    def sq(p):
        r = spin * p
        if stype == "end_over_end": return Quaternion((1,0,0), r)
        elif stype == "sideways": return Quaternion((0,1,0), r)
        elif stype == "compound": return Quaternion((1,0,0),r*0.6) @ Quaternion((0,1,0),r*0.4)
        return Quaternion((1,0,0), r)

    obj.animation_data_clear()
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    if obj.rigid_body: bpy.ops.rigidbody.object_remove()
    bpy.ops.rigidbody.object_add(type='ACTIVE')
    rb = obj.rigid_body
    rb.collision_shape = 'BOX'; rb.mass = 0.3
    rb.friction = 0.5; rb.restitution = 0.25
    rb.kinematic = True
    rb.keyframe_insert(data_path="kinematic", frame=1)
    obj.select_set(False)

    # Direction-aware trajectory using interpolation
    if d == -1:  # T2→T1: Y goes 10.3 → 0
        fy = 10.3; ty = 0.0
    else:         # T1→T2: Y goes -0.3 → 10.0
        fy = -0.3; ty = 10.0

    def lerp_y(frac):
        return fy + (ty - fy) * frac

    kfs = [
        (1,          (tx*0.1, fy + (2 if d==-1 else -2), 0)),   # Parked
        (s-2,        (tx*0.1, fy + (0.2 if d==-1 else -0.2), 0.8)), # Ready
        (s,          (tx*0.1, fy, 0.85)),                        # Release
        (s+7,        (tx*0.3, lerp_y(0.25), arc+0.5)),          # Arc peak
        (s+14,       (tx*0.55, lerp_y(0.50), arc*0.5)),         # Mid
        (s+20,       (tx*0.75, lerp_y(0.70), 0.15)),            # Descending
        (s+26,       (tx*0.88, lerp_y(0.85), tz)),              # On ground
        (s+30,       (tx*0.95, lerp_y(0.93), tz)),              # Close
        (s+33,       (tx, lerp_y(0.98), tz)),                   # Almost
        (contact,    (tx, ty, tz)),                              # CONTACT
        (contact+2,  (tx, ty + PUSH*0.3*d, tz)), # Push
        (contact+4,  (tx, ty + PUSH*0.6*d, tz)),
        (contact+6,  (tx, ty + PUSH*d, tz)),                 # Max push
        (contact+50, (tx, ty + (PUSH+0.005)*d, tz)),         # Stopped
    ]

    base_rot = z180 if d == -1 else Quaternion((1,0,0,0))
    for frame, loc in kfs:
        obj.location = loc
        obj.rotation_mode = 'QUATERNION'
        p = max(0, min(1, (frame - s) / 40))
        obj.rotation_quaternion = sq(p) @ base_rot
        obj.keyframe_insert(data_path="location", frame=frame)
        obj.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    team = "T2->T1" if d==-1 else "T1->T2"
    print(f"{t['thr']} [{team}] F{s}: {stype} -> {tgt.name} X={tx:.3f}")

# ── CAMERA ──
cam = next((o for o in bpy.data.objects if o.type=='CAMERA'), None)
if cam:
    cam.animation_data_clear()
    cam.data.lens = 28
    for t in throws:
        s = t["s"]; d = t["dir"]; tx = t["tgt"].location.x; c = s+35
        fy = 10.3 if d==-1 else -0.3
        ty = 0.0 if d==-1 else 10.0
        cx = 3.0 if tx < 0 else -3.0
        rz = math.radians(155 if d==-1 else 25)
        cam.location = (cx, fy+(1.5 if d==-1 else -1.5), 2.5)
        cam.rotation_euler = (math.radians(72), 0, rz)
        cam.keyframe_insert(data_path="location", frame=s-8)
        cam.keyframe_insert(data_path="rotation_euler", frame=s-8)
        cam.location = (cx*0.5, (fy+ty)/2, 3)
        cam.rotation_euler = (math.radians(65), 0, rz)
        cam.keyframe_insert(data_path="location", frame=s+15)
        cam.keyframe_insert(data_path="rotation_euler", frame=s+15)
        cam.location = (cx*0.3, ty+(1.5 if d==-1 else -1.5), 1.5)
        cam.rotation_euler = (math.radians(60), 0, rz)
        cam.keyframe_insert(data_path="location", frame=c)
        cam.keyframe_insert(data_path="rotation_euler", frame=c)
        cam.location = (cx*0.15, ty+(0.5 if d==-1 else -0.5), 1)
        cam.rotation_euler = (math.radians(55), 0, rz)
        cam.keyframe_insert(data_path="location", frame=c+20)
        cam.keyframe_insert(data_path="rotation_euler", frame=c+20)

bpy.context.scene.frame_start = 1
bpy.context.scene.frame_end = 750
bpy.context.scene.frame_set(1)
print("\n" + "="*50 + "\nREADY — Layout → Space\n" + "="*50)
