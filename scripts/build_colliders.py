"""Decompose the exported scan into convex solids for moving rigid bodies."""
import json
from pathlib import Path
import coacd
import numpy as np
import trimesh
from scipy.spatial.transform import Rotation

root=Path(__file__).resolve().parents[1]
source=json.loads((root/'assets/bone-source.json').read_text())
mesh=trimesh.Trimesh(source['vertices'],source['faces'],process=True)
coacd.set_log_level('warn')
parts=coacd.run_coacd(coacd.Mesh(np.asarray(mesh.vertices),np.asarray(mesh.faces,dtype=np.int32)),threshold=0.035,max_convex_hull=16,preprocess_mode='auto',preprocess_resolution=60,resolution=2000,mcts_iterations=100,mcts_nodes=20,decimate=True,max_ch_vertex=64,seed=42)
colliders=[]
for vertices,faces in parts:
 hull=trimesh.Trimesh(vertices,faces,process=True)
 hull.fix_normals()
 colliders.append({'vertices':np.round(hull.vertices,8).tolist(),'faces':hull.faces.tolist(),'volume':abs(float(hull.volume))})
asset={**source,'colliders':colliders,'collisionBuild':{'tool':'CoACD 1.0.7','threshold':0.035,'seed':42,'maxHulls':16,'sourceWatertight':bool(mesh.is_watertight),'preprocessing':'auto voxel repair','massAssumptionKg':0.25,'throwerMassAssumptionKg':0.30}}
# Find the nearest stable support face instead of holding the target artificially upright.
hull_meshes=[trimesh.Trimesh(p['vertices'],p['faces']) for p in colliders]
center=sum(m.center_mass*m.volume for m in hull_meshes)/sum(m.volume for m in hull_meshes)
support=trimesh.util.concatenate(hull_meshes).convex_hull
stable=[]
for triangle,normal in zip(support.triangles,support.face_normals):
    projected=center-normal*np.dot(center-triangle[0],normal)
    bary=trimesh.triangles.points_to_barycentric(np.array([triangle]),np.array([projected]))[0]
    if min(bary)>=-1e-7:
        rot,_=Rotation.align_vectors(np.array([[0,-1,0]]),np.array([normal]))
        stable.append(rot)
if not stable:
    raise ValueError('No stable support pose found for the collision geometry')
rotation=min(stable,key=lambda r:r.magnitude())
points=rotation.apply(np.concatenate([m.vertices for m in hull_meshes]))
asset['standingRotation']=dict(zip(['x','y','z','w'],rotation.as_quat().tolist()))
asset['standingTiltDegrees']=float(rotation.magnitude()*180/np.pi)
asset['standingHeight']=-float(points[:,1].min())
asset['standingWidth']=float(np.ptp(points[:,0]))
output=root/'web/public/models/bone.json'
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps(asset,separators=(',',':')))
print('Created',len(parts),'convex parts,',sum(len(c['vertices']) for c in colliders),'vertices;',output.stat().st_size,'bytes')
print('Volume:',sum(c['volume'] for c in colliders))
