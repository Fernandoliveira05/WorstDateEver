using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using UnityEngine.UI;

namespace WorstDateEver.Editor
{
    public static partial class BuildBedroom
    {
        private const string Root = "Assets/WorstDateEver";
        private static readonly Color Ink = new(.14f,.15f,.17f);
        private static readonly Color Paper = new(.94f,.89f,.80f);
        private static readonly Color Rose = new(.78f,.43f,.49f);
        private static readonly Color Teal = new(.50f,.65f,.58f);
        private static Font font;
        private static readonly List<GameObject> GrabTargets = new();
        private static readonly List<GameObject> Surfaces = new();

        [MenuItem("Worst Date Ever/Create Desktop Bedroom")]
        public static void CreateDesktop() => Create(false);

        [MenuItem("Worst Date Ever/Create Quest Bedroom")]
        public static void CreateQuest() => Create(true);

        private static void Create(bool quest)
        {
            if (quest && !CanBuildQuest()) return;
            foreach (var name in new[] { "PlayerMan", "JacketMan", "FormalMan", "PlayerWoman", "JacketWoman",
                         "FormalWoman", "Caio", "Rafa", "Bia", "Luiza" })
            {
                if (AssetDatabase.LoadAssetAtPath<GameObject>($"{CharacterFolder}/{name}.glb")) continue;
                Debug.LogError("O quarto aguarda a importação do personagem " + name + ".");
                return;
            }
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            GrabTargets.Clear();
            Surfaces.Clear();
            Directory.CreateDirectory(Root + "/Scenes");
            Directory.CreateDirectory(Root + "/Materials");
            Directory.CreateDirectory(Root + "/Meshes");
            if (!AssetDatabase.IsValidFolder(Root + "/Materials/Physical"))
                AssetDatabase.CreateFolder(Root + "/Materials","Physical");
            LoadPhysicalMaterials();
            font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");

            var room = new GameObject("Quarto • 16:41");
            var game = room.AddComponent<BedroomController>();
            game.Speech = room.AddComponent<BedroomSpeech>();
            game.Narration = room.AddComponent<BedroomNarration>();
            game.Narration.InHeadset = quest;
            var lavender = new Color(.64f,.59f,.62f);
            var cream = new Color(.86f,.80f,.70f);
            var timber = new Color(.48f,.34f,.26f);
            ApplySurface(Block("Piso",new(0,-.08f,.55f),new(4.6f,.16f,5.7f),timber),"Floorboards",Color.white,new Vector2(.62f,.62f));
            var outside = room.AddComponent<BedroomWindowView>();
            game.Window = outside;
            BuildWindow(lavender, cream, outside);
            ApplySurface(Block("Parede esquerda", new(-2.3f, 1.45f, .55f), new(.15f, 2.9f, 5.7f), lavender),"Powdercoat",lavender,new Vector2(1.35f,1.35f),.25f,.10f);
            ApplySurface(Block("Parede direita", new(2.3f, 1.45f, .55f), new(.15f, 2.9f, 5.7f), lavender * .85f),"Powdercoat",lavender * .85f,new Vector2(1.35f,1.35f),.25f,.10f);
            ApplySurface(Block("Parede atrás", new(0, 1.45f, -2.3f), new(4.6f, 2.9f, .15f), lavender * .9f),"Powdercoat",lavender * .9f,new Vector2(1.35f,1.35f),.25f,.10f);
            ApplySurface(Block("Teto", new(0, 2.9f, .55f), new(4.6f, .12f, 5.7f), cream),"Powdercoat",cream,new Vector2(1.35f,1.35f),.25f,.10f);
            PlaceFurniture("rug", "Tapete de lã", new(.19f,.003f,.84f), new(1.08f,.025f,1.95f), 90);
            BuildDoor(cream, game);
            Block("Rodapé", new(-.54f, .09f, 3.30f), new(3.43f, .16f, .05f), cream, false);
            Block("Rodapé curto", new(2.16f, .09f, 3.30f), new(.27f, .16f, .05f), cream, false);

            var bed = PlaceFurniture("bed", "Cama estofada", new(.94f,0,-1.08f), new(1.54f,1.02f,2.13f));
            var mattress = MattressCollider(bed);
            var cushionPath = Root + "/Materials/Cama.asset";
            var cushion = AssetDatabase.LoadAssetAtPath<PhysicsMaterial>(cushionPath);
            if (!cushion)
            {
                cushion = new PhysicsMaterial("Cama") { bounciness = .10f, staticFriction = .54f, dynamicFriction = .60f };
                AssetDatabase.CreateAsset(cushion, cushionPath);
            }
            mattress.sharedMaterial = cushion;
            var mattressTop = mattress.transform.position.y + mattress.size.y * .5f;
            PlaceFurniture("blanket", "Manta dobrada", new(1.13f,mattressTop,-.41f), new(.62f,.075f,.37f));
            FurnitureCollider("Edredom dobrado", new(1.13f,mattressTop+.035f,-.41f), new(.59f,.068f,.34f)).sharedMaterial = cushion;

            AddSoftFabrics(mattressTop);
            ArrangeRoots(scene,new Vector3(2.174f,1.64f,1.32f),new Vector3(.95f,1.64f,-2.17f),90,DressBedWall);
            game.RoomAccent = Lighting("Luz ambiente fria",new(1.6f,2.18f,1.9f),
                LightType.Point,new(.70f,.77f,.86f),.55f,4.2f);
            var key = Lighting("Preenchimento do quarto",new(0,2.65f,.65f),
                LightType.Directional,new(1f,.95f,.86f),.66f,0);
            key.transform.rotation = Quaternion.Euler(63,-22,0);
            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(.49f,.46f,.50f);

            PlaceFurniture("bookcase","Estante com livros",new(-1.58f,0,-2.01f),new(.85f,2.0f,.34f));
            ArrangeRoots(scene,new Vector3(1.59f,0,-.15f),new Vector3(-.19f,0,-1.68f),180,() => BuildBedside(game));
            ArrangeRoots(scene,Vector3.zero,Vector3.forward*1.31f,0,() => BuildDeskSet(game));
            BuildCabinet(game,timber);
            BuildWardrobe();
            BuildMirror(game);
            DressLeftWall();

            BuildWindowPlant();

            outside.Accent = game.RoomAccent;
            outside.Fill = key;
            AddWindowLight(outside);

            if (quest)
            {
                AddQuestInteraction();
                var rig=UnityEngine.Object.FindFirstObjectByType<OVRCameraRig>();
                rig.transform.position=BedroomSpawn.Aisle;
                rig.gameObject.AddComponent<BedroomSpawn>().Rig=rig;
            }
            else
            {
                var camera = new GameObject("Prévia desktop", typeof(Camera), typeof(AudioListener), typeof(DesktopBedroomControls));
                camera.tag = "MainCamera";
                camera.transform.SetPositionAndRotation(BedroomSpawn.Aisle+Vector3.up*1.53f,Quaternion.Euler(3,4,0));
                var eye = camera.GetComponent<Camera>();
                eye.nearClipPlane = .035f;
                foreach (var surface in UnityEngine.Object.FindObjectsByType<Canvas>(FindObjectsSortMode.None))
                    surface.worldCamera = eye;
                new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
            }

            OrganizeBedroom(scene);
            var mainEye = Camera.main;
            if (mainEye) mainEye.cullingMask &= ~(1 << BedroomMirror.AvatarLayer);

            var file = Root + (quest ? "/Scenes/BedroomQuest.unity" : "/Scenes/BedroomDesktop.unity");
            EditorSceneManager.MarkSceneDirty(scene);
            if (!EditorSceneManager.SaveScene(scene, file))
                throw new InvalidOperationException("Não foi possível salvar o quarto em " + file);
            if (quest)
            {
                var scenes = EditorBuildSettings.scenes.Where(s => s.path != file).ToList();
                scenes.Insert(0, new EditorBuildSettingsScene(file, true));
                EditorBuildSettings.scenes = scenes.ToArray();
            }
            AssetDatabase.SaveAssets();
            Debug.Log("Worst Date Ever: quarto criado em " + file);
        }

        private static void ArrangeRoots(Scene scene, Vector3 origin, Vector3 position, float yaw, Action build)
        {
            var previous = scene.GetRootGameObjects().ToHashSet();
            build();
            var rotation = Quaternion.Euler(0,yaw,0);
            foreach (var root in scene.GetRootGameObjects().Where(root => !previous.Contains(root)))
            {
                var t = root.transform;
                t.SetPositionAndRotation(position+rotation*(t.position-origin),rotation*t.rotation);
            }
        }

        private static void BuildBedside(BedroomController game)
        {
            var nightstand = PlaceFurniture("nightstand","Criado-mudo de nogueira",new(1.59f,0,-.15f),new(.61f,.93f,.60f),180);
            DressImportedDrawers(nightstand,game,false);
            FurnitureCollider("Superfície do criado-mudo",new(1.59f,.895f,-.15f),new(.60f,.07f,.59f));
            PlaceFurniture("lamp","Abajur de cerâmica",new(1.37f,.93f,-.08f),new(.30f,.45f,.30f));
            DressAlarmClock();
            game.Lamp = Lighting("Abajur",new(1.40f,1.43f,-.09f),LightType.Point,new(1f,.72f,.48f),.72f,1.9f);
            AddLampCord(game);
            BuildPhone(game);
        }

        private static void BuildDeskSet(BedroomController game)
        {
            var desk = PlaceFurniture("desk","Escrivaninha",new(-1.27f,0,1.65f),new(1.48f,.90f,.70f),180);
            DressImportedDrawers(desk,game,true);
            FurnitureCollider("Tampo da escrivaninha",new(-1.27f,.86f,1.65f),new(1.46f,.08f,.69f));
            PlaceFurniture("chair","Cadeira de trabalho",new(-1.27f,0,.83f),new(.50f,.87f,.51f));
            BuildComputer(game);
            AddDeskDetails();
            var station = Rounded("Bandeja de preparação",new(-1.41f,.912f,1.44f),new(.37f,.022f,.24f),.007f,Teal,true);
            var lining = Rounded("Forro da bandeja",new(-1.41f,.925f,1.44f),new(.344f,.006f,.214f),.002f,Charcoal);
            ApplySurface(lining,"Weave",new(.27f,.36f,.33f),new(6,6),.50f,.12f);
            foreach (var edge in new[] { -.5f,.5f })
            {
                Rounded("Borda lateral da bandeja",station.transform.position+new Vector3(edge*.355f,.017f,0),
                    new(.015f,.026f,.237f),.004f,Teal,true);
                Rounded("Borda longa da bandeja",station.transform.position+new Vector3(0,.017f,edge*.224f),
                    new(.37f,.026f,.015f),.004f,Teal,true);
            }
            var trigger = new GameObject("Zona de preparação");
            trigger.transform.position = station.transform.position + Vector3.up * .082f;
            var sensor = trigger.AddComponent<BoxCollider>();
            sensor.size = new(.34f, .14f, .23f); sensor.isTrigger = true;
            trigger.AddComponent<PreparationStation>().Bedroom = game;
            AddPreparationProps();

        }

        private static void DetailPhoneCase(Transform phone,float scale)
        {
            Attach("Módulo de câmera",new(-.044f,.101f,.017f),new(.052f,.055f,.009f),Ink);
            Attach("Lente principal",new(-.051f,.104f,.024f),new(.024f,.024f,.006f),new(.28f,.38f,.44f));
            Attach("Lente secundária",new(-.025f,.114f,.023f),new(.013f,.013f,.004f),Charcoal);
            Attach("Tecla lateral",new(.076f,.050f,.003f),new(.004f,.045f,.012f),Brass);
            Attach("Grade do alto-falante",new(0,.136f,-.017f),new(.033f,.005f,.004f),Ink);
            void Attach(string name,Vector3 offset,Vector3 size,Color tint)
            {
                var detail = Rounded(name,Vector3.zero,size*scale,.0025f*scale,tint).transform;
                detail.SetParent(phone,false);
                detail.localPosition = offset*scale;
            }
        }

        private static void BuildWindowPlant()
        {
            var planter = new GameObject("Vaso no peitoril").transform;
            planter.position = new(-1.91f,1.079f,3.20f);
            var profile = new Vector2[] { new(.001f,-.051f),new(.061f,-.051f),new(.068f,-.046f),
                new(.082f,.042f),new(.084f,.050f),new(.075f,.050f),new(.071f,.035f),
                new(.057f,-.037f),new(.001f,-.037f) };
            var pot = MeshPart("Terracota",planter,Lathe("TerracottaPot",profile,0,360,36,false),Clay);
            ApplySurface(pot,"Powdercoat",new(.62f,.35f,.27f),new(4,4),.24f,.16f);
            Orb("Substrato",planter.position+Vector3.up*.041f,new(.141f,.018f,.141f),new(.28f,.20f,.15f))
                .transform.SetParent(planter,true);
            for (var i=0; i<5; i++)
            {
                var green = i%2==0 ? new Color(.38f,.62f,.36f) : new Color(.47f,.67f,.39f);
                var leaf = Orb("Folha",planter.position+new Vector3(-.075f+i*.039f,.128f+(i%3)*.011f,0),
                    new(.056f,.166f,.039f),green);
                leaf.transform.rotation = Quaternion.Euler(0,i*27f,42-i*21);
                leaf.transform.SetParent(planter,true);
                var vein = Rounded("Nervura",Vector3.zero,new(.004f,.119f,.004f),.0018f,
                    new(.66f,.73f,.47f)).transform;
                vein.SetParent(leaf.transform,true);
                vein.SetPositionAndRotation(leaf.transform.position+leaf.transform.forward*.018f,leaf.transform.rotation);
            }
        }

        private static bool CanBuildQuest()
        {
            if (FindApi("Oculus.Interaction.OVR.Editor.QuickActions.OVRQuickActionsAPI") != null &&
                FindApi("Oculus.Interaction.Editor.QuickActions.QuickActionsAPI") != null) return true;
            EditorUtility.DisplayDialog("Meta XR Interaction SDK",
                "Complete o Meta Simplified VR Setup e instale o pacote Meta XR Interaction SDK (OVR). Você já pode criar o quarto desktop.", "OK");
            return false;
        }

        private static Type FindApi(string name) => AppDomain.CurrentDomain.GetAssemblies()
            .Select(a => a.GetType(name, false)).FirstOrDefault(type => type != null);

        private static void AddQuestInteraction()
        {
            // Optional SDK bridge: the editor can compile before Meta packages are installed.
            var rig = FindApi("Oculus.Interaction.OVR.Editor.QuickActions.OVRQuickActionsAPI");
            var quick = FindApi("Oculus.Interaction.Editor.QuickActions.QuickActionsAPI");
            rig.GetMethod("AddOVRInteractionRig", new[] { typeof(bool) }).Invoke(null, new object[] { true });
            var managerType = FindApi("OVRManager");
            var manager = managerType == null ? null : UnityEngine.Object.FindFirstObjectByType(managerType);
            if (!manager) throw new InvalidOperationException("Meta Quick Action did not create an OVRManager.");
            var rigSettings = new SerializedObject(manager);
            var origin = rigSettings.FindProperty("trackingOriginType") ?? rigSettings.FindProperty("_trackingOriginType");
            var floor = origin?.propertyType == SerializedPropertyType.Enum
                ? Array.IndexOf(origin.enumNames, "FloorLevel") : -1;
            if (floor >= 0)
            {
                origin.enumValueIndex = floor;
                rigSettings.ApplyModifiedPropertiesWithoutUndo();
            }
            else Debug.LogWarning("Set the Quest rig tracking origin to Floor Level before building.");
            var grab = quick.GetMethod("AddGrabInteraction", new[] { typeof(GameObject) });
            var poke = quick.GetMethod("AddPokeCanvasInteraction", new[] { typeof(GameObject), typeof(bool) });
            var ray = quick.GetMethod("AddRayCanvasInteraction", new[] { typeof(GameObject), typeof(bool) });
            var rayGrab = quick.GetMethod("AddRayGrabInteraction", new[] { typeof(GameObject) });
            var grabbableType = FindApi("Oculus.Interaction.Grabbable");
            foreach (var target in GrabTargets)
            {
                var body = target.GetComponent<Rigidbody>();
                var docked = body.isKinematic;
                var guided = target.GetComponent<BedroomPull>() != null;
                grab.Invoke(null, new object[] { target });
                if (target.name.StartsWith("Telefone")) rayGrab.Invoke(null, new object[] { target });
                body.useGravity = !guided;
                body.isKinematic = docked;
                var profile = target.GetComponent<BedroomProp>().Material;
                body.collisionDetectionMode = !docked && profile && profile.Behavior == BedroomMaterialProfile.Response.Rebound
                    ? CollisionDetectionMode.ContinuousDynamic : CollisionDetectionMode.ContinuousSpeculative;

                var grabbable = target.GetComponent(grabbableType);
                if (!grabbable)
                    throw new InvalidOperationException("Meta Quick Action did not attach Grabbable: " + target.name);
                var settings = new SerializedObject(grabbable);
                settings.FindProperty("_rigidbody").objectReferenceValue = body;
                settings.FindProperty("_throwWhenUnselected").boolValue = !guided;
                settings.FindProperty("_forceKinematicDisabled").boolValue = !guided;
                if (!guided)
                {
                    var phone = target.name.StartsWith("Telefone");
                    var transformer = phone ? (Component)target.AddComponent<BedroomPhoneGrip>() :
                        target.AddComponent<BedroomDrawerGrabTransformer>();
                    settings.FindProperty("_oneGrabTransformer").objectReferenceValue = transformer;
                    settings.FindProperty("_twoGrabTransformer").objectReferenceValue = transformer;
                    if (phone) settings.FindProperty("_maxGrabPoints").intValue = 1;
                }
                settings.ApplyModifiedPropertiesWithoutUndo();
            }
            foreach (var canvas in Surfaces)
            {
                poke.Invoke(null, new object[] { canvas, true });
                ray.Invoke(null, new object[] { canvas, true });
            }
        }

        private static Material Painted(Color color)
        {
            var path = $"{Root}/Materials/Paint-{ColorUtility.ToHtmlStringRGB(color)}.mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (!material)
            {
                var shader = GraphicsSettings.currentRenderPipeline
                    ? Shader.Find("Universal Render Pipeline/Lit") : Shader.Find("Standard");
                material = new Material(shader) { color = color };
                AssetDatabase.CreateAsset(material, path);
            }
            var gloss = material.HasProperty("_Smoothness") ? "_Smoothness" : "_Glossiness";
            if (material.HasProperty(gloss) && !Mathf.Approximately(material.GetFloat(gloss), .11f))
            {
                material.SetFloat(gloss, .11f);
                EditorUtility.SetDirty(material);
            }
            return material;
        }

        private static Light Lighting(string name, Vector3 position, LightType type, Color color, float intensity, float range)
        {
            var light = new GameObject(name).AddComponent<Light>();
            light.transform.position = position;
            light.type = type;
            light.color = color;
            light.intensity = intensity;
            light.range = Mathf.Max(range, 1);
            light.shadows = LightShadows.None;
            return light;
        }

        private static GameObject Shape(string name, Vector3 position, Vector3 dimensions, Color color,
            PrimitiveType type, bool collision)
        {
            var go = GameObject.CreatePrimitive(type);
            go.name = name;
            go.transform.position = position;
            go.transform.localScale = type == PrimitiveType.Cylinder
                ? new Vector3(dimensions.x, dimensions.y / 2, dimensions.z) : dimensions;
            go.GetComponent<Renderer>().sharedMaterial = Painted(color);
            if (!collision) UnityEngine.Object.DestroyImmediate(go.GetComponent<Collider>());
            return go;
        }

        private static GameObject Block(string name, Vector3 position, Vector3 dimensions, Color color, bool collision = true) =>
            Shape(name, position, dimensions, color, PrimitiveType.Cube, collision);
        private static GameObject Orb(string name, Vector3 position, Vector3 dimensions, Color color) =>
            Shape(name, position, dimensions, color, PrimitiveType.Sphere, false);

        private static BedroomProp Prop(string name, Vector3 position, Vector3 dimensions,
            Color color, bool docked, PrimitiveType type = PrimitiveType.Cube)
        {
            var root = new GameObject(name);
            root.transform.position = position;
            var mesh = type == PrimitiveType.Cube
                ? Rounded("Modelo", position, dimensions, .039f, color)
                : Shape("Modelo", position, dimensions, color, type, false);
            mesh.transform.SetParent(root.transform, true);
            var collider = root.AddComponent<BoxCollider>();
            collider.size = dimensions;
            var rb = root.AddComponent<Rigidbody>();
            rb.mass = name.StartsWith("Telefone") ? .19f : .23f;
            rb.isKinematic = docked;
            rb.interpolation = RigidbodyInterpolation.Interpolate;
            rb.collisionDetectionMode = docked ? CollisionDetectionMode.ContinuousSpeculative : CollisionDetectionMode.ContinuousDynamic;
            GrabTargets.Add(root);
            root.AddComponent<BedroomAudio>();
            return root.AddComponent<BedroomProp>();
        }

        private static RectTransform CanvasAt(string name, Vector3 position, int width, int height, float scale)
        {
            var canvas = new GameObject(name, typeof(RectTransform), typeof(Canvas), typeof(GraphicRaycaster));
            var rect = (RectTransform)canvas.transform;
            rect.sizeDelta = new(width, height);
            rect.position = position;
            rect.localScale = Vector3.one * scale;
            canvas.GetComponent<Canvas>().renderMode = RenderMode.WorldSpace;
            Surfaces.Add(canvas);
            return rect;
        }

        private static RectTransform Rect(string name, Transform parent, Vector2 position, Vector2 size)
        {
            var rect = new GameObject(name, typeof(RectTransform)).GetComponent<RectTransform>();
            rect.SetParent(parent, false);
            rect.anchoredPosition = position;
            rect.sizeDelta = size;
            return rect;
        }

        private static Text Label(RectTransform parent, Vector2 position, Vector2 size, string value, int pixels, Color color)
        {
            var label = Rect(value, parent, position, size).gameObject.AddComponent<Text>();
            label.font = font;
            label.fontSize = pixels;
            label.alignment = TextAnchor.MiddleCenter;
            label.color = color;
            label.text = value;
            label.raycastTarget = false;
            return label;
        }

    }
}
