"""
BUNNOCK PHYSICS v5
==================
Open bunnock_clean.blend → Scripting → Open this → Run Script → Layout → Space
"""
import bpy, math, random
from mathutils import Quaternion, Vector

random.seed(42)
print("\n" + "="*50 + "\nBUNNOCK PHYSICS v5\n" + "="*50)

SUBSTEPS = 60; SOLVER_ITERS = 60; PUSH_DEPTH = 0.12

# ── CLEANUP ──
if bpy.context.scene.rigidbody_world:
    bpy.ops.rigidbody.world_remove()
for obj in bpy.data.objects:
    if obj.name.startswith(("T1_","T2_","Thrower")):
        obj.animation_data_clear()

# ── REFERENCES ──
ground = bpy.data.objects["Ground"]
sample = next(o for o in bpy.data.objects if o.name.startswith("T1_S"))
bone_z = sample.location.z

t1_bones = [o for o in bpy.data.objects if o.name.startswith("T1_")]
t2_bones = [o for o in bpy.data.objects if o.name.startswith("T2_")]
gL = bpy.data.objects.get("T1_Guard_L")
gR = bpy.data.objects.get("T1_Guard_R")
gLx = gL.location.x if gL else -1.0
gRx = gR.location.x if gR else 1.0

# ── BLACK GUARDS ──
mat_black = bpy.data.materials.get("M_GuardBlack")
if not mat_black:
    mat_black = bpy.data.materials.new("M_GuardBlack")
    mat_black.use_nodes = True
    mat_black.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.02,0.02,0.02,1)
    mat_black.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.4
for name in ["T1_Guard_L","T1_Guard_R","T2_Guard_L","T2_Guard_R"]:
    obj = bpy.data.objects.get(name)
    if obj:
        obj.data = obj.data.copy()
        obj.data.materials.clear()
        obj.data.materials.append(mat_black)
print("Guards: black")

# ── RIGID BODY WORLD ──
bpy.ops.rigidbody.world_add()
rbw = bpy.context.scene.rigidbody_world
rbw.point_cache.frame_end = 750
rbw.substeps_per_frame = SUBSTEPS
rbw.solver_iterations = SOLVER_ITERS
rbw.use_split_impulse = True

# Ground RB
bpy.context.view_layer.objects.active = ground
ground.select_set(True)
bpy.ops.rigidbody.object_add(type='PASSIVE')
ground.rigid_body.collision_shape = 'BOX'
ground.rigid_body.friction = 0.9
ground.rigid_body.restitution = 0.25
ground.rigid_body.collision_margin = 0.0
ground.select_set(False)

# T1 + T2 bones — all kinematic (frozen), BOX collision
for obj in t1_bones + t2_bones:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.rigidbody.object_add(type='ACTIVE')
    rb = obj.rigid_body
    rb.collision_shape = 'BOX'
    rb.mass = 0.25 + random.uniform(-0.03, 0.03)
    rb.friction = 0.85
    rb.restitution = 0.15
    rb.linear_damping = 0.35
    rb.angular_damping = 0.40
    rb.collision_margin = 0.0
    rb.kinematic = True
    rb.keyframe_insert(data_path="kinematic", frame=1)
    obj.select_set(False)

def get_nearby(bones, tx, n):
    return sorted(bones, key=lambda o: abs(o.location.x - tx))[:n]

z180 = Quaternion((0,0,1), math.radians(180))
identity = Quaternion((1,0,0,0))

# ── 8 THROWS ──
# Throws 1-4: Team 2 → Team 1 (from Y=10 toward Y=0)
# Throws 5-8: Team 1 → Team 2 (from Y=0 toward Y=10)
throws = [
    # ── Team 2 attacks Team 1 ──
    {"name":"Thrower_1","aim_x":gLx,"start":40,"n":4,
     "from_y":10.3,"to_y":0.0,"targets":t1_bones,"dir":-1,
     "spin_type":"end_over_end","spin_rate":3.5,"arc_mult":1.0},
    {"name":"Thrower_2","aim_x":gRx,"start":130,"n":4,
     "from_y":10.3,"to_y":0.0,"targets":t1_bones,"dir":-1,
     "spin_type":"sideways","spin_rate":4.2,"arc_mult":1.4},
    {"name":"Thrower_3","aim_x":random.uniform(gLx*0.4, gRx*0.4),"start":220,"n":5,
     "from_y":10.3,"to_y":0.0,"targets":t1_bones,"dir":-1,
     "spin_type":"compound","spin_rate":3.0,"arc_mult":0.7},
    {"name":"Thrower_4","aim_x":random.uniform(gLx*0.4, gRx*0.4),"start":310,"n":5,
     "from_y":10.3,"to_y":0.0,"targets":t1_bones,"dir":-1,
     "spin_type":"end_over_end","spin_rate":4.8,"arc_mult":1.6},
    # ── Team 1 attacks Team 2 ──
    {"name":"Thrower_1","aim_x":gLx,"start":400,"n":4,
     "from_y":-0.3,"to_y":10.0,"targets":t2_bones,"dir":1,
     "spin_type":"end_over_end","spin_rate":3.8,"arc_mult":1.1},
    {"name":"Thrower_2","aim_x":gRx,"start":490,"n":4,
     "from_y":-0.3,"to_y":10.0,"targets":t2_bones,"dir":1,
     "spin_type":"sideways","spin_rate":3.2,"arc_mult":0.9},
    {"name":"Thrower_3","aim_x":random.uniform(gLx*0.4, gRx*0.4),"start":580,"n":5,
     "from_y":-0.3,"to_y":10.0,"targets":t2_bones,"dir":1,
     "spin_type":"compound","spin_rate":4.5,"arc_mult":1.3},
    {"name":"Thrower_4","aim_x":random.uniform(gLx*0.4, gRx*0.4),"start":670,"n":5,
     "from_y":-0.3,"to_y":10.0,"targets":t2_bones,"dir":1,
     "spin_type":"end_over_end","spin_rate":3.0,"arc_mult":0.8},
]

for t in throws:
    obj = bpy.data.objects.get(t["name"])
    if not obj: continue

    s = t["start"]; tx = t["aim_x"]; d = t["dir"]
    from_y = t["from_y"]; to_y = t["to_y"]
    contact = s + 35
    arc = 1.5 * t["arc_mult"] + random.uniform(-0.2, 0.2)
    spin_total = t["spin_rate"] * 2 * math.pi
    stype = t["spin_type"]

    def spin_q(p):
        r = spin_total * p
        if stype == "end_over_end": return Quaternion((1,0,0), r)
        elif stype == "sideways": return Quaternion((0,1,0), r)
        elif stype == "compound": return Quaternion((1,0,0), r*0.6) @ Quaternion((0,1,0), r*0.4)
        return Quaternion((1,0,0), r)

    # Setup RB
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    if not obj.rigid_body: bpy.ops.rigidbody.object_add(type='ACTIVE')
    rb = obj.rigid_body
    rb.collision_shape = 'BOX'; rb.mass = 0.30
    rb.friction = 0.5; rb.restitution = 0.25
    rb.collision_margin = 0.0
    rb.kinematic = True
    rb.keyframe_insert(data_path="kinematic", frame=s-10)
    obj.select_set(False)

    # Activate targets
    targets = get_nearby(t["targets"], tx, t["n"])
    for bone in targets:
        bone.rigid_body.kinematic = True
        bone.rigid_body.keyframe_insert(data_path="kinematic", frame=contact-3)
        bone.rigid_body.kinematic = False
        bone.rigid_body.keyframe_insert(data_path="kinematic", frame=contact-2)

    # Trajectory
    push = PUSH_DEPTH * d
    base_rot = z180 if d == -1 else identity
    kfs = [
        (s-10,    (tx*0.1, from_y + 2*d, 0.0)),
        (s-1,     (tx*0.1, from_y + 0.2*d, 0.8)),
        (s,       (tx*0.1, from_y, 0.85)),
        (s+8,     (tx*0.3, from_y - 2.8*d, arc)),
        (s+16,    (tx*0.6, from_y - 5.3*d, arc*0.4)),
        (s+22,    (tx*0.8, from_y - 7.3*d, 0.05)),
        (s+28,    (tx*0.9, to_y + 1.0*d, bone_z)),
        (s+32,    (tx, to_y + 0.2*d, bone_z)),
        (contact,  (tx, to_y, bone_z)),
        (contact+3,(tx, to_y - push/2, bone_z)),
        (contact+6,(tx, to_y - push, bone_z)),
        (contact+45,(tx, to_y - push - 0.01*d, bone_z)),
    ]
    for frame, loc in kfs:
        obj.location = loc
        obj.rotation_mode = 'QUATERNION'
        p = max(0, min(1, (frame - s) / 40))
        obj.rotation_quaternion = spin_q(p) @ base_rot
        obj.keyframe_insert(data_path="location", frame=frame)
        obj.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    team = "T2->T1" if d==-1 else "T1->T2"
    print(f"{t['name']} [{team}] F{s}: {stype} spin={t['spin_rate']:.1f} arc={arc:.1f}m -> X={tx:.2f}")

# ── CAMERA: elevated side view tracking each throw ──
cam = bpy.data.objects.get("GameCam")
if not cam:
    cam = next((o for o in bpy.data.objects if o.type=='CAMERA'), None)
if cam:
    cam.animation_data_clear()
    cam.data.lens = 28

    for t in throws:
        s = t["start"]; tx = t["aim_x"]; c = s + 35; d = t["dir"]
        from_y = t["from_y"]; to_y = t["to_y"]
        mid_y = (from_y + to_y) / 2

        # Side angle offset from thrower
        cam_x = 2.5 if tx < 0 else -2.5

        # Behind thrower - wide establishing shot
        cam.location = (cam_x, from_y + 1*d, 2.5)
        cam.rotation_euler = (math.radians(72), 0, math.radians(150 if d==-1 else 30))
        cam.keyframe_insert(data_path="location", frame=s-8)
        cam.keyframe_insert(data_path="rotation_euler", frame=s-8)

        # Follow throw in flight
        cam.location = (cam_x*0.8, mid_y, 3.0)
        cam.rotation_euler = (math.radians(68), 0, math.radians(155 if d==-1 else 25))
        cam.keyframe_insert(data_path="location", frame=s+15)
        cam.keyframe_insert(data_path="rotation_euler", frame=s+15)

        # Close to impact point
        cam.location = (cam_x*0.5, to_y + 1.5*d, 1.5)
        cam.rotation_euler = (math.radians(60), 0, math.radians(160 if d==-1 else 20))
        cam.keyframe_insert(data_path="location", frame=c)
        cam.keyframe_insert(data_path="rotation_euler", frame=c)

        # Hold on aftermath
        cam.location = (cam_x*0.3, to_y + 0.5*d, 1.0)
        cam.rotation_euler = (math.radians(55), 0, math.radians(165 if d==-1 else 15))
        cam.keyframe_insert(data_path="location", frame=c+20)
        cam.keyframe_insert(data_path="rotation_euler", frame=c+20)

    print("Camera: tracks each throw from behind thrower to impact zone")

bpy.context.scene.frame_start = 1
bpy.context.scene.frame_end = 750
bpy.context.scene.frame_set(1)

print("\n" + "="*50)
print("READY — Layout → Space")
print("="*50)
print("\n8 throws: 4 each direction, varied spin/power/arc")
print("Guards in black, ground textured")
