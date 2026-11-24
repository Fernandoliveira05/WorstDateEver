using System;
using System.Linq;
using Oculus.Interaction;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.SceneManagement;

namespace WorstDateEver.Editor
{
    public static partial class BuildBedroom
    {
        private const string BedroomFolder = "Bedroom objects";

        [MenuItem("Worst Date Ever/Organize Bedroom Scenes")]
        public static void OrganizeBedroomScenes()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
                throw new InvalidOperationException("Exit Play mode before organizing bedroom scenes.");
            foreach (var name in new[] { "BedroomDesktop", "BedroomQuest" })
            {
                var path = Root + "/Scenes/" + name + ".unity";
                var scene = SceneManager.GetSceneByPath(path);
                var opened = !scene.isLoaded;
                if (opened) scene = EditorSceneManager.OpenScene(path, OpenSceneMode.Additive);
                try
                {
                    OrganizeBedroom(scene);
                    EditorSceneManager.SaveScene(scene);
                }
                finally
                {
                    if (opened) EditorSceneManager.CloseScene(scene, true);
                }
            }
        }

        private static void OrganizeBedroom(Scene scene)
        {
            var roots = scene.GetRootGameObjects();
            var game = roots.Select(root => root.GetComponent<BedroomController>()).First(component => component);
            var folder = roots.FirstOrDefault(root => root.name == BedroomFolder)?.transform ?? Section(BedroomFolder, null);
            if (folder.gameObject.scene != scene) SceneManager.MoveGameObjectToScene(folder.gameObject, scene);
            foreach (var item in roots)
            {
                if (item == folder.gameObject || item == game.gameObject || item.GetComponentInChildren<OVRManager>(true) ||
                    item.GetComponent<Camera>() || item.GetComponent<EventSystem>()) continue;
                var category = BedroomSection(item);
                var parent = folder.Find(category) ?? Section(category, folder);
                item.transform.SetParent(parent, true);
            }

            var grabbable = game.Phone.GetComponent<Grabbable>();
            if (grabbable && !game.Phone.GetComponent<BedroomPhoneGrip>())
            {
                var previous = game.Phone.GetComponent<BedroomDrawerGrabTransformer>();
                var grip = game.Phone.gameObject.AddComponent<BedroomPhoneGrip>();
                var settings = new SerializedObject(grabbable);
                settings.FindProperty("_maxGrabPoints").intValue = 1;
                settings.FindProperty("_oneGrabTransformer").objectReferenceValue = grip;
                settings.FindProperty("_twoGrabTransformer").objectReferenceValue = grip;
                settings.ApplyModifiedPropertiesWithoutUndo();
                if (previous) UnityEngine.Object.DestroyImmediate(previous);
            }
            EditorSceneManager.MarkSceneDirty(scene);
        }

        private static Transform Section(string name, Transform parent)
        {
            var section = new GameObject(name).transform;
            section.SetParent(parent, false);
            return section;
        }

        private static string BedroomSection(GameObject root)
        {
            var name = root.name;
            bool Starts(params string[] words) => words.Any(word => name.StartsWith(word, StringComparison.Ordinal));
            if (root.GetComponent<Light>() || Starts("Fachos suaves")) return "Lighting";
            if (Starts("Bairro", "Céu", "Serras", "Pássaro", "Nuvem")) return "Outside";
            if (Starts("Parede da janela", "Batente", "Travessa", "Peitoril", "Varão", "Presilha", "Cortinas", "Vaso"))
                return "Window and curtains";
            if (Starts("Piso", "Parede", "Teto", "Rodapé", "Dobradiças", "Guarnição", "Fundo do corredor", "Retorno do corredor"))
                return "Architecture and door";
            if (Starts("Cama", "Colchão", "Manta", "Edredom", "Travesseiro", "Moletom", "Moldura sobre a cama",
                "Passe-partout", "Gravura", "Lua da gravura", "Horizonte da gravura")) return "Bed";
            if (Starts("Criado-mudo", "Gaveta do criado", "Superfície do criado", "Meia", "Despertador",
                "Mostrador", "Marca do relógio", "Ponteiro", "Sino", "Abajur", "Ponta do cordão", "Cordão",
                "Telefone", "Base baixa da doca", "Encosto da doca", "Apoio da doca", "LED da doca")) return "Bedside";
            if (Starts("armário", "Gaveta do armário", "Lateral do armário", "Tampo do armário", "Base do armário",
                "Divisória", "Fundo do armário", "Camiseta", "Jaqueta", "Paletó", "Sapo")) return "Wardrobe";
            if (Starts("Moldura de nogueira", "Friso", "Vidro do espelho", "Avatar")) return "Mirror and avatar";
            if (Starts("Estante", "Livro", "Quadro", "Postais", "Alfinete", "Tapete")) return "Decor";
            return "Desk and drawers";
        }
    }
}
