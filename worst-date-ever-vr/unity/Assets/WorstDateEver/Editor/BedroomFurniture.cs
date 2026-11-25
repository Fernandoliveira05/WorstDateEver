using System.Linq;
using UnityEditor;
using UnityEngine;

namespace WorstDateEver.Editor
{
    public static partial class BuildBedroom
    {
        private static GameObject PlaceFurniture(string id, string label, Vector3 feet, Vector3 size, float yaw = 0)
        {
            var path = Root + "/Models/FurnishedBedroom/" + id + ".glb";
            var model = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (!model)
                throw new System.InvalidOperationException("Furniture failed to import: " + path);
            var instance = (GameObject)PrefabUtility.InstantiatePrefab(model);
            instance.name = label;
            var renderers = instance.GetComponentsInChildren<Renderer>();
            if (renderers.Length == 0)
                throw new System.InvalidOperationException("Furniture has no visible geometry: " + path);

            var original = BoundsOf(renderers).size;
            bool swapAxes = Mathf.Abs(Mathf.DeltaAngle(0,yaw)) % 180 > 45 &&
                            Mathf.Abs(Mathf.DeltaAngle(0,yaw)) % 180 < 135;
            var localSize = swapAxes ? new Vector3(size.z,size.y,size.x) : size;
            instance.transform.localScale = new Vector3(localSize.x / original.x, localSize.y / original.y, localSize.z / original.z);
            instance.transform.rotation = Quaternion.Euler(0,yaw,0);
            var bounds = BoundsOf(renderers);
            instance.transform.position += feet - new Vector3(bounds.center.x,bounds.min.y,bounds.center.z);
            TextureFurniture(renderers);
            return instance;
        }

        private static BoxCollider MattressCollider(GameObject bed)
        {
            var linen = bed.GetComponentsInChildren<MeshFilter>()
                .First(renderer => renderer.sharedMesh.name.EndsWith("_2") || renderer.name.EndsWith("_2"));
            var source = linen.sharedMesh;
            var vertices = source.vertices;
            var indices = source.triangles;
            // The imported linen mesh has a disconnected mattress and two pillows above its local origin.
            var mattressIndices = Enumerable.Range(0, indices.Length / 3)
                .Where(i => vertices[indices[i * 3]].y < 0)
                .SelectMany(i => new[] { indices[i * 3], indices[i * 3 + 1], indices[i * 3 + 2] })
                .ToArray();
            var path = Root + "/Meshes/BedMattress.asset";
            var mesh = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (!mesh)
            {
                mesh = Object.Instantiate(source);
                mesh.name = "Colchão";
                AssetDatabase.CreateAsset(mesh, path);
            }
            mesh.triangles = mattressIndices;
            var surface = new Bounds(vertices[mattressIndices[0]], Vector3.zero);
            foreach (var index in mattressIndices) surface.Encapsulate(vertices[index]);
            mesh.bounds = surface;
            EditorUtility.SetDirty(mesh);
            linen.sharedMesh = mesh;
            var visible = linen.GetComponent<Renderer>().bounds;
            return FurnitureCollider("Colchão macio", visible.center, visible.size * .987f);
        }

        private static Bounds BoundsOf(Renderer[] renderers)
        {
            var bounds = renderers[0].bounds;
            foreach (var renderer in renderers) bounds.Encapsulate(renderer.bounds);
            return bounds;
        }

        private static BoxCollider FurnitureCollider(string name, Vector3 center, Vector3 size)
        {
            var collider = new GameObject(name).AddComponent<BoxCollider>();
            collider.transform.position = center;
            collider.size = size;
            return collider;
        }
    }
}
