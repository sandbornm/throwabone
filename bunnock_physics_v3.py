"""
BUNNOCK PHYSICS v3 - Open bunnock_clean.blend, paste in Text Editor, Alt+P, SPACE
"""
import bpy, math, random
from mathutils import Quaternion, Vector

random.seed(42)
print("\n" + "="*50 + "\nBUNNOCK PHYSICS v3\n" + "="*50)

SUBSTEPS = 60; SOLVER_ITERS = 60; PUSH_DEPTH = 0.12; NEARBY_COUNT = 4

if bpy.context.scene.rigidbody_world:
    bpy.ops.rigidbody.world_remove()
for obj in bpy.data.objects:
    if obj.name.startswith(("T1_","T2_","Thrower")): obj.animation_data_clear()

ground = bpy.data.objects["Ground"]
sample = next(o for o in bpy.data.objects if o.name.startswith("T1_S"))
bone_z = sample.location.z
guard_L = bpy.data.objects.get("T1_Guard_L")
guard_R = bpy.data.objects.get("T1_Guard_R")
gLx = guard_L.location.x if guard_L else -1.0
gRx = guard_R.location.x if guard_R else 1.0
t1_bones = [o for o in bpy.data.objects if o.name.startswith("T1_")]

bpy.ops.rigidbody.world_add()
rbw = bpy.context.scene.rigidbody_world
rbw.point_cache.frame_end = 450
rbw.substeps_per_frame = SUBSTEPS
rbw.solver_iterations = SOLVER_ITERS
rbw.use_split_impulse = True

bpy.context.view_layer.objects.active = ground
ground.select_set(True)
bpy.ops.rigidbody.object_add(type='PASSIVE')
ground.rigid_body.collision_shape = 'BOX'
ground.rigid_body.friction = 0.85
ground.rigid_body.restitution = 0.2
ground.rigid_body.collision_margin = 0.0
ground.select_set(False)

for obj in t1_bones:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.rigidbody.object_add(type='ACTIVE')
    rb = obj.rigid_body
    rb.collision_shape = 'BOX'
    rb.mass = 0.25 + random.uniform(-0.03, 0.03)
    rb.friction = 0.75; rb.restitution = 0.20
    rb.linear_damping = 0.30; rb.angular_damping = 0.30
    rb.collision_margin = 0.0
    rb.kinematic = True
    rb.keyframe_insert(data_path="kinematic", frame=1)
    obj.select_set(False)

for obj in bpy.data.objects:
    if obj.name.startswith("T2_"):
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.rigidbody.object_add(type='PASSIVE')
        obj.rigid_body.collision_shape = 'BOX'
        obj.select_set(False)

def get_nearby(target_x, count):
    return sorted(t1_bones, key=lambda o: abs(o.location.x - target_x))[:count]

z180 = Quaternion((0,0,1), math.radians(180))
throws = [
    {"name":"Thrower_1","aim_x":gLx,"start":40,"n":4},
    {"name":"Thrower_2","aim_x":gRx,"start":130,"n":4},
    {"name":"Thrower_3","aim_x":-0.1,"start":220,"n":5},
    {"name":"Thrower_4","aim_x":0.1,"start":310,"n":5},
]

for t in throws:
    obj = bpy.data.objects.get(t["name"])
    if not obj: continue
    obj.animation_data_clear()
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    if obj.rigid_body: bpy.ops.rigidbody.object_remove()
    bpy.ops.rigidbody.object_add(type='ACTIVE')
    rb = obj.rigid_body
    rb.collision_shape = 'BOX'; rb.mass = 0.30
    rb.friction = 0.5; rb.restitution = 0.25
    rb.collision_margin = 0.0
    rb.kinematic = True
    rb.keyframe_insert(data_path="kinematic", frame=1)
    s = t["start"]; tx = t["aim_x"]; contact = s + 35
    arc = 1.5 + random.uniform(-0.2, 0.2)
    spin = random.uniform(2, 4) * 2 * math.pi
    targets = get_nearby(tx, t["n"])
    for bone in targets:
        bone.rigid_body.kinematic = True
        bone.rigid_body.keyframe_insert(data_path="kinematic", frame=contact-3)
        bone.rigid_body.kinematic = False
        bone.rigid_body.keyframe_insert(data_path="kinematic", frame=contact-2)
    kfs = [
        (1,(tx*0.1,12.0,0.0)),(s-1,(tx*0.1,10.5,0.8)),(s,(tx*0.1,10.3,0.85)),
        (s+8,(tx*0.3,7.5,arc)),(s+16,(tx*0.6,5.0,arc*0.4)),
        (s+22,(tx*0.8,3.0,0.05)),(s+28,(tx*0.9,1.0,bone_z)),
        (s+32,(tx,0.2,bone_z)),(contact,(tx,0.0,bone_z)),
        (contact+3,(tx,-PUSH_DEPTH/2,bone_z)),
        (contact+6,(tx,-PUSH_DEPTH,bone_z)),
        (contact+40,(tx,-PUSH_DEPTH-0.01,bone_z)),
    ]
    for frame, loc in kfs:
        obj.location = loc
        obj.rotation_mode = 'QUATERNION'
        p = max(0, min(1, (frame - s) / 40))
        obj.rotation_quaternion = Quaternion((1,0,0), spin*p) @ z180
        obj.keyframe_insert(data_path="location", frame=frame)
        obj.keyframe_insert(data_path="rotation_quaternion", frame=frame)
    obj.select_set(False)
    print(f"{t['name']}: contact F{contact}, targets: {[b.name for b in targets]}")

# Camera follows each throw
cam = bpy.data.objects.get("ThrowerPOV")
if cam:
    cam.animation_data_clear()
    for t in throws:
        s = t["start"]; tx = t["aim_x"]; c = s + 35
        cam.location = (tx*0.3, 11.5, 0.9)
        cam.rotation_euler = (math.radians(87), 0, math.radians(180))
        cam.keyframe_insert(data_path="location", frame=s-10)
        cam.keyframe_insert(data_path="rotation_euler", frame=s-10)
        cam.location = (tx*0.5, 8.0, 1.5)
        cam.rotation_euler = (math.radians(82), 0, math.radians(180))
        cam.keyframe_insert(data_path="location", frame=s+12)
        cam.keyframe_insert(data_path="rotation_euler", frame=s+12)
        cam.location = (tx*0.8, 2.0, 1.2)
        cam.rotation_euler = (math.radians(75), 0, math.radians(180))
        cam.keyframe_insert(data_path="location", frame=c-2)
        cam.keyframe_insert(data_path="rotation_euler", frame=c-2)
        cam.location = (tx, 1.0, 0.8)
        cam.rotation_euler = (math.radians(70), 0, math.radians(180))
        cam.keyframe_insert(data_path="location", frame=c+15)
        cam.keyframe_insert(data_path="rotation_euler", frame=c+15)
        idx = throws.index(t)
        if idx < len(throws)-1:
            ns = throws[idx+1]["start"]
            cam.location = (0, 11.5, 0.9)
            cam.rotation_euler = (math.radians(87), 0, math.radians(180))
            cam.keyframe_insert(data_path="location", frame=ns-15)
            cam.keyframe_insert(data_path="rotation_euler", frame=ns-15)
    print("Camera: POV follows each throw")

bpy.context.scene.frame_start = 1
bpy.context.scene.frame_end = 420
bpy.context.scene.frame_set(1)
print("\n" + "="*50 + "\nREADY - press SPACE to play!\n" + "="*50)
