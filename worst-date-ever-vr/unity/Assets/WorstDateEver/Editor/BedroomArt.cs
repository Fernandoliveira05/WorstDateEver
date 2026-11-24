using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;

namespace WorstDateEver.Editor
{
    public static partial class BuildBedroom
    {
        private static readonly Color Brass = new(.67f,.51f,.29f);
        private static readonly Color Clay = new(.61f,.33f,.29f);
        private static readonly Color SlateTeal = new(.28f,.44f,.45f);
        private static readonly Color Charcoal = new(.23f,.25f,.29f);
        private static readonly Color Wood = new(.51f,.35f,.26f);
        private static readonly Color Linen = new(.82f,.75f,.63f);
        private static readonly Color Upholstery = new(.36f,.46f,.44f);

        private static GameObject Rounded(string name, Vector3 at, Vector3 size,
            float radius, Color color, bool collision = false)
        {
            var gameObject = new GameObject(name, typeof(MeshFilter), typeof(MeshRenderer));
            gameObject.transform.position = at;
            gameObject.GetComponent<MeshFilter>().sharedMesh = RoundedMesh(size, radius);
            gameObject.GetComponent<MeshRenderer>().sharedMaterial = Painted(color);
            if (collision) gameObject.AddComponent<BoxCollider>().size = size;
            return gameObject;
        }

        private static Mesh RoundedMesh(Vector3 size, float radius)
        {
            radius = Mathf.Min(radius, Mathf.Min(size.x, Mathf.Min(size.y, size.z)) * .49f);
            string key = FormattableString.Invariant($"{size.x:F4}-{size.y:F4}-{size.z:F4}-{radius:F4}");
            var path = Root + "/Meshes/Rounded-" + key + ".asset";
            var mesh = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (mesh) return mesh;
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var indices = new List<int>();
            var half = size / 2;
            var inside = half - Vector3.one * radius;
            const int bevelSteps = 4;
            for (int axis = 0; axis < 3; axis++)
            {
                int u = (axis + 1) % 3, v = (axis + 2) % 3;
                var across = SampleAxis(half[u], radius, bevelSteps);
                var down = SampleAxis(half[v], radius, bevelSteps);
                for (int sign = -1; sign <= 1; sign += 2)
                {
                    var first = vertices.Count;
                    for (int row = 0; row < down.Length; row++)
                    for (int col = 0; col < across.Length; col++)
                    {
                        var p = Vector3.zero;
                        p[axis] = half[axis] * sign;
                        p[u] = across[col];
                        p[v] = down[row];
                        var center = Vector3.Max(-inside, Vector3.Min(inside, p));
                        var normal = (p - center).normalized;
                        vertices.Add(center + normal * radius);
                        normals.Add(normal);
                    }
                    for (int row = 0; row < down.Length - 1; row++)
                    for (int col = 0; col < across.Length - 1; col++)
                    {
                        int a = first + row * across.Length + col, b = a + 1, c = a + across.Length, d = c + 1;
                        if (sign > 0) { indices.Add(a); indices.Add(b); indices.Add(c); indices.Add(c); indices.Add(b); indices.Add(d); }
                        else { indices.Add(a); indices.Add(c); indices.Add(b); indices.Add(c); indices.Add(d); indices.Add(b); }
                    }
                }
            }
            mesh = new Mesh { name = "Rounded " + key };
            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetTriangles(indices, 0);
            mesh.RecalculateBounds();
            AssetDatabase.CreateAsset(mesh, path);
            return mesh;
        }

        private static float[] SampleAxis(float half, float radius, int steps)
        {
            var points = new float[(steps + 1) * 2];
            for (var i = 0; i <= steps; i++)
            {
                points[i] = -half + radius * i / steps;
                points[points.Length - 1 - i] = -points[i];
            }
            return points;
        }

        private static void DressBedWall()
        {
            var center = new Vector3(2.174f,1.64f,1.32f);
            Rounded("Moldura sobre a cama", center, new(.05f,.64f,.45f),.016f,Wood);
            Rounded("Passe-partout", center + Vector3.left*.026f, new(.008f,.578f,.390f),.002f,Linen);
            Rounded("Gravura noturna", center + Vector3.left*.032f, new(.007f,.474f,.297f),.002f,SlateTeal);
            Orb("Lua da gravura",center + new Vector3(-.036f,.101f,-.041f), new(.007f,.092f,.092f),Paper);
            for (var i = 0; i < 6; i++)
            {
                var ridge = Rounded("Horizonte da gravura",center+new Vector3(-.037f,-.118f-i*.014f,0),
                    new(.005f,.008f,.274f-i*.015f),.002f, i%2==0 ? Teal : Brass);
                ridge.transform.rotation = Quaternion.Euler((i%2==0 ? -1 : 1)*(5+i),0,0);
            }
        }

        private static void DressAlarmClock()
        {
            var clock = new Vector3(1.61f, 1.003f, .035f);
            Rounded("Despertador", clock, new(.175f,.127f,.087f), .041f, Clay);
            Orb("Mostrador", clock + new Vector3(0,.008f,-.043f), new(.102f,.102f,.021f), Paper);
            for (var i = 0; i < 12; i += 3)
            {
                var a = Mathf.PI * i / 6;
                Orb("Marca do relógio", clock + new Vector3(Mathf.Sin(a)*.035f,.008f+Mathf.Cos(a)*.035f,-.055f),
                    new(.007f,.007f,.006f), Ink);
            }
            Rounded("Ponteiro das horas", clock + new Vector3(-.011f,.015f,-.056f),
                new(.036f,.009f,.006f), .002f, Charcoal).transform.rotation = Quaternion.Euler(0,0,-30);
            Rounded("Ponteiro dos minutos", clock + new Vector3(.010f,.017f,-.057f),
                new(.042f,.006f,.006f), .002f, Teal).transform.rotation = Quaternion.Euler(0,0,31);
            Orb("Sino esquerdo", clock + new Vector3(-.044f,.068f,0), new(.050f,.036f,.048f), Brass);
            Orb("Sino direito", clock + new Vector3(.044f,.068f,0), new(.050f,.036f,.048f), Brass);

        }

        private static void DressLeftWall()
        {
            var colors = new[] { Clay, Brass, SlateTeal };
            for (var i = 0; i < colors.Length; i++)
            {
                var book = Rounded("Livro", new(1.67f,.017f+.033f*i,.48f), new(.29f,.033f,.22f), .014f, colors[i]);
                book.transform.rotation = Quaternion.Euler(0, -20 + 16 * i, 0);
            }
            var pinboard = Rounded("Quadro de cortiça",new(-2.16f,1.65f,1.58f),new(.10f,.53f,.61f),.013f,Wood);
            ApplySurface(pinboard,"Powdercoat",new(.55f,.40f,.28f),new(2.6f,2.6f),.56f,.10f);
            Rounded("Postais", new(-2.101f,1.67f,1.43f), new(.02f,.18f,.27f), .009f, Paper);
            Rounded("Postais", new(-2.095f,1.63f,1.76f), new(.026f,.23f,.24f), .012f, Teal);
            Orb("Alfinete", new(-2.08f,1.74f,1.43f), new(.04f,.04f,.04f), Clay);
            Orb("Alfinete", new(-2.08f,1.72f,1.76f), new(.04f,.04f,.04f), Brass);
        }

        private static void BuildWindow(Color wall, Color trim, BedroomWindowView outside)
        {
            const float left = -2.05f, right = -.42f, bottom = 1.02f, top = 2.19f;
            const float wallZ = 3.40f;
            BackWallPiece(-2.3f, left, 0, 2.9f, wallZ, wall);
            BackWallPiece(right, DoorLeft, 0, 2.9f, wallZ, wall);
            BackWallPiece(DoorRight, 2.3f, 0, 2.9f, wallZ, wall);
            BackWallPiece(DoorLeft, DoorRight, 2.16f, 2.9f, wallZ, wall);
            BackWallPiece(left, right, 0, bottom, wallZ, wall);
            BackWallPiece(left, right, top, 2.9f, wallZ, wall);

            float x = (left + right) / 2, y = (bottom + top) / 2;
            foreach (var edgeX in new[] { left, right })
                Rounded("Batente vertical", new(edgeX,y,3.31f), new(.095f,top-bottom+.12f,.16f), .024f, trim);
            foreach (var edgeY in new[] { bottom, top })
                Rounded("Batente horizontal", new(x,edgeY,3.31f), new(right-left+.09f,.10f,.16f), .024f, trim);
            Rounded("Travessa do vidro", new(x,y,3.32f), new(.065f,top-bottom,.076f), .021f, trim);
            var sill = Rounded("Peitoril",new(x,bottom-.035f,3.22f),new(1.86f,.09f,.35f),.019f,Wood);
            ApplySurface(sill,"Walnut",new(.80f,.67f,.54f),new(.94f,1.3f),.50f,.24f);
            DressCurtains(left,right,top,bottom);

            DressExterior(outside);
        }

        private static void BackWallPiece(float l, float r, float b, float t, float z, Color color) =>
            ApplySurface(Block("Parede da janela",new((l+r)/2,(b+t)/2,z),new(r-l,t-b,.15f),color),
                "Powdercoat",color,new Vector2(1.35f,1.35f),.25f,.10f);
        
        private static void Backdrop(GameObject mesh, Color color)
        {
            var path = $"{Root}/Materials/Exterior-{ColorUtility.ToHtmlStringRGB(color)}.mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (!material)
            {
                var shader = UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline
                    ? Shader.Find("Universal Render Pipeline/Unlit") : Shader.Find("Unlit/Color");
                material = new Material(shader) { color = color };
                AssetDatabase.CreateAsset(material, path);
            }
            var renderer = mesh.GetComponent<Renderer>();
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }

        private static Button HiddenButton(string name, Vector3 position, float width, float height)
        {
            const float scale = .001f;
            var canvas = CanvasAt(name, position, Mathf.RoundToInt(width/scale), Mathf.RoundToInt(height/scale), scale);
            var hit = Rect("Área de toque", canvas, Vector2.zero, canvas.sizeDelta);
            var graphic = hit.gameObject.AddComponent<Image>();
            graphic.color = Color.clear;
            var button = hit.gameObject.AddComponent<Button>();
            button.transition = Selectable.Transition.None;
            button.targetGraphic = graphic;
            return button;
        }
    }
}
