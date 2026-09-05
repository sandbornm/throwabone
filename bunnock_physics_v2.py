
import bpy
import math
import random
from mathutils import Vector

# ================================================================
# BUNNOCK SIMULATION FRAMEWORK v1.0
# Run headless: blender --background bunnock.blend --python bunnock_sim.py
# ================================================================

FIELD_LENGTH = 10.0
GUARD_OFFSET = 0.40
NUM_SOLDIERS = 20

def configure_throw(thrower_name, params, rng=None):
    """Configure a throw with full parameterization and variance."""
    if rng is None:
        rng = random
    
    thrower = bpy.data.objects[thrower_name]
    bpy.context.view_layer.objects.active = thrower
    thrower.select_set(True)
    
    if not thrower.rigid_body:
        bpy.ops.rigidbody.object_add(type='ACTIVE')
    rb = thrower.rigid_body
    rb.collision_shape = 'CONVEX_HULL'
    rb.mass = 0.28
    rb.friction = 0.55
    rb.restitution = 0.20 + rng.uniform(0, 0.08)
    rb.collision_margin = 0.001
    rb.kinematic = True
    
    p = params.copy()
    p["aim_x"]          += rng.uniform(-p.get("aim_var", 0), p.get("aim_var", 0))
    p["release_height"] += rng.uniform(-p.get("height_var", 0), p.get("height_var", 0))
    p["spin_rate"]      += rng.uniform(-p.get("spin_var", 0), p.get("spin_var", 0))
    p["force"]           = max(0.1, min(1.0, p["force"] + rng.uniform(-p.get("force_var", 0), p.get("force_var", 0))))
    
    s = p["start_frame"]
    tx = p["aim_x"]
    rx = p.get("release_x", 0.0) + rng.uniform(-0.02, 0.02)
    rh = p["release_height"]
    force = p["force"]
    
    approach = p.get("approach", "medium")
    if approach == "low_fast":
        arc_peak = 0.8 + force * 0.8
        flight_frames = int(25 + (1 - force) * 10)
        slide_dist = 2.0
    elif approach == "high_slow":
        arc_peak = 2.0 + force * 2.5
        flight_frames = int(40 + (1 - force) * 15)
        slide_dist = 0.8
    else:
        arc_peak = 1.2 + force * 1.5
        flight_frames = int(32 + (1 - force) * 12)
        slide_dist = 1.4
    
    spin_total = p["spin_rate"] * 2 * math.pi
    spin_type = p.get("spin_type", "end_over_end")
    wobble = rng.uniform(-0.15, 0.15)
    
    if spin_type == "end_over_end":
        spin_fn = lambda t: (spin_total * t, wobble * t, 0)
    elif spin_type == "sideways":
        spin_fn = lambda t: (wobble * t, spin_total * t, 0)
    elif spin_type == "barrel_roll":
        spin_fn = lambda t: (wobble * t, 0, spin_total * t)
    elif spin_type == "compound":
        split = rng.uniform(0.3, 0.7)
        spin_fn = lambda t: (spin_total * split * t, spin_total * (1-split) * t, wobble * t)
    else:
        spin_fn = lambda t: (spin_total * t, 0, 0)
    
    impact = s + flight_frames
    slide_end = impact + 8
    
    keyframes = [
        (s,                          (rx, 10.3, rh),                     spin_fn(0.0)),
        (s + int(flight_frames*0.35),(rx+(tx-rx)*0.28, 10.3-10.3*0.42, arc_peak), spin_fn(0.35)),
        (s + int(flight_frames*0.70),(tx*0.85, slide_dist+1.0, 0.3),    spin_fn(0.70)),
        (s + int(flight_frames*0.90),(tx*0.95, slide_dist, 0.02),       spin_fn(0.90)),
        (impact,                     (tx, 0.0, 0.02),                   spin_fn(0.96)),
        (slide_end,                  (tx, -0.25, 0.02),                 spin_fn(1.0)),
    ]
    
    for frame, loc, rot in keyframes:
        thrower.location = loc
        thrower.rotation_euler = rot
        thrower.keyframe_insert(data_path="location", frame=frame)
        thrower.keyframe_insert(data_path="rotation_euler", frame=frame)
    
    rb.kinematic = True
    rb.keyframe_insert(data_path="kinematic", frame=slide_end)
    rb.kinematic = False
    rb.keyframe_insert(data_path="kinematic", frame=slide_end + 1)
    
    thrower.select_set(False)
    
    return {
        "thrower": thrower_name, "aim_x": tx, "spin_type": spin_type,
        "spin_rate": p["spin_rate"], "force": force, "approach": approach,
        "release_height": rh, "arc_peak": arc_peak,
        "start_frame": s, "impact_frame": impact, "slide_end": slide_end,
    }


def evaluate_game_state(frame=None):
    """Evaluate which bones are knocked down at a given frame."""
    if frame is not None:
        bpy.context.scene.frame_set(frame)
    
    state = {"standing": [], "knocked": [], "guards_down": 0, "soldiers_down": 0}
    
    for obj in bpy.data.objects:
        if not obj.name.startswith("T1_"):
            continue
        
        loc = obj.matrix_world.translation
        rot = obj.matrix_world.to_euler()
        
        # "Knocked down" = tilted >40deg OR displaced >10cm in Y OR fallen below ground
        tilt = max(abs(rot.x), abs(rot.y))
        displaced_y = abs(loc.y) > 0.10
        fallen = loc.z < -0.02
        is_down = tilt > math.radians(40) or displaced_y or fallen
        
        bone_info = {
            "name": obj.name,
            "pos": (round(loc.x,4), round(loc.y,4), round(loc.z,4)),
            "tilt_deg": round(math.degrees(tilt), 1),
        }
        
        if is_down:
            state["knocked"].append(bone_info)
            if "G" in obj.name:
                state["guards_down"] += 1
            else:
                state["soldiers_down"] += 1
        else:
            state["standing"].append(bone_info)
    
    state["total_down"] = len(state["knocked"])
    state["total_standing"] = len(state["standing"])
    return state


def run_simulation(throw_sequence, seed=42, settle_frames=30):
    """
    Run a complete game simulation.
    
    throw_sequence: list of (thrower_name, params_dict)
    seed: random seed for reproducibility
    settle_frames: frames to wait after last throw
    
    Returns: results dict with per-throw outcomes
    """
    rng = random.Random(seed)
    bpy.context.scene.frame_set(1)
    
    results = {"seed": seed, "throws": [], "final_state": None}
    
    for thrower_name, params in throw_sequence:
        throw_info = configure_throw(thrower_name, params, rng)
        results["throws"].append(throw_info)
    
    # Find last frame needed
    last_frame = max(t["slide_end"] for t in results["throws"]) + settle_frames
    bpy.context.scene.frame_end = last_frame
    
    # Evaluate state after each throw settles
    for i, throw_info in enumerate(results["throws"]):
        eval_frame = throw_info["slide_end"] + 15
        state = evaluate_game_state(eval_frame)
        throw_info["result"] = state
        throw_info["cumulative_down"] = state["total_down"]
    
    # Final evaluation
    bpy.context.scene.frame_set(last_frame)
    results["final_state"] = evaluate_game_state(last_frame)
    
    return results


def print_results(results):
    """Pretty-print simulation results."""
    print(f"\n{'='*50}")
    print(f"SIMULATION RESULTS (seed={results['seed']})")
    print(f"{'='*50}")
    for i, t in enumerate(results["throws"]):
        print(f"  Throw {i+1}: {t['thrower']} -> X={t['aim_x']:.3f}")
        print(f"    Style: {t['spin_type']}, {t['approach']}, force={t['force']:.2f}")
        print(f"    Spin: {t['spin_rate']:.1f} rev, arc: {t['arc_peak']:.1f}m")
        if "result" in t:
            print(f"    After settle: {t['result']['total_down']} down "
                  f"({t['result']['guards_down']}G + {t['result']['soldiers_down']}S)")
    fs = results.get("final_state", {})
    print(f"\n  FINAL: {fs.get('total_down',0)}/{fs.get('total_down',0)+fs.get('total_standing',0)} knocked down")
    print(f"    Guards: {fs.get('guards_down',0)}/2, Soldiers: {fs.get('soldiers_down',0)}/20")
