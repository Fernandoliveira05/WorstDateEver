using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.Animations;
using UnityEngine.Playables;
using UnityEngine.Rendering;
using UnityEngine.UI;

namespace WorstDateEver
{
    public sealed partial class FirstDateVenue : MonoBehaviour
    {
        [Serializable] private sealed class Station { public string id; public float[] position; }
        [Serializable] private sealed class SeatAnchor { public string id; public float[] position; public float yaw; }
        [Serializable] private sealed class PropLayout { public string id; public float[] position, size; }
        // JsonUtility cannot deserialize multidimensional arrays. The shared route import wraps each point.
        [Serializable] private sealed class Point { public float[] position; }
        [Serializable] private sealed class Layout
        {
            public Station[] stations;
            public SeatAnchor[] seats;
            public Point[] tables, dateRoute, restroomRoute, waiterRoute, entranceRoute;
            public PropLayout[] props;
        }

        private sealed class Actor
        {
            public GameObject root;
            public Transform head;
            public Transform[] upperLegs, lowerLegs, ankleEnds, feet, arms;
            public Vector3[] beforeFootPosition = new Vector3[2];
            public Quaternion[] beforeSeat = new Quaternion[6];
            public bool posed;
            public PlayableGraph graph;
            public AnimationMixerPlayable mixer;
            public float blend;
        }

        [Serializable] private sealed class Result
        {
            public int schemaVersion = 1;
            public string outcome;
            public FirstDateStory.Session session;
        }

        private const string ProgressKey = "worst-date-ever-native-first-date-progress-v1";
        private FirstDateStory story;
        private string attempt, savedVersion;

        public static void ClearProgress() => PlayerPrefs.DeleteKey(ProgressKey);
        private FirstDateArt art;
        private Layout layout;
        private OVRCameraRig rig;
        private Camera eye;
        private Action restart;
        private FirstDateVoice voice;
        private GameObject[] bedroom;
        private Material fadeMaterial;
        private CameraClearFlags cameraClear;
        private Color cameraBackground, roomAmbient;
        private AmbientMode roomAmbientMode;
        private Vector3 oldPosition, playerSeat;
        private Quaternion oldRotation;
        private DesktopBedroomControls desktop;
        private bool wasDesktop, began, cutting, saved;
        private Transform room, anchor;
        private Transform architecture, furnishings, tableProps, characters, lights, interfaceObjects;
        private Transform entrance, restroom, tray;
        private GameObject wrongOrder;
        private float worldTime;
        private GameObject[] splash;
        private Actor[] actors;
        private string lastCaption, lastBeat;
        private float gestureTime;
        private Material wood, brass, vessel, seat, alloy, paper;
        private readonly List<Material> materials = new();
        private readonly Dictionary<string, DateProp> props = new();
        private AudioClip chime, sound, murmur;

        public static FirstDateVenue Enter(FirstDateStory.Handoff handoff, Action restart)
        {
            var root = new GameObject("First Date Scene Coordinator");
            var date = root.AddComponent<FirstDateVenue>();
            try { date.Initialize(handoff, restart); }
            catch { Destroy(root); throw; }
            return date;
        }

        private void Initialize(FirstDateStory.Handoff handoff, Action onRestart)
        {
            attempt = string.Join(":", handoff.matchId, handoff.avatarGender, handoff.preference, handoff.substance);
            FirstDateStory.Checkpoint draft = null;
            if (PlayerPrefs.HasKey(ProgressKey)) {
                try { draft = JsonUtility.FromJson<FirstDateStory.Checkpoint>(PlayerPrefs.GetString(ProgressKey)); }
                catch (ArgumentException) { }
            }
            if (draft?.attempt != attempt) draft = null;
            story = new FirstDateStory(handoff, draft?.session?.eventSeed ?? UnityEngine.Random.Range(0, int.MaxValue), draft);
            art = Resources.Load<FirstDateArt>("FirstDate/Art");
            if (!art) throw new InvalidOperationException("Date scene art references are missing.");
            layout = FirstDateStory.Read<Layout>("venue-layout");
            rig = FindFirstObjectByType<OVRCameraRig>();
            eye = rig ? rig.centerEyeAnchor.GetComponent<Camera>() : Camera.main;
            if (!eye) throw new InvalidOperationException("Date scene requires the current camera.");
            anchor = rig ? rig.transform : eye.transform;
            oldPosition = anchor.position;
            oldRotation = anchor.rotation;
            cameraClear = eye.clearFlags;
            cameraBackground = eye.backgroundColor;
            desktop = eye.GetComponent<DesktopBedroomControls>();
            wasDesktop = desktop && desktop.enabled;
            roomAmbient = RenderSettings.ambientLight;
            roomAmbientMode = RenderSettings.ambientMode;
            restart = onRestart;
            var bedroomProps = FindObjectsByType<BedroomProp>(FindObjectsSortMode.None);
            bedroom = gameObject.scene.GetRootGameObjects().Where(item => item != gameObject && item.activeSelf &&
                item != anchor.root.gameObject && !item.GetComponent<OVRManager>()).ToArray();
            playerSeat = PointAt(Seat("player_seat").position);
            var venueObject = new GameObject("First date — " + story.Venue.id);
            room = venueObject.transform;
            room.SetParent(transform, false);
            architecture = SceneGroup("Venue architecture");
            furnishings = SceneGroup("Venue furniture");
            tableProps = SceneGroup("Table props");
            characters = SceneGroup("Venue characters");
            lights = SceneGroup("Venue lighting");
            interfaceObjects = SceneGroup("Conversation and feedback");
            venueObject.AddComponent<FirstDateFrameMetrics>();
            room.gameObject.SetActive(false);
            BuildRoom(bedroomProps);
            BuildControls();
            voice = gameObject.AddComponent<FirstDateVoice>();
            voice.Initialize(story);
            chime = DateSound("Chime", 698, 497, .23f);
            sound = DateSound("Tableware", 444, 185, .18f);
            murmur = DateSound("Conversation murmur", 140, 105, .27f);
            StartCoroutine(Cut(true));
        }

        private Material Make(Color color, Texture texture = null)
        {
            var material = new Material(art.Surface) { color = color, mainTexture = texture };
            materials.Add(material);
            return material;
        }

        private Transform SceneGroup(string name)
        {
            var group = new GameObject(name).transform;
            group.SetParent(room, false);
            return group;
        }

        private static Vector3 PointAt(float[] position) => new(position[0], position[1], -position[2]);
        private GameObject Shape(PrimitiveType type, string name, Vector3 size, Vector3 position, Material material,
            Transform parent = null, bool solid = false)
        {
            var item = GameObject.CreatePrimitive(type);
            item.name = name;
            item.transform.SetParent(parent ? parent : architecture, false);
            item.transform.localPosition = position;
            item.transform.localScale = size;
            item.GetComponent<Renderer>().sharedMaterial = material;
            if (!solid) Destroy(item.GetComponent<Collider>());
            return item;
        }

        private GameObject Box(string name, Vector3 size, Vector3 position, Material material,
            Transform parent = null, bool solid = false) => Shape(PrimitiveType.Cube, name, size, position, material, parent, solid);

        private GameObject Cylinder(string name, Vector3 dimensions, Vector3 position, Material material, Transform parent = null)
        {
            dimensions.y /= 2;
            return Shape(PrimitiveType.Cylinder, name, dimensions, position, material, parent);
        }

        private void BuildRoom(BedroomProp[] existing)
        {
            var index = Array.IndexOf(new[] { "cafe", "sushi", "bistro", "bar" }, story.Venue.id);
            var tint = new[] { new Color(.65f,.44f,.32f), new Color(.55f,.33f,.39f),
                new Color(.52f,.45f,.36f), new Color(.46f,.39f,.58f) }[index];
            var chairTint = new[] { new Color(.28f,.43f,.37f), new Color(.49f,.15f,.19f),
                new Color(.29f,.34f,.16f), new Color(.29f,.2f,.41f) }[index];
            var wall = Make(tint);
            wood = Make(new Color(.54f,.35f,.23f), art.Walnut);
            brass = Make(new Color(.68f,.44f,.22f));
            alloy = Make(new Color(.18f,.13f,.18f));
            vessel = Make(new Color(.91f,.79f,.63f));
            paper = Make(new Color(.85f,.62f,.44f));
            seat = Make(chairTint);
            var floor = Make(new Color(.59f,.43f,.41f), art.Floor);
            floor.mainTextureScale = new Vector2(4, 4);
            var sky = Make(index == 0 ? new Color(.8f,.46f,.36f) : new Color(.27f,.29f,.48f));
            var city = Make(new Color(.28f,.20f,.30f));
            Box("Floor", new(11.5f,.1f,10), new(0,-.05f,3.15f), floor, solid:true);
            Box("Ceiling", new(11.5f,.15f,10), new(0,3.3f,3.15f), wall)
                .GetComponent<Renderer>().shadowCastingMode = ShadowCastingMode.Off;
            Box("Wall behind player", new(11.5f,3.3f,.18f), new(0,1.65f,-1.77f), wall, solid:true);
            foreach (var x in new[] { -5.55f, 5.55f })
            {
                Box("Side wall", new(.18f,3.3f,10), new(x,1.65f,3.15f), wall, solid:true);
                Box("Wall trim", new(.25f,.18f,10), new(x,.1f,3.15f), wood);
                foreach (var z in new[] { .8f, 3.4f, 6.1f })
                    Box("Timber joint", new(.26f,3.1f,.14f), new(x,1.57f,z), wood);
            }
            Box("Window sill", new(11.2f,1.01f,.17f), new(0,.505f,7.9f), wood, solid:true);
            Box("Window sky", new(11.2f,1.82f,.07f), new(0,1.93f,7.96f), sky);
            Box("Window header", new(11.2f,.52f,.17f), new(0,3.05f,7.9f), wall);
            for (var x = -5.5f; x < 5.6f; x += 1.1f)
                Box("Window frame", new(.065f,1.91f,.18f), new(x,1.95f,7.84f), wood);
            for (int i = 0; i < 25; i++)
            {
                var h = .16f + i * .567f % .84f;
                Box("Neighbourhood silhouette", new(.16f + i * .17f % .42f,h,.045f),
                    new(i * 2.73f % 10.7f - 5.35f,1.02f + h / 2,7.88f), city);
            }
            foreach (var x in new[] { -3.8f, 0, 3.8f })
            {
                Box("Pendant stem", new(.035f,.7f,.035f), new(x,2.93f,2.6f), alloy);
                Cylinder("Pendant shade", new(.78f,.14f,.78f), new(x,2.55f,2.6f), brass);
                Cylinder("Pendant diffuser", new(.66f,.015f,.66f), new(x,2.477f,2.6f), vessel);
                var fixture = new GameObject("Pendant glow", typeof(Light));
                fixture.transform.SetParent(lights, false);
                fixture.transform.localPosition = new Vector3(x, 2.35f, 2.6f);
                var glow = fixture.GetComponent<Light>();
                glow.type = LightType.Point;
                glow.color = new Color(1f, .79f, .60f);
                glow.intensity = .65f;
                glow.range = 4.5f;
            }

            foreach (var point in layout.tables) Table(PointAt(point.position));
            foreach (var chair in layout.seats) Chair(chair);
            Box("Counter", new(1.32f,1.1f,1.72f), new(4.76f,.55f,3.57f), wood, solid:true);
            Box("Counter ceramic", new(1.37f,.055f,1.79f), new(4.76f,1.12f,3.57f), vessel);
            for (int i = 0; i < 5; i++)
            {
                Cylinder("Bottle", new(.13f,.18f + i % 2 * .08f,.13f), new(4.77f + i * .115f,1.24f,3.7f), i % 2 == 0 ? seat : paper);
                Cylinder("Bottle neck", new(.06f,.07f,.06f), new(4.77f + i * .115f,1.37f,3.7f), brass);
            }
            entrance = Door("door_main", new(3.74f,0,7.72f), 0);
            restroom = Door("restroom", new(-5.35f,0,6.03f), -90);
            if (index == 1)
            {
                for (var i = 0; i < 11; i++)
                    Box("Noren curtain", new(.87f,.38f,.035f), new(-4.65f + i * .92f,2.58f,7.71f), i % 3 == 0 ? seat : vessel);
                foreach (var position in new[] { new Vector3(-.12f,.806f,.36f), new(.02f,.806f,.43f), new(.14f,.806f,.47f) })
                {
                    Cylinder("Nori", new(.084f,.04f,.084f), position, alloy);
                    Cylinder("Rice", new(.066f,.005f,.066f), position + Vector3.up * .022f, vessel);
                    Cylinder("Salmon", new(.035f,.004f,.034f), position + Vector3.up * .026f, paper);
                }
                foreach (var x in new[] { .45f, .474f })
                    Box("Chopstick", new(.012f,.015f,.25f), new(x,.798f,-.11f), brass).transform.Rotate(0,20,0);
            }

            var key = new GameObject("Venue lighting", typeof(Light));
            key.transform.SetParent(lights, false);
            key.transform.rotation = Quaternion.Euler(53, -24, 0);
            var sun = key.GetComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = new Color(1f,.88f,.75f);
            sun.intensity = 1.1f;
            sun.shadows = LightShadows.Soft;
            sun.shadowNormalBias = .28f;
            var modelIndex = Array.IndexOf(new[] { "caio", "rafa", "bia", "luiza" }, story.Person.id);
            actors = new[] { modelIndex, 4, 5, 6, 7, 8 }.Select(Character).ToArray();
            actors[0].root.SetActive(false);
            tray = Cylinder("Serving tray", new(.44f,.022f,.44f), new(.23f,1.0f,.28f), brass, actors[5].root.transform).transform;
            Cylinder("Order on tray", new(.15f,.025f,.15f), new(0,1.1f,0), vessel, actors[5].root.transform)
                .transform.SetPositionAndRotation(tray.position + Vector3.up * .02f, Quaternion.identity);
            wrongOrder = Cylinder("Unexpected pink dessert", new(.14f,.045f,.14f), new(.23f,1.057f,.28f),
                Make(new Color(.87f,.35f,.58f)), actors[5].root.transform);
            wrongOrder.SetActive(false);
            var water = Make(new Color(.36f,.62f,.71f));
            splash = Enumerable.Range(0, 7).Select(i =>
            {
                var position = new Vector3(-.32f + Mathf.Cos(i * 2.4f) * .12f,.79f,.13f + Mathf.Sin(i * 2.4f) * .15f);
                var drop = Shape(PrimitiveType.Sphere, "Spilled water", new(.06f,.014f,.042f), position, water);
                drop.SetActive(false);
                return drop;
            }).ToArray();
            var names = new Dictionary<string, string> { ["cup"] = "Caneca de cerâmica", ["plate"] = "Prato de sobremesa", ["menu"] = "Caderno de capa dura" };
            foreach (var spec in layout.props)
                AddProp(spec, existing.FirstOrDefault(prop => prop.name == names[spec.id]));
        }

        private Transform Door(string name, Vector3 position, float yaw)
        {
            var pivot = new GameObject(name).transform;
            pivot.SetParent(architecture, false);
            pivot.localPosition = position;
            pivot.localRotation = Quaternion.Euler(0,yaw,0);
            Box("Door", new(.94f,2.15f,.08f), new(.46f,1.075f,0), seat, pivot);
            Box("Door panel", new(.78f,.49f,.093f), new(.46f,1.7f,0), wood, pivot);
            Shape(PrimitiveType.Sphere, "Door knob", new(.076f,.076f,.076f), new(.83f,1.04f,-.062f), brass, pivot);
            return pivot;
        }

        private void Table(Vector3 pos)
        {
            Box("Tabletop", new(1.28f,.07f,1.02f), pos + Vector3.up * .75f, wood, furnishings, solid:true);
            Cylinder("Table pedestal", new(.22f,.72f,.22f), pos + Vector3.up * .36f, alloy, furnishings);
            Cylinder("Table foot", new(.62f,.035f,.62f), pos + Vector3.up * .024f, brass, furnishings);
            foreach (var x in new[] { -.38f, .38f })
            {
                Box("Placemat", new(.29f,.002f,.35f), pos + new Vector3(x,.787f,0), seat, furnishings);
                if (pos.x != 0) Cylinder("Side plate", new(.26f,.025f,.26f), pos + new Vector3(x,.805f,0), vessel, furnishings);
            }
        }

        private void Chair(SeatAnchor spot)
        {
            var chair = new GameObject(spot.id).transform;
            chair.SetParent(furnishings, false);
            chair.SetLocalPositionAndRotation(PointAt(spot.position), Quaternion.Euler(0, SeatYaw(spot), 0));
            Box("Seat cushion", new(.49f,.095f,.47f), new(0,.46f,0), seat, chair);
            Box("Seat back", new(.49f,.37f,.075f), new(0,.76f,-.2f), seat, chair);
            foreach (var x in new[] { -.19f, .19f })
                foreach (var z in new[] { -.17f, .17f })
                    Box("Chair leg", new(.045f,.42f,.045f), new(x,.22f,z), wood, chair);
        }

        private SeatAnchor Seat(string id) => layout.seats.First(anchor => anchor.id == id);
        private static float SeatYaw(SeatAnchor spot) => 180 - spot.yaw * Mathf.Rad2Deg;

        private static void AimBone(Transform bone, Transform endpoint, Vector3 target)
        {
            var current = endpoint.position - bone.position;
            var desired = target - bone.position;
            if (current.sqrMagnitude > .000001f && desired.sqrMagnitude > .000001f)
                bone.rotation = Quaternion.FromToRotation(current, desired) * bone.rotation;
        }

        private static void ResetSeat(Actor actor)
        {
            if (!actor.posed) return;
            actor.posed = false;
            for (int i = 0; i < 2; i++)
            {
                actor.upperLegs[i].localRotation = actor.beforeSeat[i * 3];
                actor.lowerLegs[i].localRotation = actor.beforeSeat[i * 3 + 1];
                actor.feet[i].localRotation = actor.beforeSeat[i * 3 + 2];
                actor.feet[i].localPosition = actor.beforeFootPosition[i];
            }
        }

        private static void PoseSeat(Actor actor, float amount)
        {
            if (amount <= 0 || actor.upperLegs.Any(joint => !joint) || actor.lowerLegs.Any(joint => !joint) ||
                actor.feet.Any(joint => !joint)) return;
            actor.posed = true;
            var height = (actor.upperLegs[0].position.y + actor.upperLegs[1].position.y) * .5f;
            var lowerBy = (height - (.46f + .095f / 2 + .075f)) * amount;
            actor.root.transform.position -= Vector3.up * lowerBy;
            var forward = actor.root.transform.forward;
            for (int i = 0; i < 2; i++)
            {
                var thigh = actor.upperLegs[i];
                var shin = actor.lowerLegs[i];
                var foot = actor.feet[i];
                var end = actor.ankleEnds[i] ? actor.ankleEnds[i] : foot;
                actor.beforeFootPosition[i] = foot.localPosition;
                actor.beforeSeat[i*3] = thigh.localRotation;
                actor.beforeSeat[i*3+1] = shin.localRotation;
                actor.beforeSeat[i*3+2] = foot.localRotation;
                var upper = Vector3.Distance(thigh.position, shin.position);
                var lower = Vector3.Distance(shin.position, end.position);
                if (upper < .04f || lower < .04f) continue;
                var standing = foot.position + Vector3.up * lowerBy;
                var target = thigh.position + forward * .29f;
                target.y = Mathf.Clamp(standing.y, .05f, .115f);
                var offset = end == foot ? Vector3.zero : Vector3.ClampMagnitude(end.position - foot.position, .05f);
                target = Vector3.Lerp(standing, target, amount) + offset;
                var line = target - thigh.position;
                var distance = Mathf.Clamp(line.magnitude, Mathf.Abs(upper - lower) + .002f, upper + lower - .002f);
                line.Normalize();
                var pole = Vector3.ProjectOnPlane(forward, line).normalized;
                var along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
                var bend = Mathf.Sqrt(Mathf.Max(0, upper * upper - along * along));
                var knee = thigh.position + line * along + pole * bend;
                var shoeRotation = foot.rotation;
                AimBone(thigh, shin, knee);
                AimBone(shin, end, target);
                if (end != foot) foot.position = end.position - offset;
                foot.rotation = shoeRotation;
            }
        }

        private Actor Character(int index)
        {
            var actor = new Actor { root = new GameObject("Date actor " + index) };
            actor.root.transform.SetParent(characters, false);
            var model = Instantiate(art.Characters[index], actor.root.transform);
            var renderers = model.GetComponentsInChildren<Renderer>();
            Bounds BoundsOf() {
                var bounds = renderers[0].bounds;
                foreach (var renderer in renderers) bounds.Encapsulate(renderer.bounds);
                return bounds;
            }
            var bounds = BoundsOf();
            model.transform.localScale *= 1.68f / Mathf.Max(.1f, bounds.size.y);
            bounds = BoundsOf();
            model.transform.position -= new Vector3(bounds.center.x, bounds.min.y, bounds.center.z);
            var animator = model.GetComponentInChildren<Animator>() ?? model.AddComponent<Animator>();
            animator.cullingMode = AnimatorCullingMode.AlwaysAnimate;
            animator.applyRootMotion = false;
            var legacy = model.GetComponentInChildren<Animation>();
            if (legacy) legacy.enabled = false;
            actor.graph = PlayableGraph.Create("First-date walk and idle");
            actor.graph.SetTimeUpdateMode(DirectorUpdateMode.Manual);
            actor.mixer = AnimationMixerPlayable.Create(actor.graph, 2);
            var clips = new[] { art.Idle[index], art.Walk[index] };
            for (int i = 0; i < clips.Length; i++)
            {
                if (!clips[i] || clips[i].legacy) continue;
                var clip = AnimationClipPlayable.Create(actor.graph, clips[i]);
                actor.graph.Connect(clip, 0, actor.mixer, i);
            }
            var output = AnimationPlayableOutput.Create(actor.graph, "Date actor", animator);
            output.SetSourcePlayable(actor.mixer);
            actor.graph.Play();

            var bones = model.GetComponentsInChildren<Transform>();
            Transform Find(string key) => bones.FirstOrDefault(bone =>
                new string(bone.name.Where(char.IsLetter).ToArray()).Equals(key, StringComparison.OrdinalIgnoreCase));
            actor.head = Find("Head");
            actor.upperLegs = new[] { Find("UpperLegL"), Find("UpperLegR") };
            actor.lowerLegs = new[] { Find("LowerLegL"), Find("LowerLegR") };
            actor.ankleEnds = new[] { Find("LowerLegLend"), Find("LowerLegRend") };
            actor.feet = new[] { Find("FootL"), Find("FootR") };
            for (int i = 0; i < actor.feet.Length; i++)
            {
                if (actor.ankleEnds[i] || !actor.feet[i] || !actor.lowerLegs[i] ||
                    actor.feet[i].IsChildOf(actor.lowerLegs[i])) continue;
                var ankle = new GameObject("Seated ankle anchor").transform;
                ankle.SetParent(actor.lowerLegs[i], false);
                ankle.position = actor.feet[i].position;
                actor.ankleEnds[i] = ankle;
            }
            actor.arms = new[] { Find("UpperArmL"), Find("UpperArmR") };
            return actor;
        }

        private void Walk(Actor actor, Point[] route, float amount, bool walking, float sit, float yaw, bool reverse = false)
        {
            var total = 0f;
            for (int i = 1; i < route.Length; i++) total += Vector3.Distance(PointAt(route[i-1].position), PointAt(route[i].position));
            var travel = total * Mathf.Clamp01(amount);
            var from = PointAt(route[0].position);
            var to = from;
            var progress = 0f;
            for (int i = 1; i < route.Length; i++)
            {
                from = PointAt(route[i-1].position);
                to = PointAt(route[i].position);
                var length = Vector3.Distance(from, to);
                if (travel > length && i < route.Length - 1) { travel -= length; continue; }
                progress = length > 0 ? travel / length : 0;
                break;
            }
            var target = Vector3.Lerp(from, to, progress);
            actor.root.transform.localPosition = target;
            var facing = reverse ? from - to : to - from;
            actor.root.transform.localRotation = walking && facing.sqrMagnitude > .01f ?
                Quaternion.LookRotation(facing) : Quaternion.Euler(0,yaw,0);
            actor.blend = Mathf.MoveTowards(actor.blend, walking ? 1 : 0, Time.deltaTime * 6);
            actor.mixer.SetInputWeight(0, 1 - actor.blend);
            actor.mixer.SetInputWeight(1, actor.blend);
            for (int i = 0; i < 2; i++)
            {
                var clip = actor.mixer.GetInput(i);
                if (clip.IsValid() && clip.GetTime() >= ((AnimationClipPlayable)clip).GetAnimationClip().length)
                    clip.SetTime(0);
            }
            ResetSeat(actor);
            actor.graph.Evaluate(Time.deltaTime);
            PoseSeat(actor, sit);
        }

        private static Point[] Single(float x, float z) => new[] { new Point { position = new[] { x, 0, z } } };

        private void UpdateWorld()
        {
            var t = story.Time;
            var state = story.State.phase;
            var moving = state == "arriving";
            actors[0].root.SetActive(state != "waiting");
            if (state != "waiting")
                Walk(actors[0], layout.dateRoute, (t - 1) / 4, moving, Mathf.Clamp01((t - 6.5f) / .9f), SeatYaw(Seat("date_seat")));
            entrance.localRotation = Quaternion.Euler(0, moving && t < 2.3f ? 60 * Mathf.Sin(Mathf.PI * (t - 1) / 1.3f) : 0, 0);
            if (story.Caption != lastCaption) { lastCaption = story.Caption; gestureTime = t; }
            if (t - gestureTime < 1.25f && actors[0].head)
            {
                var wave = Mathf.Sin((t - gestureTime) * 12) * (1 - (t - gestureTime) / 1.25f);
                actors[0].head.Rotate(wave * (story.Gesture == "nod" ? 12 : 4), 0, wave * 7);
                if (story.Gesture == "wave" && actors[0].arms[1]) actors[0].arms[1].Rotate(0, 0, -40 + wave * 16);
            }
            var bathTime = (t + 5) % 33;
            var bath = bathTime < 6 ? 0 : bathTime < 11 ? (bathTime - 6) / 5 :
                bathTime < 14 ? 1 : Mathf.Max(0, 1 - (bathTime - 14) / 5);
            restroom.localRotation = Quaternion.Euler(0,-90 + (story.Beat?.id == "bathroom_mishap" &&
                (story.BeatPhase == "animate" || story.BeatPhase == "choice_window") ? Mathf.Sin(t * 16) * 6 :
                (bathTime >= 9 && bathTime < 11 || bathTime >= 14 && bathTime < 16) ? 45 : 0),0);
            var bathSit = bathTime < 6 ? Mathf.Clamp01(6 - bathTime) : Mathf.Clamp01(bathTime - 19);
            actors[1].root.SetActive(bath != 1);
            if (bath != 1) Walk(actors[1], layout.restroomRoute, bath, bath > 0 && bath < 1,
                bathSit, SeatYaw(Seat("restroom_guest")), bathTime >= 14);
            var near = Seat("chat_near");
            var far = Seat("chat_far");
            Walk(actors[2], new[] { new Point { position = near.position } }, 0, false, 1, SeatYaw(near));
            Walk(actors[3], new[] { new Point { position = far.position } }, 0, false, 1, SeatYaw(far));
            var entry = (t + 15) % 36;
            var guest = entry < 5 ? entry / 5 : entry > 30 ? 1 - (entry - 30) / 6 : 1;
            var guestSit = Mathf.Clamp01(Mathf.Min(entry - 5, 30 - entry));
            Walk(actors[4], layout.entranceRoute, guest, guest > 0 && guest < 1, guestSit, SeatYaw(Seat("entry_guest")), entry > 30);
            var shift = (t + 2) % 22;
            var service = shift < 3 ? 0 : shift < 9 ? (shift - 3) / 6 : shift < 12 ? 1 : Mathf.Max(0, 1 - (shift - 12) / 6);
            var tableService = (story.Beat?.id == "water_spill" || story.Beat?.id == "wrong_order") &&
                story.BeatPhase != "cooldown";
            var prevServer = actors[5].root.transform.localPosition;
            Walk(actors[5], tableService ? Single(1.15f,-.7f) : layout.waiterRoute, service,
                !tableService && service > 0 && service < 1, 0, tableService || service == 1 ? 90 : 180, shift >= 12);
            if (worldTime > 0)
                actors[5].root.transform.localPosition = Vector3.MoveTowards(prevServer, actors[5].root.transform.localPosition, Time.deltaTime * 2.05f);
            if (story.BeatPhase == "animate" || story.BeatPhase == "choice_window")
            {
                if (story.Beat.id == "loud_guest" && actors[2].head)
                    actors[2].head.Rotate(-13 + 7 * Mathf.Sin(t * 13), 0, 0);
                if (story.Beat.id == "awkward_friend" && actors[4].arms[1])
                {
                    actors[4].arms[1].Rotate(0,0, -55 + 14 * Mathf.Sin(t * 9));
                }
            }
            wrongOrder.SetActive(story.Beat?.id == "wrong_order" &&
                (story.BeatPhase == "animate" || story.BeatPhase == "choice_window" || story.BeatPhase == "resolve"));
            var water = story.Beat?.id == "water_spill";
            tray.localRotation = Quaternion.Euler(0,0,water && story.BeatPhase == "animate" ? 26 : 0);
            foreach (var drop in splash)
                drop.SetActive(water && (story.BeatPhase == "choice_window" || story.BeatPhase == "resolve"));
            if (story.BeatPhase == "animate" && lastBeat != story.Beat.id)
            {
                lastBeat = story.Beat.id;
                Play(sound, actors[5].root.transform.position, .18f);
                if (props.TryGetValue(story.BeatVisual.prop ?? "", out var prop) && !prop.held)
                {
                    prop.Reset();
                    if (lastBeat == "dropped_menu") prop.body.linearVelocity = new Vector3(0,.17f,-1.3f);
                }
            }
            if (t >= 1 && worldTime < 1) Play(chime, actors[0].root.transform.position, .25f);
            else if (moving && Mathf.Floor(t * 2) != Mathf.Floor(worldTime * 2))
                Play(sound, actors[0].root.transform.position, .05f);
            if (Mathf.Floor(t / 6) != Mathf.Floor((t - Time.deltaTime) / 6))
                Play(murmur, actors[2].root.transform.position, .08f);
            worldTime = t;
        }

        private static AudioClip DateSound(string name, float start, float end, float duration)
        {
            const int rate = 16000;
            var count = Mathf.RoundToInt(rate * duration);
            var data = new float[count];
            float phase = 0;
            for (int i = 0; i < data.Length; i++)
            {
                var t = i / (float)data.Length;
                phase += Mathf.PI * 2 * Mathf.Lerp(start, end, t) / rate;
                data[i] = Mathf.Sin(phase) * Mathf.Sin(Mathf.PI * t) * Mathf.Exp(-2 * t);
            }
            var clip = AudioClip.Create(name, count, 1, rate, false);
            clip.SetData(data, 0);
            return clip;
        }

        private void Play(AudioClip clip, Vector3 position, float volume)
        {
            if (voice && voice.Recording) return;
            var source = new GameObject(clip.name, typeof(AudioSource));
            source.transform.SetParent(room, false);
            source.transform.position = position;
            var audio = source.GetComponent<AudioSource>();
            audio.spatialBlend = 1;
            audio.clip = clip;
            audio.volume = volume;
            audio.Play();
            Destroy(source, clip.length + .1f);
        }

        private IEnumerator Cut(bool entering)
        {
            cutting = true;
            var fade = BuildFade();
            foreach (var direction in new[] { 1, -1 })
            {
                var elapsed = 0f;
                while (elapsed < .3f)
                {
                    elapsed += Time.unscaledDeltaTime;
                    FadeAlpha(fade, direction > 0 ? elapsed / .3f : 1 - elapsed / .3f);
                    yield return null;
                }
                if (direction < 0) break;
                if (entering)
                {
                    foreach (var item in bedroom) if (item) item.SetActive(false);
                    if (desktop) desktop.enabled = false;
                    RenderSettings.ambientMode = AmbientMode.Flat;
                    RenderSettings.ambientLight = new Color(.62f,.53f,.55f);
                    eye.clearFlags = CameraClearFlags.SolidColor;
                    eye.backgroundColor = new Color(.15f,.1f,.18f);
                    room.gameObject.SetActive(true);
                    Recenter();
                }
                else
                {
                    room.gameObject.SetActive(false);
                    foreach (var item in bedroom) if (item) item.SetActive(true);
                    if (desktop) desktop.enabled = wasDesktop;
                    RenderSettings.ambientMode = roomAmbientMode;
                    RenderSettings.ambientLight = roomAmbient;
                    eye.clearFlags = cameraClear;
                    eye.backgroundColor = cameraBackground;
                    anchor.SetPositionAndRotation(oldPosition, oldRotation);
                    restart();
                }
            }
            Destroy(fade.canvas.gameObject);
            cutting = false;
            began = entering;
            if (!entering) Destroy(gameObject);
        }

        private void Recenter()
        {
            var target = playerSeat + Vector3.up * 1.43f;
            if (!rig) { eye.transform.SetPositionAndRotation(target, Quaternion.Euler(5,0,0)); return; }
            var heading = Vector3.ProjectOnPlane(eye.transform.forward, Vector3.up);
            if (heading.sqrMagnitude > .01f) anchor.Rotate(Vector3.up, -Vector3.SignedAngle(Vector3.forward, heading, Vector3.up), Space.World);
            anchor.position += target - eye.transform.position;
        }

        private void Update()
        {
            if (!began || cutting) return;
            story.Tick(Time.deltaTime, !voice.Busy);
            UpdateWorld();
            UpdateControls();
            var state = story.State;
            var version = $"{state.phase}:{state.turnSequence}:{story.BeatPhase}:{state.activeEventId}:{state.completedEventIds.Length}";
            if (savedVersion != version)
            {
                savedVersion = version;
                PlayerPrefs.SetString(ProgressKey, JsonUtility.ToJson(story.Snapshot(attempt)));
                PlayerPrefs.Save();
            }
            if (!saved && !string.IsNullOrEmpty(story.Outcome) && story.State.phase == "completed")
            {
                saved = true;
                PlayerPrefs.SetString("worst-date-ever-native-first-date-result-v1",
                    JsonUtility.ToJson(new Result { outcome = story.Outcome, session = story.State }));
                PlayerPrefs.Save();
            }
        }

        private void OnDestroy()
        {
            if (actors != null) foreach (var actor in actors) if (actor?.graph.IsValid() == true) actor.graph.Destroy();
            foreach (var material in materials) Destroy(material);
            if (chime) Destroy(chime);
            if (sound) Destroy(sound);
            if (murmur) Destroy(murmur);
        }
    }
}
