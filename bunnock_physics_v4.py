"""
BUNNOCK PHYSICS v4
==================
Close Blender → Open bunnock_clean.blend → Scripting → Open this → Run → Layout → Space
"""
import bpy, math, random
from mathutils import Quaternion, Vector

random.seed(42)
print("\n" + "="*50 + "\nBUNNOCK PHYSICS v4\n" + "="*50)

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

guard_L = bpy.data.objects.get("T1_Guard_L")
guard_R = bpy.data.objects.get("T1_Guard_R")
gLx = guard_L.location.x if guard_L else -1.0
gRx = guard_R.location.x if guard_R else 1.0
row_min_x = gLx  # leftmost target
row_max_x = gRx  # rightmost target

t1_bones = [o for o in bpy.data.objects if o.name.startswith("T1_")]
t2_bones = [o for o in bpy.data.objects if o.name.startswith("T2_")]

# ── BLACK GUARDS ──
mat_black = bpy.data.materials.get("M_Guard_Black")
if not mat_black:
    mat_black = bpy.data.materials.new("M_Guard_Black")
    mat_black.use_nodes = True
    mat_black.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.02, 0.02, 0.02, 1)
    mat_black.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.4

for name in ["T1_Guard_L","T1_Guard_R","T2_Guard_L","T2_Guard_R"]:
    obj = bpy.data.objects.get(name)
    if obj:
        obj.data = obj.data.copy()
        obj.data.materials.clear()
        obj.data.materials.append(mat_black)

print("Guards colored black")

# ── GROUND TEXTURE ──
mat_ground = bpy.data.materials.get("M_GroundV4")
if not mat_ground:
    mat_ground = bpy.data.materials.new("M_GroundV4")
    mat_ground.use_nodes = True
    nodes = mat_ground.node_tree.nodes
    links = mat_ground.node_tree.links
    bsdf = nodes["Principled BSDF"]
    tc = nodes.new('ShaderNodeTexCoord')
    n1 = nodes.new('ShaderNodeTexNoise')
    n1.inputs["Scale"].default_value = 80
    n1.inputs["Detail"].default_value = 12
    n1.inputs["Roughness"].default_value = 0.8
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (0.30, 0.24, 0.18, 1)
    ramp.color_ramp.elements[1].position = 0.65
    ramp.color_ramp.elements[1].color = (0.52, 0.44, 0.35, 1)
    links.new(tc.outputs["Object"], n1.inputs["Vector"])
    links.new(n1.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs["Strength"].default_value = 0.5
    n2 = nodes.new('ShaderNodeTexNoise')
    n2.inputs["Scale"].default_value = 200
    n2.inputs["Detail"].default_value = 8
    links.new(tc.outputs["Object"], n2.inputs["Vector"])
    links.new(n2.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Roughness"].default_value = 0.92

ground.data.materials.clear()
ground.data.materials.append(mat_ground)
print("Ground textured (crushed gravel)")

# ── RIGID BODY WORLD ──
bpy.ops.rigidbody.world_add()
rbw = bpy.context.scene.rigidbody_world
rbw.point_cache.frame_end = 600
rbw.substeps_per_frame = SUBSTEPS
rbw.solver_iterations = SOLVER_ITERS
rbw.use_split_impulse = True

# Ground RB
bpy.context.view_layer.objects.active = ground
ground.select_set(True)
bpy.ops.rigidbody.object_add(type='PASSIVE')
ground.rigid_body.collision_shape = 'BOX'
ground.rigid_body.friction = 0.9  # High friction = less sliding
ground.rigid_body.restitution = 0.25
ground.rigid_body.collision_margin = 0.0
ground.select_set(False)

# T1 bones — kinematic, BOX
for obj in t1_bones:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.rigidbody.object_add(type='ACTIVE')
    rb = obj.rigid_body
    rb.collision_shape = 'BOX'
    rb.mass = 0.25 + random.uniform(-0.03, 0.03)
    rb.friction = 0.85  # High friction = less sliding after knockdown
    rb.restitution = 0.15
    rb.linear_damping = 0.35  # Moderate — slides a bit then stops
    rb.angular_damping = 0.40
    rb.collision_margin = 0.0
    rb.kinematic = True
    rb.keyframe_insert(data_path="kinematic", frame=1)
    obj.select_set(False)

# T2 bones — kinematic for now (become active when T1 throws at them)
for obj in t2_bones:
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

print(f"Physics ready: {len(t1_bones)} T1 + {len(t2_bones)} T2 bones")

# ── HELPER ──
def get_nearby(bones, target_x, count):
    return sorted(bones, key=lambda o: abs(o.location.x - target_x))[:count]

z180 = Quaternion((0,0,1), math.radians(180))
identity = Quaternion((1,0,0,0))

# ── 8 THROWS: 4 per team, alternating ──
# Team 2 throws at Team 1 (Y=10 → Y=0)
# Team 1 throws at Team 2 (Y=0 → Y=10)

throws = [
    # Round 1: Team 2 throws at Team 1
    {"name":"Thrower_1","aim_x":gLx + random.uniform(-0.02,0.02),
     "start":40,"n":4,"from_y":10.3,"to_y":0.0,"target_bones":t1_bones,
     "spin_type":"end_over_end","spin_rate":3.5,"force":0.85,"arc_mult":1.0,
     "direction":-1, "bone_z":bone_z},

    {"name":"Thrower_2","aim_x":gRx + random.uniform(-0.02,0.02),
     "start":120,"n":4,"from_y":10.3,"to_y":0.0,"target_bones":t1_bones,
     "spin_type":"sideways","spin_rate":4.2,"force":0.90,"arc_mult":1.3,
     "direction":-1, "bone_z":bone_z},

    {"name":"Thrower_3","aim_x":random.uniform(row_min_x*0.5, row_max_x*0.5),
     "start":200,"n":5,"from_y":10.3,"to_y":0.0,"target_bones":t1_bones,
     "spin_type":"compound","spin_rate":3.0,"force":0.75,"arc_mult":0.8,
     "direction":-1, "bone_z":bone_z},

    {"name":"Thrower_4","aim_x":random.uniform(row_min_x*0.5, row_max_x*0.5),
     "start":280,"n":5,"from_y":10.3,"to_y":0.0,"target_bones":t1_bones,
     "spin_type":"end_over_end","spin_rate":4.8,"force":0.95,"arc_mult":1.5,
     "direction":-1, "bone_z":bone_z},

    # Round 2: Team 1 throws at Team 2 (reverse direction)
    {"name":"Thrower_1","aim_x":gLx + random.uniform(-0.02,0.02),
     "start":370,"n":4,"from_y":-0.3,"to_y":10.0,"target_bones":t2_bones,
     "spin_type":"end_over_end","spin_rate":3.8,"force":0.88,"arc_mult":1.1,
     "direction":1, "bone_z":bone_z},

    {"name":"Thrower_2","aim_x":gRx + random.uniform(-0.02,0.02),
     "start":450,"n":4,"from_y":-0.3,"to_y":10.0,"target_bones":t2_bones,
     "spin_type":"sideways","spin_rate":3.2,"force":0.82,"arc_mult":0.9,
     "direction":1, "bone_z":bone_z},

    {"name":"Thrower_3","aim_x":random.uniform(row_min_x*0.5, row_max_x*0.5),
     "start":530,"n":5,"from_y":-0.3,"to_y":10.0,"target_bones":t2_bones,
     "spin_type":"compound","spin_rate":4.5,"force":0.92,"arc_mult":1.4,
     "direction":1, "bone_z":bone_z},

    {"name":"Thrower_4","aim_x":random.uniform(row_min_x*0.5, row_max_x*0.5),
     "start":610,"n":5,"from_y":-0.3,"to_y":10.0,"target_bones":t2_bones,
     "spin_type":"end_over_end","spin_rate":3.0,"force":0.78,"arc_mult":0.7,
     "direction":1, "bone_z":bone_z},
]

for t in throws:
    obj = bpy.data.objects.get(t["name"])
    if not obj: continue

    # Clear previous throw animation on this thrower (reused across rounds)
    s = t["start"]; tx = t["aim_x"]; d = t["direction"]
    from_y = t["from_y"]; to_y = t["to_y"]; bz = t["bone_z"]
    contact = s + 35
    arc = (1.5 * t["arc_mult"]) + random.uniform(-0.2, 0.2)
    force = t["force"]

    # Spin setup
    spin_rate = t["spin_rate"] * 2 * math.pi
    stype = t["spin_type"]
    wobble = random.uniform(-0.15, 0.15)

    def spin_quat(progress):
        r = spin_rate * progress
        if stype == "end_over_end":
            return Quaternion((1,0,0), r)
        elif stype == "sideways":
            return Quaternion((0,1,0), r)
        elif stype == "compound":
            return Quaternion((1,0,0), r*0.6) @ Quaternion((0,1,0), r*0.4)
        return Quaternion((1,0,0), r)

    # Set up rigid body for this throw
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    if not obj.rigid_body:
        bpy.ops.rigidbody.object_add(type='ACTIVE')
    rb = obj.rigid_body
    rb.collision_shape = 'BOX'
    rb.mass = 0.30
    rb.friction = 0.5
    rb.restitution = 0.25
    rb.collision_margin = 0.0
    rb.kinematic = True
    rb.keyframe_insert(data_path="kinematic", frame=s-5)
    obj.select_set(False)

    # Activate target bones near contact
    targets = get_nearby(t["target_bones"], tx, t["n"])
    for bone in targets:
        bone.rigid_body.kinematic = True
        bone.rigid_body.keyframe_insert(data_path="kinematic", frame=contact-3)
        bone.rigid_body.kinematic = False
        bone.rigid_body.keyframe_insert(data_path="kinematic", frame=contact-2)

    # Trajectory (direction-aware)
    mid_y = (from_y + to_y) / 2
    push = PUSH_DEPTH * d  # negative for T2→T1, positive for T1→T2

    kfs = [
        (s-5,     (tx*0.1, from_y + 2*d, 0.0)),
        (s-1,     (tx*0.1, from_y + 0.2*d, 0.8)),
        (s,       (tx*0.1, from_y, 0.85)),
        (s+8,     (tx*0.3, from_y - 2.8*d, arc)),
        (s+16,    (tx*0.6, from_y - 5.3*d, arc*0.4)),
        (s+22,    (tx*0.8, from_y - 7.3*d, 0.05)),
        (s+28,    (tx*0.9, to_y + 1.0*d, bz)),
        (s+32,    (tx, to_y + 0.2*d, bz)),
        (contact,  (tx, to_y, bz)),
        (contact+3,(tx, to_y - push/2, bz)),
        (contact+6,(tx, to_y - push, bz)),
        (contact+40,(tx, to_y - push - 0.01*d, bz)),
    ]

    base_rot = z180 if d == -1 else identity
    for frame, loc in kfs:
        obj.location = loc
        obj.rotation_mode = 'QUATERNION'
        p = max(0, min(1, (frame - s) / 40))
        obj.rotation_quaternion = spin_quat(p) @ base_rot
        obj.keyframe_insert(data_path="location", frame=frame)
        obj.keyframe_insert(data_path="rotation_quaternion", frame=frame)

    team = "T2->T1" if d == -1 else "T1->T2"
    print(f"{t['name']} [{team}]: F{s} {stype} spin={t['spin_rate']:.1f} force={force:.2f} arc={arc:.1f}m -> X={tx:.3f}")

# ── CAMERA: follow each throw, switch sides ──
cam = bpy.data.objects.get("ThrowerPOV")
if cam:
    cam.animation_data_clear()
    for t in throws:
        s = t["start"]; tx = t["aim_x"]; c = s + 35; d = t["direction"]
        from_y = t["from_y"]; to_y = t["to_y"]

        # Behind thrower
        cam_behind_y = from_y + 1.5 * d
        cam_rot_z = math.radians(180) if d == -1 else 0

        cam.location = (tx*0.3, cam_behind_y, 0.9)
        cam.rotation_euler = (math.radians(87), 0, cam_rot_z)
        cam.keyframe_insert(data_path="location", frame=s-10)
        cam.keyframe_insert(data_path="rotation_euler", frame=s-10)

        # Mid-flight
        cam.location = (tx*0.5, (from_y + to_y*2)/3, 1.5)
        cam.rotation_euler = (math.radians(82), 0, cam_rot_z)
        cam.keyframe_insert(data_path="location", frame=s+12)
        cam.keyframe_insert(data_path="rotation_euler", frame=s+12)

        # At impact
        cam.location = (tx*0.8, to_y + 2*d, 1.2)
        cam.rotation_euler = (math.radians(75), 0, cam_rot_z)
        cam.keyframe_insert(data_path="location", frame=c-2)
        cam.keyframe_insert(data_path="rotation_euler", frame=c-2)

        # Hold on result
        cam.location = (tx, to_y + 1*d, 0.8)
        cam.rotation_euler = (math.radians(70), 0, cam_rot_z)
        cam.keyframe_insert(data_path="location", frame=c+15)
        cam.keyframe_insert(data_path="rotation_euler", frame=c+15)

    print("Camera follows all 8 throws, switches sides for Team 1\'s turn")

# ── FRAME RANGE ──
bpy.context.scene.frame_start = 1
bpy.context.scene.frame_end = 720
bpy.context.scene.frame_set(1)

print("\n" + "="*50)
print("READY — Layout workspace → Space to play!")
print("="*50)
print("\n8 throws total:")
print("  Throws 1-4: Team 2 → Team 1 (guards first, then soldiers)")
print("  Throws 5-8: Team 1 → Team 2 (switch sides)")
print("  Each throw: different spin/power/arc")
print(f"\nTuning: PUSH_DEPTH={PUSH_DEPTH}m")
