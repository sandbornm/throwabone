"""Export the original bone in metres, Y up, without modifying the Blender file."""
import bpy
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(root / 'bunnock_clean.blend'), load_ui=False, use_scripts=False)
obj = bpy.data.objects['T1_Soldier_01']
mesh = obj.data
mesh.calc_loop_triangles()
points = [obj.matrix_world.to_3x3() @ v.co for v in mesh.vertices]
points = [(p.x, p.z, -p.y) for p in points]
low = [min(p[a] for p in points) for a in range(3)]
high = [max(p[a] for p in points) for a in range(3)]
center = [(a+b)/2 for a,b in zip(low,high)]
vertices = [[round(p[a]-center[a], 8) for a in range(3)] for p in points]
faces = [list(t.vertices) for t in mesh.loop_triangles]
asset = {'source':'bunnock_clean.blend / T1_Soldier_01','units':'metres','up':'Y', 'dimensions':[b-a for a,b in zip(low,high)],'vertices':vertices,'faces':faces}
path = root / 'assets/bone-source.json'
path.parent.mkdir(parents=True,exist_ok=True)
path.write_text(json.dumps(asset,separators=(',',':')))
print('Exported',len(vertices),'vertices and',len(faces),'triangles to',path)
print('Dimensions:',asset['dimensions'])
