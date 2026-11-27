using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.Rendering;

namespace WorstDateEver
{
    public sealed partial class FirstDateVenue
    {
        private bool IsPicnic => story.Person.id == "caio";

        private static string ModelFor(string id) => id switch
        {
            "basket" => "picnic_basket",
            "sandwich" => "picnic_sandwich",
            "kombucha" => "picnic_kombucha",
            "fruit-bowl" => "fruit-bowl",
            "book" => "hardcover-book",
            "cake" => "cake-slice",
            "coffee" => "coffee-cup",
            "candle" => "candle",
            "vase" => "flower-vase",
            "wine" => "wine-glass",
            "beer" => "beer-mug",
            "petiscos" => "petiscos-bowl",
            "peanuts" => "peanuts-bowl",
            "hot-sauce" => "hot-sauce",
            "sushi-platter" => "sushi-platter",
            "sake" => "sake-flask",
            "soy" => "shoyu-dish",
            _ => null
        };

        private static void FitModel(GameObject visual, Vector3 target)
        {
            var renderers = visual.GetComponentsInChildren<Renderer>();
            if (renderers.Length == 0) return;
            var bounds = renderers[0].bounds;
            for (var i = 1; i < renderers.Length; i++) bounds.Encapsulate(renderers[i].bounds);
            var scale = new Vector3(
                target.x / Mathf.Max(.0001f, bounds.size.x),
                target.y / Mathf.Max(.0001f, bounds.size.y),
                target.z / Mathf.Max(.0001f, bounds.size.z));
            visual.transform.localScale = Vector3.Scale(visual.transform.localScale, scale);
            renderers = visual.GetComponentsInChildren<Renderer>();
            bounds = renderers[0].bounds;
            for (var i = 1; i < renderers.Length; i++) bounds.Encapsulate(renderers[i].bounds);
            var center = visual.transform.parent.InverseTransformPoint(bounds.center);
            visual.transform.localPosition -= center;
        }

        private static void TintFoliage(GameObject root, Color color)
        {
            foreach (var renderer in root.GetComponentsInChildren<Renderer>())
            {
                var materials = renderer.materials;
                for (var i = 0; i < materials.Length; i++)
                {
                    var name = materials[i].name.ToLowerInvariant();
                    if (name.Contains("leaf") || name.Contains("foliage") || name.Contains("blossom") ||
                        name.Contains("canopy"))
                        materials[i].color = color;
                }
            }
        }

        private static void TintModel(GameObject root, Color color)
        {
            foreach (var renderer in root.GetComponentsInChildren<Renderer>())
            {
                var materials = renderer.materials;
                for (var i = 0; i < materials.Length; i++)
                {
                    materials[i].color = color;
                    if (materials[i].HasProperty("metallicFactor")) materials[i].SetFloat("metallicFactor", 0f);
                    if (materials[i].HasProperty("roughnessFactor")) materials[i].SetFloat("roughnessFactor", .92f);
                    if (materials[i].HasProperty("_Metallic")) materials[i].SetFloat("_Metallic", 0f);
                    if (materials[i].HasProperty("_Smoothness")) materials[i].SetFloat("_Smoothness", .18f);
                    if (materials[i].HasProperty("_Glossiness")) materials[i].SetFloat("_Glossiness", .18f);
                }
            }
        }

        private GameObject AddStaticModel(string modelId, Vector3 center, Vector3 size, Transform parent,
            Quaternion? rotation = null)
        {
            var prefab = sourced?.Get(modelId);
            if (!prefab) return null;
            var root = new GameObject("Model " + modelId);
            root.transform.SetParent(parent ? parent : architecture, false);
            root.transform.localPosition = center;
            if (rotation.HasValue) root.transform.localRotation = rotation.Value;
            var visual = Instantiate(prefab, root.transform, false);
            FitModel(visual, size);
            return root;
        }

        private bool AddModelProp(string id, string modelId, Vector3 center, Vector3 size, Quaternion? rotation = null)
        {
            var prefab = sourced?.Get(modelId);
            if (!prefab) return false;
            var root = new GameObject("Sourced " + id, typeof(BoxCollider), typeof(Rigidbody));
            root.transform.SetParent(tableProps, false);
            root.transform.localPosition = center;
            if (rotation.HasValue) root.transform.localRotation = rotation.Value;
            var visual = Instantiate(prefab, root.transform, false);
            FitModel(visual, size);
            var body = root.GetComponent<Rigidbody>();
            body.mass = .20f;
            body.linearDamping = .22f;
            body.angularDamping = .42f;
            body.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
            body.interpolation = RigidbodyInterpolation.Interpolate;
            root.GetComponent<BoxCollider>().size = size;
            props.Add(id, new DateProp { id = id, body = body, size = size, start = root.transform.position });
            BreakableProp.Attach(root, id);
            return true;
        }
        private static readonly Vector3 PicnicPlayerSeat = new(0, .12f, 2.70f);
        private static readonly Vector3 PicnicDateSeat = new(0, .02f, -.60f);

        private static Vector3 PicnicProp(string id) => id switch
        {
            "cup" => new Vector3(.28f, .055f, -.05f),
            "plate" => new Vector3(-.10f, .045f, -.22f),
            "menu" => new Vector3(-.38f, .055f, .16f),
            _ => new Vector3(0f, .055f, -.16f)
        };

        private Texture2D PicnicChecker()
        {
            const int size = 128, cells = 7;
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false) { name = "Picnic blanket checks" };
            var dark = new Color32(43, 70, 62, 255);
            var cream = new Color32(214, 176, 122, 255);
            var rose = new Color32(137, 58, 66, 255);
            var pixels = new Color32[size * size];
            for (var y = 0; y < size; y++)
                for (var x = 0; x < size; x++)
                {
                    var ix = x * cells / size;
                    var iy = y * cells / size;
                    pixels[y * size + x] = (ix + iy) % 2 == 0 ? dark : (iy % 2 == 0 ? cream : rose);
                }
            texture.SetPixels32(pixels);
            texture.wrapMode = TextureWrapMode.Repeat;
            texture.filterMode = FilterMode.Bilinear;
            texture.Apply();
            return texture;
        }

        private void BuildPicnicRoom(BedroomProp[] existing)
        {
            wood = Make(new Color(.48f, .34f, .23f), art.Walnut);
            brass = Make(new Color(.70f, .48f, .24f));
            alloy = Make(new Color(.20f, .18f, .18f));
            vessel = Make(new Color(.94f, .87f, .74f));
            paper = Make(new Color(.88f, .68f, .48f));
            seat = Make(new Color(.63f, .31f, .42f));
            seatTop = .12f;
            var grass = Make(new Color(.57f, .73f, .41f));
            var leaves = new[] { Make(new Color(.31f, .48f, .28f)), Make(new Color(.39f, .56f, .32f)),
                Make(new Color(.45f, .60f, .34f)) };
            var blossom = new[] { Make(new Color(.80f, .43f, .55f)), Make(new Color(.88f, .55f, .64f)),
                Make(new Color(.72f, .35f, .48f)) };
            var trunk = Make(new Color(.42f, .27f, .20f));
            var path = Make(new Color(.80f, .69f, .51f));
            var blanket = Make(Color.white, PicnicChecker());
            blanket.mainTextureScale = new Vector2(1.3f, 1.3f);
            var cushion = Make(new Color(.60f, .30f, .43f));

            picnicSky = new Material(Shader.Find("Skybox/Procedural"));
            picnicSky.SetFloat("_SunDisk", 0f);
            picnicSky.SetFloat("_SunSize", .04f);
            picnicSky.SetFloat("_SunSizeConvergence", 4f);
            picnicSky.SetFloat("_AtmosphereThickness", .62f);
            picnicSky.SetColor("_SkyTint", SkyPalette.DayZenith);
            picnicSky.SetColor("_GroundColor", SkyPalette.DayGround);
            picnicSky.SetFloat("_Exposure", 1.22f);
            RenderSettings.fogColor = SkyPalette.DayHorizon;
            RenderSettings.fog = false;
            eye.clearFlags = CameraClearFlags.Skybox;
            RenderSettings.skybox = picnicSky;
            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(.55f, .58f, .54f);

            Box("Park lawn", new(44, .12f, 44), new(0, -.06f, 0), grass, architecture, solid: true);
            Box("Park path", new(26, .035f, 1.30f), new(0, .006f, -3.15f), path);
            Box("Cross path", new(1.45f, .035f, 9), new(4.55f, .006f, -6.2f), path);
            for (var i = 0; i < 13; i++)
            {
                var x = -8.8f + i * 1.48f;
                Shape(PrimitiveType.Sphere, "Grass tuft", new(.34f, .18f, .28f),
                    new Vector3(x, .09f, -5.1f - (i % 3) * .44f), leaves[i % 3]);
            }
            var sunGlow = Unlit(new Color(1f, .93f, .70f));
            Shape(PrimitiveType.Sphere, "Picnic sun glow", new(4.2f, 4.2f, 4.2f),
                new Vector3(-1.8f, 7.2f, -28f), sunGlow);
            Shape(PrimitiveType.Sphere, "Picnic sun", new(2.1f, 2.1f, 2.1f),
                new Vector3(-1.8f, 7.2f, -28f), Unlit(new Color(1f, .97f, .80f)));
            var cloud = Unlit(SkyPalette.DayCloud);
            foreach (var (cx, cy, cz, sx, sz) in new[] { (7.5f, 6.4f, -24f, 5.2f, 2.6f),
                         (-2.5f, 7.4f, -27f, 6.6f, 3.1f), (-9.5f, 5.6f, -21f, 3.8f, 2.0f) })
            {
                Shape(PrimitiveType.Sphere, "Cloud", new(sx, 1.05f, sz), new Vector3(cx, cy, cz), cloud);
                Shape(PrimitiveType.Sphere, "Cloud puff", new(sx * .58f, .9f, sz * .66f),
                    new Vector3(cx + sx * .34f, cy + .38f, cz), cloud);
                Shape(PrimitiveType.Sphere, "Cloud puff", new(sx * .46f, .8f, sz * .56f),
                    new Vector3(cx - sx * .36f, cy + .26f, cz), cloud);
            }
            foreach (var (x, z, scale, pink) in new[]
                     {
                         (6.90f, -4.60f, 1.00f, false), (-6.60f, -4.90f, 1.00f, true),
                         (4.90f, -8.90f, .90f, false), (-5.00f, -10.20f, .88f, true),
                         (-1.70f, -11.40f, .96f, false), (1.60f, -12.20f, .86f, true),
                         (8.60f, -8.60f, .82f, false), (-9.20f, -8.80f, .82f, true),
                         (7.20f, 1.60f, .80f, false), (-7.30f, 1.20f, .80f, true),
                         (4.80f, 5.10f, .86f, true), (-4.90f, 5.40f, .82f, false),
                         (0.40f, 7.20f, .78f, false), (8.00f, 4.40f, .72f, false)
                     })
            {
                var model = AddStaticModel(pink ? "pink-flowering-tree" : "green-canopy-tree",
                    new Vector3(x, 2.35f * scale, z), new Vector3(4.1f * scale, 4.7f * scale, 3.2f * scale), architecture);
                if (model) { if (pink) TintFoliage(model, new Color(1f, .56f, .70f)); continue; }
                Cylinder("Tree trunk", new(.30f * scale, 2.5f * scale, .30f * scale),
                    new(x, 1.25f * scale, z), trunk);
                var palette = pink ? blossom : leaves;
                for (var i = 0; i < 5; i++)
                {
                    var dx = new[] { 0f, -.70f, .68f, .11f, -.24f }[i] * scale;
                    var dy = new[] { 3.25f, 2.85f, 3.0f, 3.05f, 2.7f }[i] * scale;
                    var dz = new[] { 0f, -.18f, .15f, -.68f, .58f }[i] * scale;
                    Shape(PrimitiveType.Sphere, "Tree canopy", new(1.28f * scale, .94f * scale, 1.16f * scale),
                        new Vector3(x + dx, dy, z + dz), palette[i % 3]);
                }
            }
            foreach (var (x, z, scale, pink) in new[]
                     {
                         (-9.8f, -13.5f, .72f, true), (-5.4f, -15.5f, .66f, false),
                         (-1.8f, -16.5f, .70f, false), (2.4f, -15.8f, .68f, true),
                         (6.2f, -14.2f, .72f, false), (10.4f, -13.0f, .62f, true)
                     })
            {
                var distant = AddStaticModel(pink ? "pink-flowering-tree" : "green-canopy-tree",
                    new Vector3(x, 1.7f * scale, z), new Vector3(4.1f * scale, 4.7f * scale, 3.2f * scale), architecture);
                if (distant && pink) TintFoliage(distant, new Color(1f, .56f, .70f));
            }
            foreach (var (bx, bz, bs) in new[] { (-10.8f, -12f, 1.5f), (-7.4f, -13.5f, 1.1f),
                         (-3.2f, -14.4f, 1.3f), (1.4f, -14.6f, 1.05f), (5.0f, -13.8f, 1.3f),
                         (8.8f, -12.6f, 1.2f), (11.6f, -11.2f, 1.0f), (-12.5f, -10.8f, 1.1f) })
            {
                AddStaticModel("bush", new Vector3(bx, .62f * bs, bz), new(1.9f * bs, 1.25f * bs, 1.7f * bs), architecture);
            }
            foreach (var (x, z, yaw) in new[] { (3.25f, -5.30f, 8f), (-4.10f, -6.10f, -14f) })
            {
                var bench = AddStaticModel("park-bench", new Vector3(x, .42f, z),
                    new(1.65f, 1.0f, .72f), architecture, Quaternion.Euler(0, yaw, 0));
                if (bench) continue;
                Box("Park bench seat", new(1.65f, .075f, .52f), new(x, .43f, z), wood, architecture, solid: true);
                Box("Park bench back", new(1.65f, .34f, .08f), new(x, .66f, z - .2f), wood);
                foreach (var dx in new[] { -.58f, 0, .58f })
                    Box("Park bench leg", new(.07f, .40f, .08f), new(x + dx, .2f, z), wood);
            }
            foreach (var (fx, fz, fs) in new[] { (2.95f, -2.95f, 1.05f), (-2.55f, -3.05f, .9f),
                         (4.85f, -4.25f, 1.15f), (-4.65f, -4.05f, 1.0f), (-6.10f, -5.35f, .85f) })
            {
                if (!AddStaticModel("flower-patch", new Vector3(fx, .3f * fs, fz),
                        new(1.15f * fs, .62f * fs, 1.15f * fs), architecture)) continue;
                AddStaticModel("mushrooms", new Vector3(fx + .75f, .12f, fz + .55f),
                    new(.5f, .26f, .5f), architecture);
            }
            for (var i = 0; i < 12; i++)
            {
                var angle = i * Mathf.PI * 2 / 12;
                var radius = 2.05f + (i % 3) * .18f;
                var fx = Mathf.Cos(angle) * radius;
                var fz = .3f + Mathf.Sin(angle) * radius;
                var petal = i % 4 == 0 ? Make(new Color(.93f, .92f, .82f)) : blossom[i % 2];
                if (i % 5 == 0) petal = Make(new Color(.98f, .86f, .32f));
                Cylinder("Daisy stem", new(.010f, .075f, .010f), new(fx, .045f, fz), leaves[1]);
                Shape(PrimitiveType.Sphere, "Daisy petals", new(.055f, .022f, .055f), new(fx, .09f, fz), petal);
                Shape(PrimitiveType.Sphere, "Daisy heart", new(.025f, .025f, .025f), new(fx, .1f, fz),
                    Make(new Color(.97f, .75f, .28f)));
            }
            var kioskBody = Make(new Color(.93f, .80f, .60f));
            var kioskCream = Make(new Color(.90f, .77f, .56f));
            var kioskRose = Make(new Color(.74f, .35f, .43f));
            if (AddStaticModel("market-stand", new Vector3(-5.60f, 1.10f, -7.30f),
                    new(2.8f, 2.2f, 1.6f), architecture, Quaternion.Euler(0, 180f, 0)))
            {
                Box("Kiosk service counter", new(2.35f, .92f, .42f), new(-5.60f, .46f, -6.55f),
                    kioskBody, architecture);
                Box("Kiosk counter top", new(2.45f, .09f, .5f), new(-5.60f, .96f, -6.55f),
                    kioskCream, architecture);
                for (var i = 0; i < 3; i++)
                    AddStaticModel("bar-bottle", new Vector3(-6.35f + i * .75f, 1.14f, -6.55f),
                        new(.07f, .26f, .07f), architecture);
            }
            else
            {
                var counter = new Vector3(-5.60f, 0f, -7.30f);
                Box("Kiosk body", new(2.45f, 1.18f, 1.10f), counter + Vector3.up * .59f, kioskBody, architecture);
                Box("Kiosk counter", new(2.65f, .12f, 1.28f), counter + Vector3.up * 1.20f, kioskCream, architecture);
                Box("Kiosk back panel", new(2.30f, .95f, .12f), counter + new Vector3(0, 1.98f, .42f), kioskCream, architecture);
                Box("Kiosk opening", new(1.95f, .72f, .04f), counter + new Vector3(0, 1.72f, .50f), Make(new Color(.20f, .14f, .12f)), architecture);
                for (var i = 0; i < 11; i++)
                {
                    var stripe = Box("Kiosk awning stripe", new(.235f, .06f, 1.02f),
                        counter + new Vector3(-1.29f + i * .258f, 2.42f, 1.02f),
                        i % 2 == 0 ? kioskRose : kioskCream, architecture);
                    stripe.transform.localRotation = Quaternion.Euler(14f, 0, 0);
                }
                foreach (var x in new[] { -1.16f, 1.16f })
                    Box("Kiosk awning post", new(.07f, 1.35f, .07f), counter + new Vector3(x, 1.80f, .58f),
                        kioskCream, architecture);
                Box("Kiosk sign trim", new(1.16f, .46f, .04f), counter + new Vector3(0, 2.28f, .53f),
                    kioskCream, architecture);
                Box("Kiosk sign", new(1.04f, .34f, .03f), counter + new Vector3(0, 2.28f, .56f),
                    Make(new Color(.30f, .22f, .20f)), architecture);
                Box("Kiosk serving counter", new(2.5f, .11f, .34f), counter + new Vector3(0, 1.14f, .72f),
                    kioskCream, architecture);
                for (var i = 0; i < 3; i++)
                {
                    Cylinder("Kiosk bottle", new(.10f, .28f, .10f),
                        counter + new Vector3(-.7f + i * .7f, 1.34f, .76f),
                        i == 1 ? kioskRose : Make(new Color(.42f, .62f, .38f)), architecture);
                    Cylinder("Kiosk bottle cap", new(.05f, .04f, .05f),
                        counter + new Vector3(-.7f + i * .7f, 1.5f, .76f), kioskCream, architecture);
                }
            }
            if (!AddStaticModel("street-lamp", new Vector3(3.05f, 1.44f, -4.90f), new(.5f, 2.9f, .5f), architecture))
            {
                Cylinder("Lamp post", new(.09f, 2.8f, .09f), new(3.05f, 1.4f, -4.90f), alloy);
                Cylinder("Lamp head", new(.34f, .42f, .34f), new(3.05f, 2.62f, -4.90f), kioskCream);
                Box("Lamp glow", new(.22f, .27f, .22f), new(3.05f, 2.60f, -4.90f), Make(new Color(.98f,.76f,.38f)));
            }
            AddStaticModel("trash-bin", new Vector3(1.55f, .45f, -4.35f), new(.48f, .9f, .48f), architecture);
            AddStaticModel("bike-rack", new Vector3(-2.35f, .52f, -4.55f), new(1.7f, 1.0f, .8f), architecture);
            AddStaticModel("park-sign", new Vector3(-4.55f, .78f, -4.10f), new(.9f, 1.55f, .12f), architecture,
                Quaternion.Euler(0, 16f, 0));
            AddStaticModel("tree-planter", new Vector3(.2f, .35f, 3.75f), new(1.1f, .7f, 1.1f), architecture);
            AddStaticModel("hedge", new Vector3(2.6f, .50f, 3.9f), new(2.2f, 1.0f, .65f), architecture,
                Quaternion.Euler(0, 90f, 0));
            AddStaticModel("bush", new Vector3(-2.7f, .58f, 4.2f), new(1.5f, 1.15f, 1.25f), architecture);
            AddStaticModel("park-bench", new Vector3(1.0f, .42f, 5.1f), new(1.65f, 1.0f, .72f), architecture,
                Quaternion.Euler(0, 180f, 0));
            AddStaticModel("park-bench", new Vector3(-3.6f, .42f, 5.6f), new(1.65f, 1.0f, .72f), architecture,
                Quaternion.Euler(0, 180f, 0));
            for (var i = 0; i < 7; i++)
            {
                var gx = -4.2f + i * 1.35f;
                AddStaticModel("grass-clump", new Vector3(gx, .15f, 4.3f + (i % 2) * .55f),
                    new(.55f, .28f, .42f), architecture);
            }
            for (var i = 0; i < 9; i++)
            {
                var fx = -2.6f + i * .31f;
                Cylinder("Flower stem", new(.012f, .13f, .012f), new(fx, .07f, -2.35f), leaves[1]);
                Shape(PrimitiveType.Sphere, "Flower", new(.055f, .045f, .055f),
                    new(fx, .145f, -2.35f), i % 2 == 0 ? blossom[0] : blossom[1]);
            }
            for (var i = 0; i < 5; i++)
            {
                var mx = -3.2f + i * .34f;
                Cylinder("Mushroom stem", new(.025f, .08f, .025f), new(mx, .04f, -1.7f), kioskCream);
                Shape(PrimitiveType.Sphere, "Mushroom cap", new(.08f, .045f, .08f),
                    new(mx, .085f, -1.7f), kioskRose);
            }

            var blanketBox = Box("Picnic blanket", new(3.15f, .016f, 3.15f), new(0, .012f, .62f), blanket, furnishings, solid: true);
            if (AddStaticModel("picnic_blanket", new Vector3(0, .022f, .62f), new(3.15f, .03f, 3.15f), furnishings))
                blanketBox.GetComponent<Renderer>().enabled = false;
            Box("Player cushion", new(.62f, .10f, .55f), PicnicPlayerSeat + Vector3.down * .01f, cushion, furnishings, solid: true);
            Cylinder("Date cushion", new(.92f, .11f, .82f), PicnicDateSeat + Vector3.down * .035f, cushion, furnishings);

            playerSeat = PicnicPlayerSeat;
            foreach (var spec in layout.props)
            {
                var original = existing.FirstOrDefault(prop => prop.name == new Dictionary<string, string>
                {
                    ["cup"] = "Caneca de cerâmica", ["plate"] = "Prato de sobremesa",
                    ["menu"] = "Caderno de capa dura"
                }[spec.id]);
                AddProp(spec, original);
            }
            AddPicnicProps();

            var index = Array.IndexOf(new[] { "caio", "rafa", "bia", "luiza" }, story.Person.id);
            actors = new[] { index, 4, 5, 6, 7, 8 }.Select(Character).ToArray();
            actors[0].root.transform.localPosition = PicnicDateSeat;
            actors[0].root.transform.localRotation = Quaternion.Euler(0, 0, 0);
            PoseSeat(actors[0], 1);
            for (var i = 1; i < actors.Length; i++) actors[i].root.SetActive(false);

            entrance = new GameObject("Park entrance").transform;
            entrance.SetParent(architecture, false);
            entrance.localPosition = new Vector3(0, 0, 3.2f);
            restroom = new GameObject("Park restroom").transform;
            restroom.SetParent(architecture, false);
            restroom.localPosition = new Vector3(-4f, 0, 3.2f);
            tray = new GameObject("Picnic tray").transform;
            tray.SetParent(tableProps, false);
            tray.gameObject.SetActive(false);

            wrongOrder = Shape(PrimitiveType.Cylinder, "Unexpected pink dessert", new(.14f, .045f, .14f),
                new(.2f, .07f, -.18f), Make(new Color(.87f, .35f, .58f)));
            wrongOrder.SetActive(false);
            var water = Make(new Color(.36f, .62f, .71f));
            splash = Enumerable.Range(0, 7).Select(i =>
            {
                var position = new Vector3(-.28f + Mathf.Cos(i * 2.4f) * .12f, .04f,
                    .1f + Mathf.Sin(i * 2.4f) * .13f);
                var drop = Shape(PrimitiveType.Sphere, "Spilled water", new(.06f, .012f, .042f), position, water);
                drop.SetActive(false);
                return drop;
            }).ToArray();

            var key = new GameObject("Picnic sun", typeof(Light));
            key.transform.SetParent(lights, false);
            key.transform.rotation = Quaternion.Euler(48, -28, 0);
            var sun = key.GetComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = SkyPalette.DaySun;
            sun.intensity = 1.28f;
            sun.shadows = LightShadows.Soft;
            sun.shadowNormalBias = .28f;
            var fill = new GameObject("Picnic fill", typeof(Light));
            fill.transform.SetParent(lights, false);
            fill.transform.localPosition = new Vector3(0, 5f, 2f);
            var bounce = fill.GetComponent<Light>();
            bounce.type = LightType.Point;
            bounce.color = new Color(.65f, .78f, .72f);
            bounce.intensity = .45f;
            bounce.range = 14f;
        }

        private void AddPicnicProp(string id, Vector3 center, Vector3 size, Action<Transform> build,
            bool useModel = true)
        {
            var modelId = useModel ? ModelFor(id) : null;
            if (modelId != null && AddModelProp(id, modelId, center, size)) return;
            var root = new GameObject("Picnic " + id, typeof(BoxCollider), typeof(Rigidbody));
            root.transform.SetParent(tableProps, false);
            root.transform.localPosition = center;
            var body = root.GetComponent<Rigidbody>();
            body.mass = .20f;
            body.linearDamping = .22f;
            body.angularDamping = .42f;
            body.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
            body.interpolation = RigidbodyInterpolation.Interpolate;
            root.GetComponent<BoxCollider>().size = size;
            build(root.transform);
            props.Add(id, new DateProp { id = id, body = body, size = size, start = root.transform.position });
            BreakableProp.Attach(root, id);
        }

        private void AddPicnicProps()
        {
            var wicker = Make(new Color(.63f, .43f, .23f));
            var wickerDark = Make(new Color(.45f, .29f, .15f));
            var bread = Make(new Color(.86f, .68f, .42f));
            var lettuce = Make(new Color(.38f, .62f, .31f));
            var tomato = Make(new Color(.78f, .24f, .23f));
            var cheese = Make(new Color(.93f, .75f, .28f));
            var amber = Make(new Color(.86f, .48f, .16f));
            var label = Make(new Color(.89f, .84f, .64f));
            var bowl = Make(new Color(.92f, .87f, .76f));
            var grape = Make(new Color(.33f, .20f, .42f));
            var strawberry = Make(new Color(.78f, .18f, .25f));
            var plum = Make(new Color(.37f, .20f, .32f));
            var book = Make(new Color(.58f, .29f, .34f));

            AddPicnicProp("basket", new Vector3(.86f, .16f, -.02f), new(.56f, .34f, .40f), root =>
            {
                Box("Basket body", new(.58f, .24f, .38f), Vector3.zero, wicker, root);
                Box("Basket lid left", new(.27f, .025f, .38f), new(-.14f, .135f, 0), wickerDark, root);
                Box("Basket lid right", new(.27f, .025f, .38f), new(.14f, .135f, 0), wickerDark, root);
                for (var i = -2; i <= 2; i++)
                    Box("Basket weave", new(.012f, .21f, .39f), new(i * .105f, .0f, 0), wickerDark, root);
                Box("Basket handle top", new(.34f, .025f, .035f), new(0, .30f, 0), wicker, root);
                Box("Basket handle left", new(.025f, .16f, .035f), new(-.16f, .23f, 0), wicker, root);
                Box("Basket handle right", new(.025f, .16f, .035f), new(.16f, .23f, 0), wicker, root);
            });

            AddPicnicProp("sandwich", new Vector3(.02f, .11f, .20f), new(.42f, .19f, .30f), root =>
            {
                Cylinder("Sandwich plate", new(.40f, .018f, .34f), new(0, -.07f, 0), vessel, root);
                Box("Bread bottom", new(.34f, .035f, .22f), new(0, -.035f, 0), bread, root);
                Box("Cheese", new(.30f, .012f, .19f), new(.01f, -.012f, 0), cheese, root);
                Box("Tomato", new(.27f, .012f, .17f), new(-.01f, .002f, 0), tomato, root);
                Box("Lettuce", new(.31f, .014f, .20f), new(0, .016f, 0), lettuce, root);
                Box("Bread top", new(.34f, .040f, .22f), new(0, .043f, 0), bread, root);
            });

            AddPicnicProp("kombucha", new Vector3(-.62f, .19f, .02f), new(.15f, .38f, .15f), root =>
            {
                Cylinder("Kombucha glass", new(.105f, .30f, .105f), new(0, .02f, 0), amber, root);
                Cylinder("Kombucha neck", new(.048f, .06f, .048f), new(0, .19f, 0), amber, root);
                Cylinder("Kombucha cap", new(.055f, .022f, .055f), new(0, .232f, 0), label, root);
                Cylinder("Kombucha label", new(.108f, .09f, .108f), new(0, -.01f, 0), label, root);
            });

            AddPicnicProp("fruit-bowl", new Vector3(-.58f, .13f, -.30f), new(.40f, .22f, .40f), root =>
            {
                Cylinder("Fruit bowl", new(.34f, .12f, .34f), new(0, -.03f, 0), bowl, root);
                for (var i = 0; i < 8; i++)
                {
                    var angle = i * Mathf.PI * 2 / 8;
                    var at = new Vector3(Mathf.Cos(angle) * .105f, .045f + (i % 2) * .02f,
                        Mathf.Sin(angle) * .105f);
                    Shape(PrimitiveType.Sphere, "Grape", new(.07f, .07f, .07f), at, grape, root);
                }
                for (var i = 0; i < 3; i++)
                    Shape(PrimitiveType.Sphere, "Strawberry", new(.07f, .075f, .07f),
                        new(-.10f + i * .10f, .07f, -.02f), strawberry, root);
            });

            AddPicnicProp("book", new Vector3(.66f, .06f, -.46f), new(.30f, .05f, .22f), root =>
            {
                Box("Book cover", new(.26f, .04f, .20f), Vector3.zero, book, root);
                Box("Book pages", new(.24f, .025f, .18f), new(0, .005f, 0), vessel, root);
            });
        }

        private static Vector3 VenuePoint(float x, float y, float z) => new(x, y, -z);

        private void AddVenueProps(int venue)
        {
            var ceramic = Make(new Color(.93f, .88f, .77f));
            var cake = Make(new Color(.54f, .31f, .22f));
            var cream = Make(new Color(.93f, .82f, .62f));
            var cherry = Make(new Color(.78f, .16f, .22f));
            var coffee = Make(new Color(.19f, .10f, .07f));
            var tea = Make(new Color(.33f, .19f, .13f));
            var flame = Make(new Color(.96f, .67f, .22f));
            var green = Make(new Color(.31f, .49f, .29f));
            var glass = Make(new Color(.82f, .88f, .88f));
            var wine = Make(new Color(.46f, .10f, .15f));
            var beer = Make(new Color(.82f, .50f, .16f));
            var foam = Make(new Color(.98f, .94f, .82f));
            var snack = Make(new Color(.82f, .49f, .20f));
            var peanut = Make(new Color(.83f, .65f, .43f));
            var sauce = Make(new Color(.72f, .16f, .13f));
            var rice = Make(new Color(.96f, .93f, .84f));
            var salmon = Make(new Color(.91f, .49f, .34f));
            var nori = Make(new Color(.12f, .16f, .14f));
            var soy = Make(new Color(.19f, .10f, .07f));

            if (venue == 0 || venue == 2)
            {
                AddPicnicProp("cake", VenuePoint(-.14f, .845f, -.60f), new(.24f, .16f, .18f), root =>
                {
                    Cylinder("Cake plate", new(.30f, .014f, .30f), new(0, -.075f, 0), ceramic, root);
                    Box("Cake sponge", new(.20f, .09f, .15f), new(0, -.015f, 0), cake, root);
                    Box("Cake cream", new(.20f, .018f, .15f), new(0, .033f, 0), cream, root);
                    Shape(PrimitiveType.Sphere, "Cake cherry", new(.035f, .035f, .035f), new(0, .062f, 0), cherry, root);
                });
                AddPicnicProp("coffee", VenuePoint(.30f, .86f, -.56f), new(.16f, .16f, .16f), root =>
                {
                    Cylinder("Coffee cup", new(.12f, .14f, .12f), Vector3.zero, ceramic, root);
                    Cylinder("Coffee", new(.10f, .008f, .10f), new(0, .066f, 0), tea, root);
                    Box("Coffee handle", new(.035f, .08f, .025f), new(.075f, .0f, 0), ceramic, root);
                    Cylinder("Coffee saucer", new(.18f, .012f, .18f), new(0, -.073f, 0), ceramic, root);
                });
            }
            if (venue == 2)
            {
                AddPicnicProp("candle", VenuePoint(.40f, .86f, -.34f), new(.10f, .18f, .10f), root =>
                {
                    Cylinder("Candle", new(.065f, .16f, .065f), Vector3.zero, cream, root);
                    Shape(PrimitiveType.Sphere, "Candle flame", new(.022f, .05f, .022f), new(0, .11f, 0), flame, root);
                });

            }
            if (venue == 3)
            {
                AddPicnicProp("beer", VenuePoint(-.24f, .86f, -.52f), new(.17f, .25f, .17f), root =>
                {
                    Cylinder("Beer mug", new(.13f, .22f, .13f), Vector3.zero, beer, root);
                    Cylinder("Beer rim", new(.135f, .02f, .135f), new(0, .105f, 0), foam, root);
                    Shape(PrimitiveType.Sphere, "Beer foam", new(.13f, .05f, .13f), new(0, .12f, 0), foam, root);
                    Box("Beer handle", new(.035f, .15f, .035f), new(.09f, .0f, 0), beer, root);
                }, false);
                AddPicnicProp("petiscos", VenuePoint(.38f, .85f, -.52f), new(.30f, .06f, .30f), root =>
                {
                    Cylinder("Snack plate", new(.30f, .035f, .30f), new(0, -.02f, 0), ceramic, root);
                    for (var i = 0; i < 7; i++)
                    {
                        var a = i * Mathf.PI * 2 / 7;
                        Shape(PrimitiveType.Sphere, "Snack", new(.065f, .05f, .065f),
                            new(Mathf.Cos(a) * .09f, .025f, Mathf.Sin(a) * .09f), snack, root);
                    }
                }, false);
                AddPicnicProp("peanuts", VenuePoint(-.28f, .84f, -.66f), new(.27f, .11f, .27f), root =>
                {
                    Cylinder("Peanut bowl", new(.26f, .10f, .26f), Vector3.zero, ceramic, root);
                    for (var i = 0; i < 8; i++)
                    {
                        var a = i * Mathf.PI * 2 / 8;
                        Shape(PrimitiveType.Sphere, "Peanut", new(.045f, .032f, .045f),
                            new(Mathf.Cos(a) * .075f, .04f, Mathf.Sin(a) * .075f), peanut, root);
                    }
                }, false);
                AddPicnicProp("hot-sauce", VenuePoint(.40f, .87f, -.62f), new(.09f, .21f, .09f), root =>
                {
                    Cylinder("Sauce bottle", new(.07f, .18f, .07f), Vector3.zero, sauce, root);
                    Cylinder("Sauce cap", new(.042f, .032f, .042f), new(0, .105f, 0), ceramic, root);
                }, false);
            }
            if (venue == 1)
            {
                AddPicnicProp("sushi-platter", VenuePoint(-.12f, .845f, -.52f), new(.40f, .10f, .26f), root =>
                {
                    Box("Sushi board", new(.42f, .045f, .28f), new(0, -.055f, 0), cake, root);
                    for (var i = 0; i < 3; i++)
                    {
                        var x = -.13f + i * .13f;
                        Cylinder("Nigiri rice", new(.09f, .04f, .09f), new(x, .0f, -.02f), rice, root);
                        Box("Nigiri salmon", new(.10f, .02f, .075f), new(x, .036f, -.02f), salmon, root);
                        Cylinder("Maki", new(.07f, .055f, .07f), new(x, .0f, .08f), nori, root);
                        Cylinder("Maki rice", new(.055f, .057f, .055f), new(x, .003f, .08f), rice, root);
                    }
                });
                AddPicnicProp("sake", VenuePoint(.40f, .87f, -.58f), new(.10f, .28f, .10f), root =>
                {
                    Cylinder("Sake bottle", new(.075f, .22f, .075f), Vector3.zero, ceramic, root);
                    Cylinder("Sake neck", new(.035f, .06f, .035f), new(0, .14f, 0), ceramic, root);
                    Cylinder("Sake cup", new(.065f, .05f, .065f), new(.13f, -.08f, 0), ceramic, root);
                });
                AddPicnicProp("soy", VenuePoint(-.48f, .845f, -.30f), new(.18f, .05f, .18f), root =>
                {
                    Cylinder("Soy dish", new(.17f, .035f, .17f), Vector3.zero, ceramic, root);
                    Cylinder("Soy sauce", new(.13f, .006f, .13f), new(0, .019f, 0), soy, root);
                });
            }
        }

        private void UpdatePicnicWorld()
        {
            var t = story.Time;
            var state = story.State.phase;
            actors[0].root.SetActive(state != "waiting");
            for (var i = 1; i <= 3; i++)
            {
                actors[i].root.SetActive(true);
                var dir = i % 2 == 0 ? 1f : -1f;
                var progress = Mathf.Repeat(t * .014f + i * .27f, 1f);
                var route = new[] { new Point { position = new[] { -8f, 0f, 3.15f } },
                    new Point { position = new[] { 8f, 0f, 3.15f } } };
                Walk(actors[i], route, progress, true, 0, dir > 0 ? 90 : 270, dir < 0);
            }
            if (state != "waiting")
                Walk(actors[0], new[] { new Point { position = new[] { 0f, PicnicDateSeat.y, -PicnicDateSeat.z } } },
                    0, false, 1, 0);
            actors[4].root.SetActive(true);
            Walk(actors[4], Single(4.15f, -5.25f), 0, false, 0, 250f);
            actors[5].root.SetActive(true);
            Walk(actors[5], Single(-5.60f, -7.90f), 0, false, 0, 0f);
            if (story.Caption != lastCaption) { lastCaption = story.Caption; gestureTime = t; }
            if (t - gestureTime < 1.25f && actors[0].head)
            {
                var wave = Mathf.Sin((t - gestureTime) * 12) * (1 - (t - gestureTime) / 1.25f);
                actors[0].head.Rotate(wave * (story.Gesture == "nod" ? 12 : 4), 0, wave * 7);
                if (story.Gesture == "wave" && actors[0].arms[1]) actors[0].arms[1].Rotate(0, 0, -40 + wave * 16);
            }
            var water = story.Beat?.id == "water_spill";
            wrongOrder.SetActive(story.Beat?.id == "wrong_order" &&
                story.BeatPhase is "animate" or "choice_window" or "resolve");
            foreach (var drop in splash)
                drop.SetActive(water && story.BeatPhase is "choice_window" or "resolve");
            if (story.BeatPhase == "animate" && lastBeat != story.Beat.id)
            {
                lastBeat = story.Beat.id;
                Play(sound, PicnicDateSeat, .16f);
                if (props.TryGetValue(story.BeatVisual.prop ?? "", out var prop) && !prop.held)
                {
                    prop.Reset();
                    if (lastBeat == "dropped_menu") prop.body.linearVelocity = new Vector3(0, .17f, -1.3f);
                }
            }
            if (t >= 1 && worldTime < 1) Play(chime, PicnicDateSeat, .22f);
            worldTime = t;
        }
    }
}
