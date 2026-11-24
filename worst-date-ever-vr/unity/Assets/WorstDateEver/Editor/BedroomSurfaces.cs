using UnityEditor;
using UnityEngine;

namespace WorstDateEver.Editor
{
    public static partial class BuildBedroom
    {
        private static void ApplySurface(GameObject target,string texture,Color tint,Vector2 frequency,
            float strength=1,float smoothness=.19f)
        {
            target.GetComponent<Renderer>().sharedMaterial = SurfaceMaterial(texture,tint,frequency,strength,smoothness,false);
        }

        private static Material SurfaceMaterial(string texture,Color tint,Vector2 frequency,
            float strength,float smoothness,bool useUV)
        {
            var color = ColorUtility.ToHtmlStringRGB(tint);
            var key = FormattableStringKey(frequency,strength,smoothness);
            var path = $"{Root}/Materials/Surface-{texture}-{color}-{key}-{(useUV ? "UV" : "Projected")}.mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material) return material;
            var image = AssetDatabase.LoadAssetAtPath<Texture2D>($"{Root}/Textures/{texture}.jpg");
            if (!image) throw new System.InvalidOperationException($"Missing texture {texture}");
            material = new Material(Shader.Find("WorstDateEver/BedroomSurface"));
            material.SetTexture("_MainTex",image);
            material.SetColor("_Color",tint);
            material.SetVector("_Frequency",frequency);
            material.SetFloat("_Strength",strength);
            material.SetFloat("_Smoothness",smoothness);
            material.SetFloat("_UseUV",useUV ? 1 : 0);
            AssetDatabase.CreateAsset(material,path);
            return material;
        }

        private static string FormattableStringKey(Vector2 f,float strength,float smoothness) =>
            System.FormattableString.Invariant($"{f.x:F1}-{f.y:F1}-{strength:F2}-{smoothness:F2}");

        private static void TextureFurniture(Renderer[] renderers)
        {
            foreach (var renderer in renderers)
            {
                var materials = renderer.sharedMaterials;
                for (var i=0; i<materials.Length; i++)
                {
                    var material = materials[i];
                    if (!material) continue;
                    var name = material.name.ToLowerInvariant();
                    if (name.Contains("oak"))
                        materials[i] = SurfaceMaterial("Walnut",new(.98f,.87f,.73f),new(.95f,1.3f),.62f,.24f,false);
                    else if (name.Contains("walnut"))
                        materials[i] = SurfaceMaterial("Walnut",new(.71f,.57f,.47f),new(.95f,1.3f),.64f,.23f,false);
                    else if (name.Contains("linen") || name.Contains("fabric"))
                    {
                        var tint = material.HasProperty("_BaseColor") ? material.GetColor("_BaseColor") : material.color;
                        materials[i] = SurfaceMaterial("Weave",tint,new(6,6),.39f,.12f,false);
                    }
                }
                renderer.sharedMaterials = materials;
            }
        }
    }
}
