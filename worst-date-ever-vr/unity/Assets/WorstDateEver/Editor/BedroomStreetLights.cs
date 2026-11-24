using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace WorstDateEver.Editor
{
    public static partial class BuildBedroom
    {
        private static readonly Color LampWarmth = new(1f,.71f,.38f);

        private static void BuildStreetLights(BedroomWindowView view,Vector3[] road)
        {
            var lighting=new GameObject("Iluminação noturna da rua");
            view.StreetLighting=lighting;
            var sites=new[] {
                (new Vector2(-4.73f,5.38f),new Vector2(-4.60f,7.70f)),
                (new Vector2(4.92f,12.24f),new Vector2(4.70f,7.75f)),
                (new Vector2(-12.23f,-.42f),new Vector2(-10f,-.78f)),
                (new Vector2(12.23f,-.80f),new Vector2(10f,-.93f)),
                (new Vector2(-4.40f,-10.28f),new Vector2(-4.40f,-8f)),
                (new Vector2(4.52f,-5.54f),new Vector2(4.52f,-7.92f))
            };
            var occluders=Object.FindObjectsByType<Renderer>(FindObjectsSortMode.None)
                .Where(r=>r.name is "Alvenaria da loja" or "Casa vizinha" or "Caixa postal" or "Pé do banco" or
                    "Ripa do banco" or "Poste do semáforo" or "Tronco")
                .Select(r=>r.bounds).ToArray();
            for (var index=0;index<sites.Length;index++)
            {
                var (baseXZ,poolXZ)=sites[index];
                var baseAt=new Vector3(baseXZ.x,WalkHeight,baseXZ.y);
                var aim=new Vector3(poolXZ.x,StreetHeight,poolXZ.y);
                var roadside=Vector3.ProjectOnPlane(aim-baseAt,Vector3.up).normalized;
                var source=baseAt+Vector3.up*3.28f+roadside*.54f;
                var post=Rounded("Flange de poste",baseAt+Vector3.up*.05f,new(.28f,.10f,.25f),.022f,Charcoal);
                ApplySurface(post,"Powdercoat",Charcoal,new(2,2),.31f,.30f);
                Shape("Poste de luz",baseAt+Vector3.up*1.64f,new(.093f,3.28f,.093f),Charcoal,PrimitiveType.Cylinder,false);
                var arm=Rounded("Braço do poste",baseAt+Vector3.up*3.28f+roadside*.25f,new(.095f,.10f,.62f),.032f,Charcoal);
                arm.transform.rotation=Quaternion.LookRotation(roadside);
                var head=Rounded("Carcaça da luminária",source+Vector3.up*.04f,
                    new(.36f,.13f,.52f),.06f,Charcoal);
                head.transform.rotation=Quaternion.LookRotation(roadside);
                var lens=Rounded("Difusor do poste",source-Vector3.up*.036f,
                    new(.224f,.035f,.36f),.016f,new(.71f,.62f,.45f));
                lens.transform.rotation=Quaternion.LookRotation(roadside);
                var glow=Rounded("Emissão do difusor",source-Vector3.up*.055f,new(.217f,.016f,.348f),.007f,LampWarmth);
                glow.transform.rotation=lens.transform.rotation;
                Backdrop(glow,LampWarmth);
                glow.transform.SetParent(lighting.transform,true);

                var halo=GameObject.CreatePrimitive(PrimitiveType.Quad);
                halo.name="Brilho e dispersão cromática do poste";
                Object.DestroyImmediate(halo.GetComponent<Collider>());
                halo.transform.SetParent(lighting.transform,false);
                halo.transform.position=source-Vector3.up*.085f;
                halo.transform.localScale=Vector3.one*1.52f;
                var aura=halo.GetComponent<MeshRenderer>();
                aura.sharedMaterial=EffectMaterial("StreetLampHalo");
                aura.shadowCastingMode=ShadowCastingMode.Off;
                aura.receiveShadows=false;

                BakeLampPool(lighting.transform,road,occluders,source,aim,index);

                // The two lamps seen from the bedroom also cast shadows from moving pedestrians and cars.
                if (index>1) continue;
                var spot=Lighting("Luz do poste com sombras dinâmicas",source,LightType.Spot,LampWarmth,index==0 ? 4.4f : 3.8f,8.5f);
                spot.transform.SetParent(lighting.transform,true);
                spot.transform.rotation=Quaternion.LookRotation(aim-source);
                spot.spotAngle=87;
                spot.innerSpotAngle=50;
                spot.shadows=LightShadows.Soft;
                spot.shadowStrength=.80f;
                spot.shadowBias=.042f;
                spot.shadowNormalBias=.21f;
                spot.shadowCustomResolution=512;
                spot.renderMode=index==0 ? LightRenderMode.ForcePixel : LightRenderMode.Auto;
            }
            lighting.SetActive(false);
        }

        // Sample visibility from multiple points on each emitter into a static light mesh.
        // The render-time spot lights supply the dynamic shadows. The mesh also lights the four distant lamps.
        private static void BakeLampPool(Transform parent,Vector3[] road,Bounds[] blockers,
            Vector3 source,Vector3 aim,int index)
        {
            const int cells=55;
            const float span=9.35f;
            var receiver=new List<Vector3>();
            var triangles=new List<int>();
            var colors=new List<Color>();
            var direction=(aim-source).normalized;
            var nearBlockers=blockers.Where(b=>b.SqrDistance(source)<80).ToArray();
            var emitters=new[] { Vector3.zero,Vector3.left*.12f,Vector3.right*.12f,
                Vector3.back*.16f,Vector3.forward*.16f };
            var strength=new float[cells+1,cells+1];
            var plane=new float[cells+1,cells+1];
            for (var z=0;z<=cells;z++)
            for (var x=0;x<=cells;x++)
            {
                var p=GridPoint(x,z);
                var routeDistance=BedroomStreet.RouteDistance(road,p);
                var distance=Vector3.Distance(BedroomStreet.RoutePoint(road,routeDistance,true,out _),p);
                var height=distance<RoadHalfWidth ? StreetHeight : distance<RoadHalfWidth+WalkWidth ? WalkHeight : -.246f;
                plane[x,z]=height+.009f;
                p.y=height+.018f;
                var beam=p-source;
                var cone=Mathf.SmoothStep(0,1,Mathf.InverseLerp(.65f,.94f,Vector3.Dot(beam.normalized,direction)));
                if (cone<.001f) continue;
                var hits=0;
                foreach (var sample in emitters)
                {
                    var ray=(source+sample)-p;
                    var sight=new Ray(p,ray.normalized);
                    if (!nearBlockers.Any(b=>b.IntersectRay(sight,out var hit)&&hit<ray.magnitude-.06f)) hits++;
                }
                var attenuation=1f/(1f+.13f*beam.sqrMagnitude);
                var edge=Mathf.SmoothStep(0,1,Mathf.Min(x,z,cells-x,cells-z)/7f);
                strength[x,z]=cone*attenuation*edge*(hits/(float)emitters.Length)*(index<2 ? .56f : 1f);
            }
            for (var z=0;z<cells;z++)
            for (var x=0;x<cells;x++)
            {
                var quad=new[] { (x,z),(x,z+1),(x+1,z),(x+1,z+1) };
                if (!quad.Any(v=>strength[v.Item1,v.Item2]>.001f)) continue;
                var mark=receiver.Count;
                foreach (var (sx,sz) in quad)
                {
                    var pos=GridPoint(sx,sz);
                    pos.y=plane[sx,sz];
                    receiver.Add(pos);
                    colors.Add(new Color(LampWarmth.r,LampWarmth.g,LampWarmth.b,strength[sx,sz]));
                }
                triangles.AddRange(new[] { mark,mark+1,mark+2,mark+1,mark+3,mark+2 });
            }
            var mesh=RefreshStreetMesh($"{Root}/Meshes/StreetLightPool-{index}.asset","Luz traçada do poste",receiver,triangles);
            mesh.SetColors(colors);
            EditorUtility.SetDirty(mesh);
            var display=MeshPart("Luz traçada do poste",parent,mesh,LampWarmth).GetComponent<Renderer>();
            display.sharedMaterial=EffectMaterial("StreetLightPool");
            display.shadowCastingMode=ShadowCastingMode.Off;
            display.receiveShadows=false;

            Vector3 GridPoint(int x,int z)=>aim+new Vector3((x/(float)cells-.5f)*span,-aim.y,(z/(float)cells-.5f)*span);
        }
    }
}
