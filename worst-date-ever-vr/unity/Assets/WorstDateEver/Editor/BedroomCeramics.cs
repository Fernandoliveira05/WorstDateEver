using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace WorstDateEver.Editor
{
    public static partial class BuildBedroom
    {
        private static void AddCeramics()
        {
            var mugContour = new Vector2[] {
                new(.001f,-.055f), new(.037f,-.055f), new(.044f,-.051f), new(.047f,-.039f),
                new(.051f,.046f), new(.048f,.054f), new(.044f,.052f), new(.041f,-.033f),
                new(.035f,-.043f), new(.001f,-.043f)
            };
            var mug = Ceramic("Caneca de cerâmica","Mug",new(-.645f,.955f,1.49f),mugContour, Linen);
            var handle = new List<Vector3>();
            for (var i = 0; i <= 20; i++)
            {
                var angle = Mathf.Lerp(-106,106,i/20f) * Mathf.Deg2Rad;
                handle.Add(new Vector3(.046f+Mathf.Cos(angle)*.027f, Mathf.Sin(angle)*.034f+.005f,0));
            }
            var intactHandle = MeshPart("Alça curva",mug.transform,Tube("MugHandle",handle,.007f),Linen);
            ApplySurface(intactHandle,"Powdercoat",Linen,new(4,4),.18f,.32f);
            for (var pattern = 0; pattern < mug.Patterns.Length; pattern++)
            {
                var result = mug.Patterns[pattern];
                var pieces = new List<Rigidbody>(result.Pieces);
                var cuts = pattern switch { 0 => new[] { 0,21 }, 1 => new[] { 0,8,21 }, _ => new[] { 0,5,14,21 } };
                for (var i=0; i<cuts.Length-1; i++)
                {
                    var start = cuts[i] == 0 ? 0 : cuts[i]-1;
                    var span = handle.GetRange(start,cuts[i+1]-start);
                    var fragment = MeshPart("Pedaço da alça",mug.transform,
                        Tube($"MugHandle-Fracture{pattern}-{i}",span,.007f),Linen);
                    var bounds = fragment.GetComponent<MeshFilter>().sharedMesh.bounds;
                    pieces.Add(MakeShard(fragment,bounds.center,bounds.size,.014f+bounds.size.y*.10f));
                }
                result.Pieces = pieces.ToArray();
            }

            var plateContour = new Vector2[] {
                new(.001f,-.014f), new(.026f,-.014f), new(.049f,-.014f), new(.068f,-.014f), new(.082f,-.009f), new(.100f,.006f),
                new(.101f,.014f), new(.096f,.017f), new(.077f,.002f), new(.067f,-.005f),
                new(.047f,-.005f), new(.023f,-.005f), new(.001f,-.005f)
            };
            Ceramic("Prato de sobremesa","Plate",new(-1.83f,.915f,1.416f),plateContour,new Color(.70f,.69f,.53f));
        }

        private static BedroomCeramic Ceramic(string name, string key, Vector3 position, Vector2[] contour, Color color)
        {
            var radius = 0f;
            foreach (var point in contour) radius = Mathf.Max(radius,point.x);
            var prop = Prop(name,position,new(radius*2,Mathf.Abs(contour[0].y)*2,radius*2),color,false);
            Object.DestroyImmediate(prop.transform.GetChild(0).gameObject);
            var intact = MeshPart("Cerâmica inteira",prop.transform,Lathe(key,contour,0,360,48,false),color);
            var glaze = SurfaceMaterial("Powdercoat",color,new(4,4),.18f,.33f,false);
            intact.GetComponent<Renderer>().sharedMaterial = glaze;
            SetPhysicalMaterial(prop,CeramicGlaze);
            var ceramic = prop.gameObject.AddComponent<BedroomCeramic>();
            ceramic.BreakSpeed = CeramicGlaze.BreakSpeed;
            var cuts = new[]
            {
                new[] { 0f,35f,116f,218f,273f,360f },
                new[] { 13f,41f,101f,156f,192f,255f,311f,373f },
                new[] { -16f,19f,63f,89f,136f,201f,235f,282f,319f,344f }
            };
            ceramic.Patterns = new BedroomCeramic.Fracture[cuts.Length];
            var edge = Painted(Color.Lerp(color,new Color(.91f,.87f,.78f),.58f));
            for (var p=0; p<cuts.Length; p++)
            {
                var cut = cuts[p];
                var pieces = new Rigidbody[cut.Length-1];
                ceramic.Patterns[p] = new BedroomCeramic.Fracture { Pieces = pieces };
                for (var i=0; i<pieces.Length; i++)
                {
                    var width = cut[i+1]-cut[i];
                    var mesh = FracturedSlice($"{key}-Fracture{p}-{i}",contour,cut[i],cut[i+1],p+1);
                    var shard = MeshPart("Caco de " + name,prop.transform,mesh,color);
                    shard.GetComponent<Renderer>().sharedMaterials = new[] { glaze,edge };
                    var collider = shard.AddComponent<MeshCollider>();
                    collider.sharedMesh = mesh;
                    collider.convex = true;
                    collider.sharedMaterial = CeramicGlaze.Surface;
                    pieces[i] = MakeShard(shard,Vector3.zero,Vector3.zero,Mathf.Max(.014f,.19f*width/360f));
                }
            }
            return ceramic;
        }

        private static Rigidbody MakeShard(GameObject shard, Vector3 center, Vector3 size, float mass)
        {
            if (size.sqrMagnitude > 0)
            {
                var box = shard.AddComponent<BoxCollider>();
                box.center = center;
                box.size = size;
            }
            var body = shard.AddComponent<Rigidbody>();
            body.mass = mass;
            body.linearDamping = .20f;
            body.angularDamping = .55f;
            body.collisionDetectionMode = CollisionDetectionMode.ContinuousSpeculative;
            shard.SetActive(false);
            return body;
        }

        private static GameObject MeshPart(string name, Transform parent, Mesh mesh, Color color)
        {
            var result = new GameObject(name,typeof(MeshFilter),typeof(MeshRenderer));
            result.transform.SetParent(parent,false);
            result.GetComponent<MeshFilter>().sharedMesh = mesh;
            result.GetComponent<MeshRenderer>().sharedMaterial = Painted(color);
            return result;
        }

        private static Mesh Lathe(string key, Vector2[] contour, float start, float end, int slices, bool caps)
        {
            var path = $"{Root}/Meshes/{key}.asset";
            var existing = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (existing) return existing;
            var points = new List<Vector3>();
            var indices = new List<int>();
            for (var j = 0; j < contour.Length; j++)
            {
                var next = (j+1)%contour.Length;
                var first = points.Count;
                for (var i = 0; i <= slices; i++)
                {
                    var angle = Mathf.Lerp(start,end,i/(float)slices)*Mathf.Deg2Rad;
                    points.Add(Polar(contour[j],angle));
                    points.Add(Polar(contour[next],angle));
                    if (i == slices) continue;
                    var index = first+i*2;
                    indices.AddRange(new[] { index,index+1,index+2,index+1,index+3,index+2 });
                }
            }
            if (caps)
            {
                AddCap(contour,i => Polar(contour[i],start*Mathf.Deg2Rad),points,indices,true);
                AddCap(contour,i => Polar(contour[i],end*Mathf.Deg2Rad),points,indices,false);
            }
            return SaveMesh(path,key,points,indices);
        }

        private static Mesh FracturedSlice(string key,Vector2[] contour,float first,float last,int pattern)
        {
            var path = $"{Root}/Meshes/{key}.asset";
            var mesh = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (mesh) return mesh;
            var points = new List<Vector3>();
            var surface = new List<int>();
            var cutFaces = new List<int>();
            var slices = Mathf.Clamp(Mathf.CeilToInt((last-first)/8f),4,15);
            for (var section=0; section<contour.Length; section++)
            {
                var next = (section+1)%contour.Length;
                var start = points.Count;
                for (var slice=0; slice<=slices; slice++)
                {
                    var t = slice/(float)slices;
                    points.Add(Polar(contour[section],Mathf.Lerp(CutAngle(first,section,pattern),CutAngle(last,section,pattern),t)));
                    points.Add(Polar(contour[next],Mathf.Lerp(CutAngle(first,next,pattern),CutAngle(last,next,pattern),t)));
                    if (slice == slices) continue;
                    var index = start+slice*2;
                    surface.AddRange(new[] { index,index+1,index+2,index+1,index+3,index+2 });
                }
            }
            AddCap(contour,i => Polar(contour[i],CutAngle(first,i,pattern)),points,cutFaces,true);
            AddCap(contour,i => Polar(contour[i],CutAngle(last,i,pattern)),points,cutFaces,false);
            mesh = new Mesh { name = key, subMeshCount = 2 };
            mesh.SetVertices(points);
            mesh.SetTriangles(surface,0);
            mesh.SetTriangles(cutFaces,1);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            AssetDatabase.CreateAsset(mesh,path);
            return mesh;
        }

        private static float CutAngle(float degrees,int section,int pattern)
        {
            var a = Mathf.Repeat(degrees,360f)*Mathf.Deg2Rad;
            var fork = Mathf.Sin(a*3f+section*1.84f+pattern*.73f)*.14f;
            var kink = Mathf.Sin(a*5f-section*.92f+pattern*1.67f)*.079f;
            return degrees*Mathf.Deg2Rad+fork+kink;
        }

        private static Vector3 Polar(Vector2 p, float angle) =>
            new(p.x * Mathf.Cos(angle),p.y,p.x * Mathf.Sin(angle));

        private static void AddCap(Vector2[] contour, Func<int,Vector3> position, List<Vector3> points, List<int> indices, bool flip)
        {
            var first = points.Count;
            for (var i=0; i<contour.Length; i++) points.Add(position(i));
            var remaining = new List<int>();
            for (var i = 0; i < contour.Length; i++) remaining.Add(i);
            while (remaining.Count >= 3)
            {
                var found = false;
                for (var i = 0; i < remaining.Count; i++)
                {
                    var a = remaining[(i+remaining.Count-1)%remaining.Count];
                    var b = remaining[i];
                    var c = remaining[(i+1)%remaining.Count];
                    if (Turn(contour[a],contour[b],contour[c]) <= 0) continue;
                    if (remaining.Exists(n => n != a && n != b && n != c &&
                        Turn(contour[a],contour[b],contour[n]) > 0 &&
                        Turn(contour[b],contour[c],contour[n]) > 0 &&
                        Turn(contour[c],contour[a],contour[n]) > 0)) continue;
                    indices.AddRange(flip ? new[] { first+a,first+c,first+b } : new[] { first+a,first+b,first+c });
                    remaining.RemoveAt(i);
                    found = true;
                    break;
                }
                if (!found) break;
            }
        }

        private static float Turn(Vector2 a, Vector2 b, Vector2 c) =>
            (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);

        private static Mesh Tube(string key, IReadOnlyList<Vector3> pathPoints, float radius)
        {
            var path = $"{Root}/Meshes/{key}.asset";
            var cached = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (cached) return cached;
            var points = new List<Vector3>();
            var indices = new List<int>();
            const int sides = 8;
            for (var i = 0; i < pathPoints.Count; i++)
            {
                var tangent = (pathPoints[Mathf.Min(i+1,pathPoints.Count-1)] - pathPoints[Mathf.Max(0,i-1)]).normalized;
                var across = Vector3.Cross(tangent, Vector3.forward).normalized;
                for (var side = 0; side < sides; side++)
                {
                    var angle = side * Mathf.PI * 2 / sides;
                    points.Add(pathPoints[i] + radius * (Vector3.forward*Mathf.Cos(angle)+across*Mathf.Sin(angle)));
                    if (i == pathPoints.Count-1) continue;
                    var a = i*sides+side;
                    var b = i*sides+(side+1)%sides;
                    indices.AddRange(new[] { a,b,a+sides,b,b+sides,a+sides });
                }
            }
            return SaveMesh(path,key,points,indices);
        }

        private static Mesh SaveMesh(string path, string key, List<Vector3> points, List<int> indices)
        {
            var mesh = new Mesh { name = key };
            mesh.SetVertices(points);
            mesh.SetTriangles(indices,0);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            AssetDatabase.CreateAsset(mesh,path);
            return mesh;
        }
    }
}
