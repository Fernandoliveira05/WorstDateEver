using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Events;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.UI;

namespace WorstDateEver.Editor
{
    public static partial class BuildBedroom
    {
        private const string CharacterFolder = Root + "/Models/Characters";

        private static void BuildMirror(BedroomController game)
        {
            var center = new Vector3(.33f,1.20f,3.264f);
            var frame = Rounded("Moldura de nogueira", center + Vector3.forward * .029f,
                new(.95f,2.20f,.087f), .028f, Wood, true);
            var trim = Rounded("Friso de latão", center + Vector3.forward * .003f, new(.88f,2.12f,.037f), .015f, Brass);
            var glass = GameObject.CreatePrimitive(PrimitiveType.Quad);
            glass.name = "Vidro do espelho";
            glass.transform.SetPositionAndRotation(center + Vector3.back * .022f,Quaternion.identity);
            glass.transform.localScale = new(.84f,2.08f,1f);
            Object.DestroyImmediate(glass.GetComponent<Collider>());
            var renderer = glass.GetComponent<Renderer>();
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            var path = Root + "/Materials/Mirror.mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (!material)
            {
                material = new Material(Shader.Find("WorstDateEver/BedroomMirror"));
                AssetDatabase.CreateAsset(material, path);
            }
            renderer.sharedMaterial = material;

            ApplySurface(frame,"Walnut",new(.84f,.74f,.65f),new(1.15f,1.17f),.72f);
            var pivot = new Vector3(2.13f,1.20f,.86f);
            var turn = Quaternion.Euler(0,90,0);
            foreach (var part in new[] { frame.transform, trim.transform, glass.transform })
                part.SetPositionAndRotation(pivot+turn*(part.position-center),turn*part.rotation);

            var avatar = new GameObject("Avatar do jogador").AddComponent<BedroomAvatar>();
            avatar.Masculine = new[] { "PlayerMan", "JacketMan", "FormalMan" }
                .Select(name => PlaceCharacter(name, avatar.transform)).ToArray();
            avatar.Feminine = new[] { "PlayerWoman", "JacketWoman", "FormalWoman" }
                .Select(name => PlaceCharacter(name, avatar.transform)).ToArray();
            KeepPlayerFace(avatar.Masculine);
            KeepPlayerFace(avatar.Feminine);
            avatar.Select(0,0);
            game.Avatar = avatar;
            var mirror = glass.AddComponent<BedroomMirror>();
            mirror.Glass = renderer;
        }

        private static GameObject PlaceCharacter(string name, Transform parent, float height = 1.70f)
        {
            var model = AssetDatabase.LoadAssetAtPath<GameObject>($"{CharacterFolder}/{name}.glb");
            if (!model) throw new System.InvalidOperationException("Modelo de personagem ausente: " + name);
            var instance = (GameObject)PrefabUtility.InstantiatePrefab(model);
            instance.name = name;
            instance.transform.SetParent(parent, false);
            foreach (var child in instance.GetComponentsInChildren<Transform>(true))
                child.gameObject.layer = BedroomMirror.AvatarLayer;
            foreach (var skinned in instance.GetComponentsInChildren<SkinnedMeshRenderer>())
                skinned.updateWhenOffscreen = true;
            var renderers = instance.GetComponentsInChildren<Renderer>();
            var bounds = BoundsOf(renderers);
            instance.transform.localScale = Vector3.one * (height / bounds.size.y);
            bounds = BoundsOf(renderers);
            instance.transform.position -= new Vector3(bounds.center.x-parent.position.x,
                bounds.min.y-parent.position.y,bounds.center.z-parent.position.z);
            SetRelaxedPose(instance);
            return instance;
        }

        private static void KeepPlayerFace(GameObject[] looks)
        {
            var original = GetHead(looks[0]);
            foreach (var look in looks.Skip(1))
            {
                var head = GetHead(look);
                var targetBones = look.GetComponentsInChildren<Transform>().ToLookup(bone => bone.name);
                var bones = original.bones.Select(bone => targetBones[bone.name].FirstOrDefault()).ToArray();
                if (bones.Any(bone => !bone)) continue;
                head.sharedMesh = original.sharedMesh;
                head.sharedMaterials = original.sharedMaterials;
                head.bones = bones;
                head.rootBone = targetBones[original.rootBone.name].FirstOrDefault();
                head.localBounds = original.localBounds;
            }
        }

        private static SkinnedMeshRenderer GetHead(GameObject character) =>
            character.GetComponentsInChildren<SkinnedMeshRenderer>()
                .First(renderer => renderer.name.EndsWith("_Head"));

        private static void SetRelaxedPose(GameObject character)
        {
            var animator = character.GetComponentInChildren<Animator>();
            if (animator) animator.enabled = false;
            var transforms = character.GetComponentsInChildren<Transform>();
            foreach (var bone in transforms)
            {
                var name = bone.name.ToLowerInvariant().Replace("_", "").Replace(".", "").Replace("-", "");
                if (name is "upperarml" or "upperarmr" && bone.childCount > 0)
                {
                    var side = Mathf.Sign(bone.position.x-character.transform.position.x);
                    var rest = bone.GetChild(0).position - bone.position;
                    bone.rotation = Quaternion.FromToRotation(rest, new Vector3(side * .20f,-1f,-.05f)) * bone.rotation;
                }
            }
        }

        private static BedroomProp[] BuildWardrobe(BedroomController game, BedroomDrawerTray tray)
        {
            var colors = new[] { Linen, Clay, SlateTeal };
            var names = new[] { "Camiseta de algodão", "Jaqueta com zíper", "Paletó com lapelas" };
            var wardrobe = new BedroomProp[names.Length];
            for (var i = 0; i < colors.Length; i++)
            {
                var choice = i;
                var slot = tray.Interior.center;
                slot.x += (i-1)*.197f;
                var size = new Vector3(.193f,.040f,.219f);
                slot.y = tray.Interior.min.y + size.y*.5f + .004f;
                var position = tray.transform.TransformPoint(slot);
                var shirt = Prop(names[i],position,size,colors[i],false);
                DressFoldedClothing(shirt,i,colors[i]);
                var soft = MakeFlexible(shirt,size,CottonJersey,"Clothing"+i+"-");
                UnityEventTools.AddIntPersistentListener(soft.Grabbed,game.PickAppearance,choice);
                wardrobe[i] = shirt;
            }
            return wardrobe;
        }

        private static Texture2D[] BuildProfilePictures()
        {
            var names = new[] { "Caio","Rafa","Bia","Luiza" };
            var colors = new[] { new Color(.61f,.63f,.53f),new Color(.75f,.53f,.43f),
                new Color(.74f,.55f,.61f),new Color(.47f,.63f,.64f) };
            return names.Select((name,i)=>ProfilePicture(name,colors[i])).ToArray();
        }

        private static Texture2D ProfilePicture(string name, Color background)
        {
            var path = $"{CharacterFolder}/{name}-Portrait.png";
            var stage = new GameObject("Estúdio temporário");
            stage.transform.position = new(20, 20, 20);
            var model = PlaceCharacter(name, stage.transform);
            model.transform.Rotate(0,-12,0,Space.World);
            var camera = new GameObject("Câmera de retrato").AddComponent<Camera>();
            camera.transform.SetParent(stage.transform, false);
            camera.enabled = false;
            camera.transform.localPosition = new(0,1.32f,2.8f);
            camera.transform.localRotation = Quaternion.Euler(0,180,0);
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = background;
            camera.cullingMask = 1 << BedroomMirror.AvatarLayer;
            camera.orthographic = true;
            camera.orthographicSize = .49f;
            camera.farClipPlane = 5;
            var light = new GameObject("Luz de retrato").AddComponent<Light>();
            light.transform.SetParent(stage.transform);
            light.type = LightType.Directional;
            light.cullingMask = camera.cullingMask;
            light.transform.rotation = Quaternion.Euler(30,195,0);
            light.intensity = 1.3f;

            var image = RenderTexture.GetTemporary(460,492,16);
            var previous = RenderTexture.active;
            var snapshot = new Texture2D(image.width,image.height,TextureFormat.RGB24,false);
            try
            {
                camera.targetTexture = image;
                camera.Render();
                RenderTexture.active = image;
                snapshot.ReadPixels(new Rect(0,0,image.width,image.height),0,0);
                File.WriteAllBytes(path,snapshot.EncodeToPNG());
            }
            finally
            {
                RenderTexture.active = previous;
                camera.targetTexture = null;
                RenderTexture.ReleaseTemporary(image);
                Object.DestroyImmediate(snapshot);
                Object.DestroyImmediate(stage);
            }
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
            return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        }
    }
}
