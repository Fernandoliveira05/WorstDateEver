using UnityEditor.SceneManagement;
using UnityEditor;
using UnityEngine;

namespace WorstDateEver.Editor
{
    public static partial class BuildBedroom
    {
        [MenuItem("Worst Date Ever/Add Two-Door Wardrobe")]
        public static void AddWardrobeToScene()
        {
            var scene = UnityEditor.SceneManagement.EditorSceneManager.OpenScene(Root + "/Scenes/BedroomDesktop.unity");
            foreach (var existing in scene.GetRootGameObjects())
                if (existing.name == "Armário de dois batentes") Object.DestroyImmediate(existing);
            BuildWardrobe();
            UnityEditor.SceneManagement.EditorSceneManager.MarkSceneDirty(scene);
            UnityEditor.SceneManagement.EditorSceneManager.SaveScene(scene);
        }

        private static void BuildWardrobe()
        {
            var path = Root + "/Models/Bedroom/Closet.glb";
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (!prefab)
            {
                Debug.LogWarning("Wardrobe model not found at " + path);
                return;
            }
            var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab, EditorSceneManager.GetActiveScene());
            instance.name = "Armário de dois batentes";
            instance.transform.position = new Vector3(-1.95f, 0, 1.35f);
            instance.transform.rotation = Quaternion.Euler(0, 90, 0);
            var wardrobe = instance.AddComponent<BedroomWardrobe>();
            wardrobe.TargetSize = new Vector3(1.22f, 2.02f, .62f);
            wardrobe.TargetPosition = new Vector3(-1.95f, 0, 1.35f);
            foreach (var child in instance.GetComponentsInChildren<Transform>())
            {
                if (child == instance.transform) continue;
                if (child.GetComponent<Renderer>())
                    child.gameObject.AddComponent<BoxCollider>();
            }
        }
    }
}
