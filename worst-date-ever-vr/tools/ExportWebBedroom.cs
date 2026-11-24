using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Threading.Tasks;
using System.Reflection;
using System.Threading;
using Newtonsoft.Json;
using UnityEditor;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using UText = UnityEngine.UI.Text;
using Object = UnityEngine.Object;

namespace WorstDateEver.Editor
{
    public sealed class ExportWebBedroom
    {
        private readonly Dictionary<Transform,string> ids = new();
        private readonly Dictionary<Material,Material> materials = new();
        private readonly List<Object> temporary = new();
        private readonly Dictionary<(string zone,Material material),List<CombineInstance>> batches = new();
        private const string ExportRoot = "Worst Date Ever Web Export";
        private readonly GameObject root = new(ExportRoot) { hideFlags = HideFlags.HideAndDontSave };
        private GameObject[] source;

        public static async Task<string> Run()
        {
            if (Application.isPlaying) throw new InvalidOperationException("Export from the generated desktop scene in Edit Mode.");
            var exporter = new ExportWebBedroom();
            try { return await exporter.Export(); }
            finally
            {
                Object.DestroyImmediate(exporter.root);
                foreach (var item in exporter.temporary) Object.DestroyImmediate(item);
            }
        }

        private IEnumerable<T> Find<T>() where T : Component =>
            source.SelectMany(item=>item.GetComponentsInChildren<T>(true));

        private string Id(Transform item)
        {
            if (!ids.TryGetValue(item,out var id))
                ids.Add(item,id="wde_"+ids.Count);
            return id;
        }

        private static float[] V(Vector3 p) => new[] { -p.x,p.y,p.z };
        private static float[] Size(Vector3 p) => new[] { p.x,p.y,p.z };
        private static float[] Q(Quaternion q) => new[] { q.x,-q.y,-q.z,q.w };
        private static float[] C(Color c) => new[] { c.r,c.g,c.b };
        private string[] R(IEnumerable<Renderer> list) => list.Select(r=>Id(r.transform)).ToArray();

        private object ColliderData(Collider collider, Transform parent)
        {
            var relative=Quaternion.Inverse(parent.rotation);
            var mat=collider.sharedMaterial;
            var offset=Vector3.zero;
            Vector3 size;
            var sphere=collider as SphereCollider;
            if (collider is BoxCollider box)
            {
                offset=box.center;
                size=box.size;
            }
            else if (sphere)
            {
                offset=sphere.center;
                size=Vector3.one*sphere.radius*2;
            }
            else if (collider is MeshCollider mesh && mesh.sharedMesh)
            {
                offset=mesh.sharedMesh.bounds.center;
                size=mesh.sharedMesh.bounds.size;
            }
            else if (collider is CapsuleCollider capsule)
            {
                offset=capsule.center;
                size=Vector3.one*capsule.radius*2;
                size[capsule.direction]=capsule.height;
            }
            else return null;
            var scale=collider.transform.lossyScale;
            size=Vector3.Scale(size,new(Mathf.Abs(scale.x),Mathf.Abs(scale.y),Mathf.Abs(scale.z)));
            return new {
                position=V(relative*(collider.transform.TransformPoint(offset)-parent.position)),
                rotation=Q(relative*collider.transform.rotation), size=Size(size), sphere=sphere!=null,
                friction=mat ? mat.dynamicFriction : .56f, bounce=mat ? mat.bounciness : .06f
            };
        }

        private object WorldCollider(BoxCollider collider) => new {
            position=V(collider.transform.position), rotation=Q(collider.transform.rotation),
            shape=ColliderData(collider,collider.transform)
        };

        private async Task<string> Export()
        {
            source=SceneManager.GetActiveScene().GetRootGameObjects().Where(item=>item!=root && item.name!=ExportRoot && item.name!="Worst Date Ever").ToArray();
            var controller=Find<BedroomController>().Single();
            var view=controller.Window;
            var street=Find<BedroomStreet>().Single();
            var door=Find<BedroomDoor>().Single();
            var mirror=Find<BedroomMirror>().Single();
            var props=Find<BedroomProp>().ToArray();
            var pulls=Find<BedroomPull>().ToArray();
            var trays=Find<BedroomDrawerTray>().ToArray();
            var station=Find<PreparationStation>().Single();
            var screen=controller.Phone.GetComponentInChildren<Canvas>(true).GetComponent<RectTransform>();
            var desktop=Camera.main;
            var ignored=street.Walkers.Select(w=>w.Root)
                .Concat(controller.Avatar.Masculine.Concat(controller.Avatar.Feminine).Select(o=>o.transform))
                .ToHashSet();
            var effects=Find<Renderer>().Where(r=>r.sharedMaterial &&
                r.sharedMaterial.shader.name.StartsWith("WorstDateEver/") &&
                r.sharedMaterial.shader.name!="WorstDateEver/BedroomSurface").ToArray();
            var specials=effects.ToDictionary(r=>Id(r.transform),r=>r.sharedMaterial.shader.name.Split('/').Last());
            var lights=Find<Light>().Where(l=>l.gameObject != desktop.gameObject).Select(l=>new {
                name=l.name, position=V(l.transform.position), direction=V(l.transform.forward),
                type=l.type.ToString(), color=C(l.color), l.intensity,l.range, angle=l.spotAngle,
                night=l.transform.IsChildOf(view.StreetLighting.transform), shadow=l.shadows!=LightShadows.None
            }).ToArray();
            var glass=Id(mirror.Glass.transform);
            var curtains=Find<BedroomCurtain>().SelectMany(c=>c.Panels).Select(p=>Id(p.transform)).ToArray();
            var metadata=new {
                props=props.Select(p=>{
                    var body=p.GetComponent<Rigidbody>();
                    var ceramic=p.GetComponent<BedroomCeramic>();
                    return new {
                        id=Id(p.transform), name=p.name, p.PreparationItem, body.mass, body.isKinematic,
                        shapes=p.GetComponents<Collider>().Where(c=>!c.isTrigger).Select(c=>ColliderData(c,p.transform)).Where(x=>x!=null).ToArray(),
                        breakSpeed=ceramic ? ceramic.BreakSpeed : 0,
                        fractures=ceramic ? ceramic.Patterns.Select(pattern=>pattern.Pieces.Select(piece=>new {
                            id=Id(piece.transform),piece.mass,
                            shapes=piece.GetComponents<Collider>().Select(c=>ColliderData(c,piece.transform)).Where(x=>x!=null).ToArray()
                        }).ToArray()).ToArray() : null
                    };
                }).ToArray(),
                soft=Find<BedroomSoftBody>().Select(s=>new {
                    core=Id(s.Core.transform), ends=s.Ends.Select(p=>Id(p.transform)).ToArray(),
                    outfit=s.Core.name switch {
                        "Camiseta de algodão"=>0,"Jaqueta com zíper"=>1,"Paletó com lapelas"=>2,_=>-1
                    },
                    limit=s.Core.Material ? s.Core.Material.BendLimit : 34,
                    spring=s.Core.Material ? s.Core.Material.BendSpring : .02f,
                    material=s.Core.Material ? s.Core.Material.name : "Cotton Jersey"
                }).ToArray(),
                garments=Find<BedroomGarment>().Select(g=>new {
                    core=Id(g.Item.Core.transform), bones=g.Bones.Select(Id).ToArray(), bend=g.Bend, damp=g.Damp
                }).ToArray(),
                colliders=Find<BoxCollider>().Where(c=>c.enabled && c.gameObject.activeInHierarchy && !c.isTrigger &&
                    !c.GetComponentInParent<BedroomProp>() && !c.GetComponentInParent<BedroomDrawerTray>() &&
                    !c.GetComponentInParent<BedroomDoor>()).Select(WorldCollider).ToArray(),
                pulls=pulls.Select(p=>new {
                    id=Id(p.transform), name=p.name, direction=V(p.Anchor.TransformDirection(p.Axis)), p.Travel,
                    drawer=p.SlidingBox ? Id(p.SlidingBox.transform) : null,
                    cord=p.Cord ? V(p.Cord.transform.TransformPoint(p.Cord.GetPosition(0))) : null
                }).ToArray(),
                drawers=trays.Select(t=>new {
                    id=Id(t.transform),
                    shapes=t.GetComponentsInChildren<BoxCollider>().Where(c=>!c.GetComponentInParent<BedroomProp>()).Select(c=>ColliderData(c,t.transform)).ToArray(),
                    frog=Find<BedroomDrawerLoad>().FirstOrDefault(l=>l.Tray==t)?.SpringToy is BedroomProp frog && frog ? Id(frog.transform) : null
                }).ToArray(),
                door=new { id=Id(door.transform),handle=Id(door.Handle.transform),
                    shapes=door.GetComponentsInChildren<BoxCollider>().Where(c=>!c.GetComponentInParent<BedroomProp>()).Select(c=>ColliderData(c,door.transform)).ToArray() },
                station=WorldCollider(station.GetComponent<BoxCollider>()),
                phone=new { id=Id(controller.Phone.transform), screen=V(screen.localPosition),
                    size=new[] {screen.rect.width*screen.localScale.x,screen.rect.height*screen.localScale.y} },
                mirror=glass, monitor=Id(controller.Monitor.transform), curtains, lights, specials,
                window=new { sky=Id(view.Sky.transform), clouds=R(view.Clouds), panes=R(view.NeighborWindows),
                    mountains=R(view.Mountains), beams=Id(view.Beams.transform), fixtures=Id(view.StreetLighting.transform),
                    birds=view.Birds.Select(b=>new { body=Id(b.Body),left=Id(b.LeftWing),right=Id(b.RightWing) }).ToArray() },
                cars=street.Vehicles.Select(car=>new { id=Id(car.Root),route=car.Route.Select(V).ToArray(),
                    car.Stop,car.Initial,car.TopSpeed,car.WheelRadius,
                    wheels=car.Wheels.Select(Id).ToArray(), rear=R(car.RearLights), front=R(car.Headlights) }).ToArray(),
                signals=street.Signals.Select(s=>R(new[] {s.Red,s.Amber,s.Green})).ToArray(),
                walkers=street.Walkers.Select(w=>new { w.Root.name,w.Phase,w.Rest,w.Speed,w.Postal,
                    route=w.Route.Select(V).ToArray(), model=CharacterAsset(w.Model),
                    height=Bounds(w.Model.GetComponentsInChildren<Renderer>()).size.y }).ToArray(),
                text=Find<UText>().Where(t=>t.gameObject.activeInHierarchy && !t.transform.IsChildOf(screen))
                    .Select(t=>new { t.text,color=C(t.color),t.fontSize, t.alignment,
                        position=V(t.rectTransform.position), rotation=Q(t.rectTransform.rotation),
                        size=new[] {t.rectTransform.rect.width*t.transform.lossyScale.x,t.rectTransform.rect.height*t.transform.lossyScale.y} })
                    .Where(t=>t.size[0]<5 && t.size[1]<5).ToArray(),
                start=V(desktop.transform.position), forward=V(desktop.transform.forward)
            };
            var nodes=ids.ToDictionary(p=>p.Key,p=>new GameObject(p.Value).transform);
            foreach (var (original,copy) in nodes)
            {
                var parent=Owner(original.parent,nodes);
                copy.SetParent(parent ? nodes[parent] : root.transform,false);
                var matrix=(parent ? parent.worldToLocalMatrix : Matrix4x4.identity)*original.localToWorldMatrix;
                copy.SetLocalPositionAndRotation(matrix.GetPosition(),matrix.rotation);
                copy.localScale=matrix.lossyScale;
            }
            foreach (var renderer in Find<MeshRenderer>())
            {
                if (!renderer.enabled && renderer.transform!=mirror.Glass.transform) continue;
                if (Ancestor(renderer.transform,ignored)) continue;
                var filter=renderer.GetComponent<MeshFilter>();
                if (!filter || !filter.sharedMesh) continue;
                var owner=Owner(renderer.transform,nodes);
                if (!owner && !renderer.gameObject.activeInHierarchy) continue;
                var zone=renderer.transform.IsChildOf(street.transform) ? "street" :
                    renderer.transform.IsChildOf(view.Sky.transform) ? "sky" : "room";
                var mesh=Project(filter.sharedMesh,renderer);
                if (owner)
                {
                    var parent=nodes[owner];
                    if (renderer.transform!=owner)
                    {
                        var item=new GameObject(renderer.name).transform;
                        item.SetParent(parent,false);
                        var matrix=owner.worldToLocalMatrix*renderer.localToWorldMatrix;
                        item.SetLocalPositionAndRotation(matrix.GetPosition(),matrix.rotation);
                        item.localScale=matrix.lossyScale;
                        parent=item;
                    }
                    parent.gameObject.AddComponent<MeshFilter>().sharedMesh=mesh;
                    parent.gameObject.AddComponent<MeshRenderer>().sharedMaterials=renderer.sharedMaterials.Select(Convert).ToArray();
                }
                else
                {
                    var all=renderer.sharedMaterials;
                    for(var i=0;i<Mathf.Min(all.Length,mesh.subMeshCount);i++)
                    {
                        if (!all[i]) continue;
                        var key=(zone,Convert(all[i]));
                        if (!batches.TryGetValue(key,out var list)) batches.Add(key,list=new());
                        list.Add(new CombineInstance { mesh=mesh,subMeshIndex=i,transform=renderer.localToWorldMatrix });
                    }
                }
            }
            foreach (var renderer in Find<SkinnedMeshRenderer>())
            {
                if (!renderer.enabled || !renderer.sharedMesh || Ancestor(renderer.transform,ignored)) continue;
                var owner=Owner(renderer.transform,nodes);
                if (!owner || !renderer.bones.All(bone=>bone && nodes.ContainsKey(bone))) continue;
                var target=nodes[owner];
                if (renderer.transform!=owner)
                {
                    target=new GameObject(renderer.name).transform;
                    target.SetParent(nodes[owner],false);
                    var matrix=owner.worldToLocalMatrix*renderer.localToWorldMatrix;
                    target.SetLocalPositionAndRotation(matrix.GetPosition(),matrix.rotation);
                    target.localScale=matrix.lossyScale;
                }
                var skin=target.gameObject.AddComponent<SkinnedMeshRenderer>();
                skin.sharedMesh=renderer.sharedMesh;
                skin.sharedMaterials=renderer.sharedMaterials.Select(Convert).ToArray();
                skin.bones=renderer.bones.Select(bone=>nodes[bone]).ToArray();
                skin.rootBone=nodes[renderer.rootBone];
                skin.localBounds=renderer.localBounds;
            }
            foreach (var (key,list) in batches)
            {
                var mesh=new Mesh { name=key.material.name,indexFormat=UnityEngine.Rendering.IndexFormat.UInt32 };
                temporary.Add(mesh);
                mesh.CombineMeshes(list.ToArray());
                var batch=new GameObject(key.zone+"_"+key.material.name,typeof(MeshFilter),typeof(MeshRenderer));
                batch.transform.SetParent(root.transform,false);
                batch.GetComponent<MeshFilter>().sharedMesh=mesh;
                batch.GetComponent<MeshRenderer>().sharedMaterial=key.material;
            }
            var runtime=Path.GetFullPath(Path.Combine(Application.dataPath,"../../public/assets/bedroom"));
            Directory.CreateDirectory(runtime);
            var exporter=Assembly.Load("glTFast.Export");
            var settingsType=exporter.GetType("GLTFast.Export.ExportSettings",true);
            var settings=Activator.CreateInstance(settingsType);
            SetEnum("Format","Binary");
            SetEnum("PreservedVertexAttributes","Color");
            SetEnum("FileConflictResolution","Overwrite");
            var outputType=exporter.GetType("GLTFast.Export.GameObjectExport",true);
            var output=Activator.CreateInstance(outputType,new[] { settings,null,null,null,null });
            outputType.GetMethod("AddScene",new[] { typeof(GameObject[]),typeof(string) })
                .Invoke(output,new object[] {new[] {root},"Bedroom and neighborhood"});
            var working=Path.GetTempFileName();
            try
            {
                var save=outputType.GetMethod("SaveToFileAndDispose",new[] {typeof(string),typeof(CancellationToken)});
                var write=(Task<bool>)save.Invoke(output,new object[] {working,CancellationToken.None});
                if (!await write) throw new InvalidOperationException("Could not write the web scene.");
                using var file=File.OpenRead(working);
                using var packed=File.Create(Path.Combine(runtime,"scene.glb.gz"));
                using var gzip=new GZipStream(packed,System.IO.Compression.CompressionLevel.Optimal);
                file.CopyTo(gzip);
            }
            finally { File.Delete(working); }
            void SetEnum(string key,string value)
            {
                var property=settingsType.GetProperty(key);
                property.SetValue(settings,Enum.Parse(property.PropertyType,value));
            }
            File.WriteAllText(Path.Combine(runtime,"scene.json"),JsonConvert.SerializeObject(metadata));
            CopyAssets(runtime);
            return $"Exported {ids.Count} interactive nodes and {batches.Count} static batches.";
        }

        private static Transform Owner(Transform item,Dictionary<Transform,Transform> nodes)
        {
            for (; item; item=item.parent) if (nodes.ContainsKey(item)) return item;
            return null;
        }

        private static bool Ancestor(Transform item,HashSet<Transform> nodes)
        {
            for (; item; item=item.parent) if (nodes.Contains(item)) return true;
            return false;
        }

        private static Bounds Bounds(Renderer[] renderers)
        {
            var bounds=renderers[0].bounds;
            foreach(var renderer in renderers.Skip(1)) bounds.Encapsulate(renderer.bounds);
            return bounds;
        }

        private static string CharacterAsset(GameObject model)
        {
            foreach (var filter in model.GetComponentsInChildren<SkinnedMeshRenderer>())
            {
                var path=AssetDatabase.GetAssetPath(filter.sharedMesh);
                if (path.EndsWith(".glb",StringComparison.OrdinalIgnoreCase)) return Path.GetFileName(path);
            }
            throw new InvalidOperationException("Cannot resolve the source character for "+model.name);
        }

        private Mesh Project(Mesh mesh,Renderer renderer)
        {
            var material=renderer.sharedMaterial;
            if (!material || material.shader.name!="WorstDateEver/BedroomSurface") return mesh;
            var positions=mesh.vertices;
            var scale=renderer.transform.lossyScale;
            var normals=mesh.normals;
            var frequency=material.GetVector("_Frequency");
            if (positions.Length!=normals.Length || material.GetFloat("_UseUV")>.5f) return mesh;
            var uv=new Vector2[positions.Length];
            for (var i=0;i<positions.Length;i++)
            {
                var p=Vector3.Scale(positions[i],scale);
                var n=normals[i];
                var ax=Mathf.Abs(n.x); var ay=Mathf.Abs(n.y); var az=Mathf.Abs(n.z);
                uv[i]=ax>ay && ax>az ? new(p.z*frequency.x,p.y*frequency.y)
                    : ay>az ? new(p.x*frequency.x,p.z*frequency.y) : new(p.x*frequency.x,p.y*frequency.y);
            }
            var copy=Object.Instantiate(mesh);
            temporary.Add(copy);
            copy.uv=uv;
            return copy;
        }

        private Material Convert(Material material)
        {
            if (!material) return null;
            if (materials.TryGetValue(material,out var saved)) return saved;
            var shader=material.shader.name;
            var target=shader.Contains("Unlit") ? "Unlit/Color" : "Standard";
            var copy=new Material(Shader.Find(target)) { name=material.name };
            temporary.Add(copy);
            materials.Add(material,copy);
            var imported=material.HasProperty("baseColorFactor");
            var tint=imported ? (Color)material.GetVector("baseColorFactor")
                : material.HasProperty("_BaseColor") ? material.GetColor("_BaseColor")
                : material.HasProperty("_Color") ? material.GetColor("_Color") : Color.white;
            copy.color=tint;
            if (target=="Standard")
            {
                var texture=imported && material.HasProperty("baseColorTexture") ? material.GetTexture("baseColorTexture")
                    : material.HasProperty("_BaseMap") ? material.GetTexture("_BaseMap")
                    : material.HasProperty("_MainTex") ? material.GetTexture("_MainTex") : null;
                copy.mainTexture=texture;
                copy.SetFloat("_Glossiness",imported && material.HasProperty("roughnessFactor")
                    ? 1-material.GetFloat("roughnessFactor")
                    : material.HasProperty("_Smoothness") ? material.GetFloat("_Smoothness") : .19f);
                if (imported && material.HasProperty("metallicFactor"))
                    copy.SetFloat("_Metallic",material.GetFloat("metallicFactor"));
                if (material.HasProperty("_UseUV") && material.GetFloat("_UseUV")>.5f)
                {
                    var frequency=material.GetVector("_Frequency");
                    copy.mainTextureScale=new Vector2(frequency.x,frequency.y);
                }
            }
            return copy;
        }

        private static void CopyAssets(string destination)
        {
            var source=Path.Combine(Application.dataPath,"WorstDateEver");
            foreach (var group in new[] { "Models/Characters","Models/Traffic","Models/Horizon" })
            {
                var dir=Path.Combine(destination,Path.GetFileName(group));
                Directory.CreateDirectory(dir);
                foreach(var file in Directory.GetFiles(Path.Combine(source,group)))
                    if (file.EndsWith(".png") || file.EndsWith(".md") || file.EndsWith(".glb") && group.EndsWith("Characters"))
                        File.Copy(file,Path.Combine(dir,Path.GetFileName(file)),true);
            }
            foreach (var file in new[] { "PhoneWallpaper.png","BadDateIcon.png","Desktop.png","ATTRIBUTION.md" })
                File.Copy(Path.Combine(source,"Textures",file),Path.Combine(destination,file),true);
            foreach (var file in new[] { "ATTRIBUTION.md" })
                File.Copy(Path.Combine(source,"Models/FurnishedBedroom",file),Path.Combine(destination,"Furniture-"+file),true);
        }
    }
}
