using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace WorstDateEver.Editor
{
    public static partial class BuildBedroom
    {
        private static void DressExterior(BedroomWindowView view)
        {
            var sky = Block("Céu panorâmico",new(0,0,4f),new(178f,105f,178f),Linen,false);
            sky.GetComponent<Renderer>().sharedMaterial = EffectMaterial("GoldenSky");
            sky.GetComponent<Renderer>().shadowCastingMode = ShadowCastingMode.Off;
            view.Sky = sky.GetComponent<Renderer>();
            view.Clouds = new Renderer[7];
            view.Birds = new BedroomWindowView.Bird[5];
            var windows = new List<Renderer>();

            BuildMountainHorizon(view);
            for (var i=0; i<view.Clouds.Length; i++)
            {
                var cloud = Orb("Nuvem em movimento",new(-7.3f+i*3.5f,8.9f+Mathf.Sin(i*1.6f)*1.14f,28.8f+i*1.05f),
                    new(3.3f+(i%3)*1.07f,.43f+.12f*(i%3),1.22f),Linen);
                Backdrop(cloud,new(.92f,.76f,.65f));
                view.Clouds[i] = cloud.GetComponent<Renderer>();
                for (var layer=0; layer<3; layer++)
                {
                    var streak = Orb("Filamento da nuvem",cloud.transform.position+new Vector3(-1.15f+layer*.96f,
                        .14f-Mathf.Abs(layer-1)*.13f,-.27f),new(2.02f+layer*.15f,.39f-layer*.054f,.86f),Linen);
                    Backdrop(streak,new(.92f,.76f,.65f));
                    streak.transform.SetParent(cloud.transform,true);
                }
            }
            for (var i=0; i<view.Birds.Length; i++) view.Birds[i] = ExteriorBird(i);

            BuildNeighborhood(view,windows);
            view.NeighborWindows = windows.ToArray();
        }

        private static BedroomWindowView.Bird ExteriorBird(int index)
        {
            var frame = new GameObject("Pássaro no bairro").transform;
            frame.position = new(-6+index*.5f,3.4f+index*.17f,10.1f+index*.42f);
            var body = Orb("Corpo",frame.position,new(.19f,.068f,.064f),Ink);
            Backdrop(body,new(.18f,.17f,.19f));
            body.transform.SetParent(frame,true);
            Transform Wing(float side)
            {
                var pivot = new GameObject("Asa").transform;
                pivot.SetParent(frame,false);
                var wing = Orb("Penas",Vector3.zero,new(.132f,.019f,.174f),Ink);
                Backdrop(wing,new(.19f,.18f,.20f));
                wing.transform.SetParent(pivot,false);
                wing.transform.localPosition = new(-.019f,0,side*.097f);
                wing.transform.localRotation = Quaternion.Euler(0,side*19f,0);
                return pivot;
            }
            return new BedroomWindowView.Bird { Body = frame, LeftWing = Wing(-1), RightWing = Wing(1) };
        }

        private static void ExteriorHouse(Vector3 p, float size, Color plaster, Color roof, List<Renderer> windows)
        {
            var walls = Rounded("Casa vizinha",p+Vector3.up*.85f*size,
                new Vector3(2.02f,1.70f,1.43f)*size,.018f,plaster);
            ApplySurface(walls,"Powdercoat",plaster,new(1,1),.41f,.11f);
            var foundation = Rounded("Base de alvenaria",p+new Vector3(0,.16f,-.718f)*size,
                new Vector3(2.034f,.28f,.035f)*size,.006f,Clay);
            ApplySurface(foundation,"Brick",new(.78f,.61f,.53f),new(.91f,1.02f),.60f,.11f);
            Rounded("Degrau da entrada",p+new Vector3(0,.066f,-.831f)*size,new Vector3(.59f,.129f,.24f)*size,.009f,Concrete);
            AddGable(p+Vector3.up*1.685f*size,size,plaster);
            for (var side=-1; side<=1; side+=2)
            {
                var roofPart = Rounded("Caimento do telhado",p+new Vector3(side*.48f,2.03f,0)*size,
                    new Vector3(1.32f,.14f,1.67f)*size,.036f,roof);
                roofPart.transform.rotation = Quaternion.Euler(0,0,side*-30);
                ApplySurface(roofPart,"RoofTiles",roof,new(.91f,1.08f),.64f,.15f);
                for (var i=0; i<4; i++)
                {
                    var tile = Rounded("Friso do telhado",new Vector3(0,0,0),
                        new Vector3(1.34f,.056f,.05f)*size,.020f,roof*.87f);
                    tile.transform.SetParent(roofPart.transform,false);
                    tile.transform.localPosition = new Vector3(0,.081f,(-.60f+i*.39f)*size);
                }
                var window = p+new Vector3(side*.55f,1.24f,-.73f)*size;
                Rounded("Caixilho da casa",window,new Vector3(.43f,.47f,.057f)*size,.018f,Linen);
                var glass = Rounded("Vidro da casa",window+Vector3.back*.034f,
                    new Vector3(.35f,.38f,.018f)*size,.008f,new(.34f,.44f,.49f));
                Backdrop(glass,new(.34f,.44f,.49f));
                windows.Add(glass.GetComponent<Renderer>());
                Rounded("Divisão do vidro",window+Vector3.back*.047f,
                    new Vector3(.028f,.40f,.014f)*size,.006f,Linen);
                var sill = Rounded("Peitoril da casa",window+new Vector3(0,-.257f,-.046f)*size,
                    new Vector3(.54f,.061f,.13f)*size,.006f,Paper);
                ApplySurface(sill,"Concrete",Paper,new(2,2),.32f,.14f);
                foreach (var shutter in new[] {-1f,1f})
                    Rounded("Veneziana",window+new Vector3(shutter*.274f,0,-.024f)*size,
                        new Vector3(.106f,.423f,.047f)*size,.010f,SlateTeal);
            }
            var door=Rounded("Porta da casa",p+new Vector3(0,.44f,-.725f)*size,new Vector3(.39f,.88f,.045f)*size,.012f,Wood);
            ApplySurface(door,"Walnut",new(.86f,.74f,.64f),new(1,1),.57f,.22f);
            Orb("Maçaneta da casa",p+new Vector3(.13f,.43f,-.755f)*size,Vector3.one*.041f*size,Brass);
            Rounded("Chaminé",p+new Vector3(.61f,2.24f,.34f)*size,new Vector3(.25f,.64f,.26f)*size,.033f,roof);
        }

        private static void AddGable(Vector3 position, float size, Color color)
        {
            var path = Root + "/Meshes/ExteriorGable.asset";
            var mesh = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (!mesh)
            {
                mesh = new Mesh { name = "Empena" };
                mesh.vertices = new[] { new Vector3(-1,0,-.70f), new(1,0,-.70f), new(0,.58f,-.70f),
                    new(-1,0,.70f), new(1,0,.70f), new(0,.58f,.70f) };
                mesh.triangles = new[] { 0,2,1,3,4,5,0,1,4,0,4,3,0,3,5,0,5,2,1,2,5,1,5,4 };
                mesh.RecalculateNormals();
                mesh.RecalculateBounds();
                AssetDatabase.CreateAsset(mesh,path);
            }
            var gable = new GameObject("Empena",typeof(MeshFilter),typeof(MeshRenderer));
            gable.transform.position = position;
            gable.transform.localScale = Vector3.one*size;
            gable.GetComponent<MeshFilter>().sharedMesh = mesh;
            gable.GetComponent<MeshRenderer>().sharedMaterial = Painted(color);
        }

        private static void ExteriorTree(Vector3 p, float size)
        {
            Rounded("Tronco",p+Vector3.up*.91f*size,new Vector3(.19f,1.78f,.18f)*size,.057f,Wood);
            for (var i=0; i<6; i++)
            {
                var offset = new Vector3(Mathf.Sin(i*2.4f)*.55f,1.74f+i*.136f,Mathf.Cos(i*2.4f)*.37f);
                Orb("Massa de folhas",p+offset*size,new Vector3(1.04f,.92f,1.0f)*size,
                    i%2==0 ? new(.36f,.48f,.32f) : new(.46f,.55f,.34f));
            }
        }

        private static Material EffectMaterial(string effect)
        {
            var path = Root + "/Materials/" + effect + ".mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material) return material;
            var shader = Shader.Find("WorstDateEver/" + effect);
            if (!shader)
                throw new System.InvalidOperationException("Shader not imported: " + effect);
            material = new Material(shader);
            AssetDatabase.CreateAsset(material,path);
            return material;
        }

        private static void AddWindowLight(BedroomWindowView view)
        {
            var direction = new Vector3(.34f,-.34f,-1f).normalized;
            var sun = Lighting("Sol pela janela",new(-1.77f,2.29f,4.47f),LightType.Spot,
                new(1f,.70f,.42f),4.9f,9.3f);
            sun.transform.rotation = Quaternion.LookRotation(direction);
            sun.spotAngle = 51f;
            sun.innerSpotAngle = 32f;
            sun.shadows = LightShadows.Soft;
            sun.shadowStrength = .85f;
            sun.shadowBias = .035f;

            // Cast through both panes into the furnished room once while generating.
            // The short transparent volumes then cost no physics work per frame.
            Physics.SyncTransforms();
            var points = new List<Vector3>();
            var uv = new List<Vector2>();
            var triangles = new List<int>();
            foreach (var pane in new[] { -1.61f, -.86f })
            {
                for (var i=0; i<3; i++)
                {
                    var y=1.63f+i*.13f;
                    AddSheet(new(pane-.29f,y,3.235f),new(pane+.29f,y,3.235f));
                }
                AddSheet(new(pane,1.45f,3.235f),new(pane,2.04f,3.235f));
            }
            var path = Root + "/Meshes/WindowBeams.asset";
            var mesh = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (!mesh)
            {
                mesh = new Mesh { name = "Luz traçada da janela" };
                AssetDatabase.CreateAsset(mesh,path);
            }
            mesh.Clear();
            mesh.SetVertices(points);
            mesh.SetUVs(0,uv);
            mesh.SetTriangles(triangles,0);
            mesh.RecalculateBounds();
            EditorUtility.SetDirty(mesh);
            var beam = new GameObject("Fachos suaves da janela",typeof(MeshFilter),typeof(MeshRenderer));
            beam.GetComponent<MeshFilter>().sharedMesh = mesh;
            var renderer = beam.GetComponent<MeshRenderer>();
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            renderer.sharedMaterial = EffectMaterial("WindowAir");
            view.Beams = beam;
            view.Sun = sun;

            void AddSheet(Vector3 a, Vector3 b)
            {
                var first=points.Count;
                points.Add(a); points.Add(b); points.Add(RayEnd(a)); points.Add(RayEnd(b));
                uv.Add(new(0,0)); uv.Add(new(1,0)); uv.Add(new(0,1)); uv.Add(new(1,1));
                triangles.Add(first); triangles.Add(first+1); triangles.Add(first+2);
                triangles.Add(first+2); triangles.Add(first+1); triangles.Add(first+3);
            }
            Vector3 RayEnd(Vector3 from)
            {
                return Physics.Raycast(from,direction,out var hit,5.25f,~0,QueryTriggerInteraction.Ignore)
                    ? hit.point - direction*.006f : from+direction*5.25f;
            }
        }
    }
}
