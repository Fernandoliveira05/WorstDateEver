using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace WorstDateEver
{
    public static class BuildFirstDateArt
    {
        const string Root = "Assets/WorstDateEver";
        const string Output = Root + "/Resources/FirstDate/Art.asset";

        [MenuItem("Worst Date Ever/Refresh First Date Art")]
        public static void Refresh()
        {
            var art = AssetDatabase.LoadAssetAtPath<FirstDateArt>(Output);
            if (!art)
            {
                art = ScriptableObject.CreateInstance<FirstDateArt>();
                AssetDatabase.CreateAsset(art, Output);
            }
            var paths = new[] { "Caio", "Rafa", "Bia", "Luiza", "PlayerWoman", "PlayerMan", "JacketWoman", "JacketMan", "FormalMan" }
                .Select(name => Root + "/Models/Characters/" + name + ".glb").ToArray();
            art.Characters = paths.Select(AssetDatabase.LoadAssetAtPath<GameObject>).ToArray();
            art.Walk = paths.Select(path => Clip(path, "Walk")).ToArray();
            art.Idle = paths.Select(path => Clip(path, "Idle")).ToArray();
            art.Walnut = AssetDatabase.LoadAssetAtPath<Texture2D>(Root + "/Textures/Walnut.jpg");
            art.Floor = AssetDatabase.LoadAssetAtPath<Texture2D>(Root + "/Textures/Floorboards.jpg");
            var urp = GraphicsSettings.currentRenderPipeline != null;
            var shader = Shader.Find(urp ? "Universal Render Pipeline/Lit" : "Standard");
            var materialPath = Root + "/Resources/FirstDate/Surface.mat";
            art.Surface = AssetDatabase.LoadAssetAtPath<Material>(materialPath);
            if (!art.Surface)
            {
                art.Surface = new Material(shader);
                AssetDatabase.CreateAsset(art.Surface, materialPath);
            }
            art.Surface.shader = shader;
            EditorUtility.SetDirty(art.Surface);
            art.Unlit = Shader.Find(urp ? "Universal Render Pipeline/Unlit" : "Unlit/Color");
            EditorUtility.SetDirty(art);
            AssetDatabase.SaveAssets();
        }

        static AnimationClip Clip(string path, string suffix) => AssetDatabase.LoadAllAssetsAtPath(path)
            .OfType<AnimationClip>().FirstOrDefault(clip => clip.name == suffix || clip.name.EndsWith("|" + suffix));
    }
}
