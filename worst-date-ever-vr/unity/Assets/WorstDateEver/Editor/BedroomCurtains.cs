using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace WorstDateEver.Editor
{
    public static partial class BuildBedroom
    {
        private static void DressCurtains(float left,float right,float top,float bottom)
        {
            var width = right-left+.32f;
            var rod = Shape("Varão de aço escovado",new((left+right)*.5f,top+.078f,3.124f),
                new(.027f,width,.027f),Charcoal,PrimitiveType.Cylinder,false);
            rod.transform.rotation=Quaternion.Euler(0,0,90);
            var group = new GameObject("Cortinas de linho").AddComponent<BedroomCurtain>();
            group.Panels = new MeshFilter[2];
            for (var i=0; i<2; i++)
            {
                var side = i==0 ? -1 : 1;
                var surface = new GameObject(i==0 ? "Painel esquerdo" : "Painel direito",
                    typeof(MeshFilter),typeof(MeshRenderer),typeof(BoxCollider));
                surface.transform.SetParent(group.transform);
                surface.transform.position = new Vector3(i==0 ? left+.032f : right-.032f,top+.043f,3.114f);
                var height = top-bottom+.138f;
                var material = CurtainMaterial();
                surface.GetComponent<Renderer>().sharedMaterial = material;
                var filter = surface.GetComponent<MeshFilter>();
                filter.sharedMesh = CurtainMesh(side,height);
                group.Panels[i] = filter;
                var box = surface.GetComponent<BoxCollider>();
                box.center = new Vector3(0,-height*.5f,0);
                box.size = new Vector3(.315f,height,.20f);
                box.isTrigger = true;
                surface.AddComponent<BedroomCurtainContact>().Curtain = group;
                for (var hook=0; hook<5; hook++)
                    Orb("Presilha do linho",surface.transform.position+new Vector3((hook-2)*.063f,.018f,0),
                        new(.034f,.043f,.037f),Brass);
            }
        }

        private static Mesh CurtainMesh(int side,float height)
        {
            var key = $"LinenPanel-{side}";
            var path = $"{Root}/Meshes/{key}.asset";
            var stored = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (stored) return stored;
            var points = new List<Vector3>();
            var uv = new List<Vector2>();
            var indices = new List<int>();
            const int cols = BedroomCurtain.Columns, rows = BedroomCurtain.Rows;
            for (var row=0; row<rows; row++)
            for (var col=0; col<cols; col++)
            {
                var u = col/(float)(cols-1);
                var v = row/(float)(rows-1);
                var x = (u-.5f)*(.264f+.075f*v)+side*(v*.015f+Mathf.Sin(v*2.9f)*.024f);
                var y = -v*height+.014f*Mathf.Sin(u*15f)*v*v*v;
                var z = Mathf.Sin(u*6f*Mathf.PI*2f+v*.54f)*(.025f-.007f*v)+Mathf.Sin(u*9+v*8f)*.004f*v;
                points.Add(new Vector3(x,y,z));
                uv.Add(new Vector2(u*.46f,-v*height));
                var i = points.Count-1;
                if (row<rows-1 && col<cols-1)
                    indices.AddRange(new[] { i,i+1,i+cols,i+1,i+cols+1,i+cols });
            }

            var mesh = SaveMesh(path,key,points,indices);
            mesh.SetUVs(0,uv);
            EditorUtility.SetDirty(mesh);
            return mesh;
        }

        private static Material CurtainMaterial()
        {
            var path = Root + "/Materials/WovenCurtain.mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material) return material;
            material = new Material(SurfaceMaterial("Weave",new Color(.87f,.81f,.69f),new Vector2(6,6),.59f,.09f,true));
            material.SetInt("_Cull",0);
            AssetDatabase.CreateAsset(material,path);
            return material;
        }
    }
}
