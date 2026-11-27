using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace WorstDateEver.Editor
{
    public static class BuildSourcedArt
    {
        private const string Root = "Assets/WorstDateEver";
        private const string Folder = Root + "/Models/Sourced";
        private const string Output = Root + "/Resources/FirstDate/Sourced.asset";

        [MenuItem("Worst Date Ever/Refresh Sourced Models")]
        public static void Refresh()
        {
            Directory.CreateDirectory(Folder);
            var files = Directory.GetFiles(Folder, "*.glb").OrderBy(Path.GetFileName).ToArray();
            var art = AssetDatabase.LoadAssetAtPath<SourcedArt>(Output);
            if (!art)
            {
                art = ScriptableObject.CreateInstance<SourcedArt>();
                AssetDatabase.CreateAsset(art, Output);
            }
            art.Ids = files.Select(Path.GetFileNameWithoutExtension).ToArray();
            art.Models = files.Select(path => AssetDatabase.LoadAssetAtPath<GameObject>(path)).ToArray();
            var missing = art.Ids.Where((id, i) => !art.Models[i]).ToArray();
            EditorUtility.SetDirty(art);
            AssetDatabase.SaveAssets();
            Debug.Log($"SourcedArt: {art.Models.Length} entries, {missing.Length} failed imports: {string.Join(", ", missing)}");
            if (missing.Length > 0)
                throw new System.InvalidOperationException($"{missing.Length} sourced GLBs did not import: {string.Join(", ", missing)}");
        }
    }
}
