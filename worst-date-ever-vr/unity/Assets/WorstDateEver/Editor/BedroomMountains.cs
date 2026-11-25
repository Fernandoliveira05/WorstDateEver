using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace WorstDateEver.Editor
{
    public static partial class BuildBedroom
    {
        private static void BuildMountainHorizon(BedroomWindowView view)
        {
            var parent=new GameObject("Serras do horizonte").transform;
            var ridges=new List<Renderer>();
            Add("ValleyTerrain",new(-9,-3.8f,49),new(87,16.6f,37),192,new(.35f,.43f,.46f));
            Add("ValleyTerrain",new(40,-4f,21),new(55,13,24),85,new(.38f,.44f,.47f));
            Add("ValleyTerrain",new(-39,-4f,-1),new(71,13,24),-86,new(.36f,.44f,.45f));
            Add("ValleyTerrain",new(2,-4f,-47),new(78,14,26),7,new(.38f,.44f,.48f));
            Add("Mountain",new(-21,-4.8f,37),new(38,13.2f,23),174,new(.31f,.40f,.43f));
            Add("Mountain",new(20,-4.6f,40),new(43,14.5f,24),-22,new(.34f,.41f,.45f));
            ridges.Add(HorizonMeadow(parent));
            view.Mountains=ridges.ToArray();

            void Add(string key,Vector3 position,Vector3 size,float yaw,Color tint)
            {
                var asset=AssetDatabase.LoadAssetAtPath<GameObject>($"{Root}/Models/Horizon/{key}.glb");
                if (!asset) throw new System.InvalidOperationException("Modelo da serra ainda não importado: "+key);
                var model=(GameObject)PrefabUtility.InstantiatePrefab(asset);
                var local=model.GetComponentsInChildren<Renderer>();
                var bounds=BoundsOf(local);
                var pivot=new GameObject("Serra · "+key).transform;
                pivot.SetParent(parent,false);
                model.transform.SetParent(pivot,true);
                model.transform.localPosition-=new Vector3(bounds.center.x,bounds.min.y,bounds.center.z);
                pivot.localScale=new Vector3(size.x/bounds.size.x,size.y/bounds.size.y,size.z/bounds.size.z);
                pivot.SetPositionAndRotation(position,Quaternion.Euler(0,yaw,0));
                foreach (var renderer in local)
                {
                    renderer.sharedMaterials=renderer.sharedMaterials.Select(_=>MountainMaterial(key,tint)).ToArray();
                    renderer.shadowCastingMode=ShadowCastingMode.Off;
                    renderer.receiveShadows=false;
                    ridges.Add(renderer);
                }
            }
        }

        private static Renderer HorizonMeadow(Transform parent)
        {
            const int segments=36;
            const float step=4.4f;
            var vertices=new List<Vector3>();
            var indices=new List<int>();
            for (var z=0;z<=segments;z++)
            for (var x=0;x<=segments;x++)
            {
                var worldX=(x-segments*.5f)*step;
                var worldZ=(z-segments*.5f)*step;
                var rim=Mathf.SmoothStep(0,1,Mathf.InverseLerp(24,57,
                    new Vector2(worldX*.95f,worldZ).magnitude));
                var roll=Mathf.PerlinNoise((worldX+100)*.048f,(worldZ+100)*.055f);
                vertices.Add(new(worldX,-.36f+rim*(.15f+4.6f*roll),worldZ));
                if (x==segments||z==segments) continue;
                var a=z*(segments+1)+x;
                var b=a+segments+1;
                indices.AddRange(new[] { a,b,a+1,a+1,b,b+1 });
            }
            var path=Root+"/Meshes/HorizonMeadow.asset";
            var mesh=RefreshStreetMesh(path,"Relevo ao redor do bairro",vertices,indices);
            var renderer=MeshPart("Campos no horizonte",parent,mesh,StreetGreen).GetComponent<Renderer>();
            renderer.sharedMaterial=MountainMaterial("Meadow",new(.45f,.54f,.38f));
            renderer.shadowCastingMode=ShadowCastingMode.Off;
            return renderer;
        }

        private static Material MountainMaterial(string key,Color tint)
        {
            var path=$"{Root}/Materials/Horizon-{key}-{ColorUtility.ToHtmlStringRGB(tint)}.mat";
            var material=AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material) return material;
            material=new Material(EffectMaterial("MountainHaze"));
            material.SetColor("_Tint",tint);
            AssetDatabase.CreateAsset(material,path);
            return material;
        }
    }
}
