using System;
using System.Linq;
using UnityEngine;
using UnityEngine.UI;

namespace WorstDateEver
{
    public sealed partial class FirstDateVenue
    {
        private sealed class DateProp
        {
            public string id;
            public Rigidbody body;
            public Vector3 start;
            public Vector3 size;
            public bool held;

            public void Reset()
            {
                body.position = start;
                body.rotation = Quaternion.identity;
                body.linearVelocity = Vector3.zero;
                body.angularVelocity = Vector3.zero;
            }
        }

        private sealed class Hold
        {
            public DateProp prop;
            public Vector3 offset, target, speed;
            public Quaternion rotation, facing;
            public float depth;
        }

        private sealed class ActionButton
        {
            public GameObject root;
            public Text text;
            public Action action;
        }

        private readonly Hold[] hands = new Hold[3];
        internal Rigidbody HeldBody(int side) => hands[side]?.prop.body;
        private readonly LineRenderer[] rays = new LineRenderer[2];
        private ActionButton[] buttons;
        private Text headline, message;
        private string lastControls;

        private void AddProp(PropLayout spec, BedroomProp original)
        {
            if (!original) throw new InvalidOperationException("Missing bedroom prop for " + spec.id);
            var root = new GameObject("First-date " + spec.id, typeof(BoxCollider), typeof(Rigidbody));
            root.transform.SetParent(tableProps, false);
            var target = new Vector3(spec.size[0], spec.size[1], spec.size[2]);
            var geometry = new GameObject("Reused bedroom geometry").transform;
            geometry.SetParent(root.transform, false);
            var drawing = original.GetComponentsInChildren<MeshRenderer>(true).Where(renderer => spec.id == "menu" ? renderer.enabled :
                renderer.name == "Cerâmica inteira" || renderer.name == "Alça curva")
                .Select(renderer => (renderer, filter: renderer.GetComponent<MeshFilter>())).Where(pair => pair.filter && pair.filter.sharedMesh).ToArray();
            if (drawing.Length == 0) throw new InvalidOperationException("Missing prop mesh for " + spec.id);
            var bounds = new Bounds(Vector3.zero, Vector3.zero);
            bool first = true;
            foreach (var (renderer, filter) in drawing)
            {
                var part = new GameObject(renderer.name, typeof(MeshFilter), typeof(MeshRenderer));
                part.transform.SetParent(geometry, false);
                part.transform.localPosition = original.transform.InverseTransformPoint(renderer.transform.position);
                part.transform.localRotation = Quaternion.Inverse(original.transform.rotation) * renderer.transform.rotation;
                var scale = original.transform.lossyScale;
                var actual = renderer.transform.lossyScale;
                part.transform.localScale = new Vector3(actual.x / scale.x, actual.y / scale.y, actual.z / scale.z);
                part.GetComponent<MeshFilter>().sharedMesh = filter.sharedMesh;
                var meshRenderer = part.GetComponent<MeshRenderer>();
                meshRenderer.sharedMaterials = renderer.sharedMaterials;
                meshRenderer.receiveShadows = spec.id == "menu";
                var local = filter.sharedMesh.bounds;
                for (int i = 0; i < 8; i++)
                {
                    var corner = local.center + Vector3.Scale(local.extents,
                        new Vector3((i & 1) == 0 ? -1 : 1, (i & 2) == 0 ? -1 : 1, (i & 4) == 0 ? -1 : 1));
                    corner = part.transform.TransformPoint(corner);
                    if (first) { bounds = new Bounds(corner, Vector3.zero); first = false; }
                    else bounds.Encapsulate(corner);
                }
            }
            var factor = new Vector3(target.x / Mathf.Max(.001f, bounds.size.x),
                target.y / Mathf.Max(.001f, bounds.size.y), target.z / Mathf.Max(.001f, bounds.size.z));
            geometry.localPosition = -Vector3.Scale(bounds.center, factor);
            geometry.localScale = factor;
            root.GetComponent<BoxCollider>().size = target;
            var body = root.GetComponent<Rigidbody>();
            body.mass = spec.id == "plate" ? .34f : .24f;
            body.linearDamping = .24f;
            body.angularDamping = .42f;
            body.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
            body.interpolation = RigidbodyInterpolation.Interpolate;
            root.transform.localPosition = IsPicnic ? PicnicProp(spec.id) : PointAt(spec.position);
            props.Add(spec.id, new DateProp { id = spec.id, body = body, size = target, start = root.transform.position });
            BreakableProp.Attach(root, spec.id);
        }

        private Canvas Surface(string name, Vector3 position, float width, float height, Transform parent, int order = 0)
        {
            var root = new GameObject(name, typeof(RectTransform), typeof(Canvas));
            root.transform.SetParent(parent, false);
            root.transform.localPosition = position;
            root.transform.localScale = Vector3.one * .001f;
            var rect = root.GetComponent<RectTransform>();
            rect.sizeDelta = new Vector2(width * 1000, height * 1000);
            var canvas = root.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.WorldSpace;
            canvas.worldCamera = eye;
            canvas.sortingOrder = order;
            return canvas;
        }

        private static RectTransform Rect(string name, Transform parent, Vector2 position, Vector2 size)
        {
            var rect = new GameObject(name, typeof(RectTransform)).GetComponent<RectTransform>();
            rect.SetParent(parent, false);
            rect.anchoredPosition = position;
            rect.sizeDelta = size;
            return rect;
        }

        private static Text Label(Transform parent, Vector2 position, Vector2 size, int fontSize, Color color)
        {
            var text = Rect("Text", parent, position, size).gameObject.AddComponent<Text>();
            text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            text.fontSize = fontSize;
            text.resizeTextForBestFit = true;
            text.resizeTextMinSize = Mathf.Max(20, fontSize / 2);
            text.resizeTextMaxSize = fontSize;
            text.alignment = TextAnchor.MiddleCenter;
            text.color = color;
            text.raycastTarget = false;
            return text;
        }

        private void BuildControls()
        {
            var panel = Surface("Date conversation", new(.58f,1.18f,.53f), .94f, .92f, interfaceObjects);
            panel.transform.localPosition = IsPicnic ? new Vector3(1.22f, 1.40f, 1.38f) : new Vector3(1.10f, 1.05f, .85f);
            panel.transform.localRotation = Quaternion.Euler(IsPicnic ? 8 : 8, IsPicnic ? 205 : -22, 0);
            if (IsPicnic) panel.transform.localScale *= .66f;
            var cream = new Color(.97f,.90f,.79f);
            var dark = new Color(.21f,.12f,.19f);
            var baseColor = new Color(.21f,.14f,.19f,.98f);
            var caption = Rect("Caption backing", panel.transform, Vector2.zero, new(940,200)).gameObject.AddComponent<Image>();
            caption.color = baseColor;
            var title = Label(panel.transform, new(0,67), new(915,42), 34, new Color(.95f,.68f,.46f));
            title.text = IsPicnic ? "PIQUENIQUE · PARQUE" : story.Venue.id switch { "cafe" => "CAFÉ · FILTRO & PROSA",
                "sushi" => "SUSHI · KOI TORTO", "bistro" => "BISTRÔ · A MESA É NOSSA", _ => "BAR · ÚLTIMO PEDIDO" };
            headline = Label(panel.transform, new(0,-17), new(890,124), 48, cream);
            message = Label(panel.transform, new(0,-450), new(930,80), 38, cream);
            message.gameObject.AddComponent<Outline>().effectColor = Color.black;
            buttons = Enumerable.Range(0, 7).Select(index =>
            {
                var rect = Rect("Date choice " + index, panel.transform,
                    new Vector2(index % 2 == 0 ? -239 : 239, -148 - index / 2 * 81), new Vector2(451,74));
                var image = rect.gameObject.AddComponent<Image>();
                image.color = cream;
                rect.gameObject.SetActive(false);
                var text = Label(rect, Vector2.zero, new(430,68), 37, dark);
                return new ActionButton { root = rect.gameObject, text = text };
            }).ToArray();
            for (int i = 0; i < rays.Length; i++)
            {
                var source = new GameObject("Date interaction ray", typeof(LineRenderer));
                source.transform.SetParent(interfaceObjects, false);
                var line = source.GetComponent<LineRenderer>();
                line.sharedMaterial = Unlit(new Color(.97f,.72f,.77f));
                line.positionCount = 2;
                line.startWidth = .0035f;
                line.endWidth = .0012f;
                rays[i] = line;
            }
        }

        private Material Unlit(Color color)
        {
            var material = new Material(art.Unlit) { color = color };
            materials.Add(material);
            return material;
        }

        private Image BuildFade()
        {
            var canvas = Surface("Comfort fade", new(0,0,.19f), 2, 2, eye.transform, 999);
            var image = Rect("Fade mask", canvas.transform, Vector2.zero, new(2000,2000)).gameObject.AddComponent<Image>();
            image.raycastTarget = false;
            FadeAlpha(image, 0);
            return image;
        }

        private static void FadeAlpha(Image image, float alpha) =>
            image.color = new Color(.07f,.045f,.08f, Mathf.Clamp01(alpha));

        private void UpdateControls()
        {
            var choices = story.Options();
            var actions = choices.Select(choice =>
                (label: choice.label, action: (Action)(() => Choose(choice.id)))).ToList();
            if (story.State.phase == "completed")
                actions.Add(("Voltar ao quarto", () => { ReleaseAll(); voice.Cancel(); StartCoroutine(Cut(false)); }));
            if (story.State.phase == "dialogue" && voice.Available)
            {
                if (voice.Recording || choices.FirstOrDefault()?.id == "honest") actions.Add((voice.Recording ? "Parar e enviar" : "Falar (microfone)", voice.Toggle));
                if (voice.Consented) actions.Add(("Desativar microfone", voice.Cancel));
            }
            if (actions.Count < buttons.Length) actions.Add(("Centralizar assento", Recenter));
            var key = story.Caption + "|" + voice.Message + "|" + string.Join("|", actions.Select(action => action.label));
            if (key != lastControls)
            {
                lastControls = key;
                headline.text = story.Caption;
                message.text = voice.Message;
                for (int i = 0; i < buttons.Length; i++)
                {
                    buttons[i].root.SetActive(i < actions.Count);
                    buttons[i].action = i < actions.Count ? actions[i].action : null;
                    if (i < actions.Count) buttons[i].text.text = actions[i].label;
                }
            }
            foreach (var prop in props.Values)
                if (!prop.held && (prop.body.position.y < -.25f || Mathf.Abs(prop.body.position.x) > 6))
                    prop.Reset();
            if (rig) Controllers();
            else Desktop();
        }

        private void Choose(string id)
        {
            if (story.Choose(id)) voice.Interrupt();
        }

        private void Desktop()
        {
            var ray = eye.ScreenPointToRay(Input.mousePosition);
            if (Input.GetMouseButtonDown(0)) Press(2, ray, Quaternion.LookRotation(ray.direction), false, null);
            if (Input.GetMouseButtonDown(1)) Press(2, ray, Quaternion.LookRotation(ray.direction), true, null);
            if (Input.GetMouseButtonUp(0) || Input.GetMouseButtonUp(1)) Release(2);
            if (Input.GetKeyDown(KeyCode.R)) Recenter();
            if (Input.GetKeyDown(KeyCode.V)) voice.Begin();
            if (Input.GetKeyUp(KeyCode.V)) voice.Stop();
            Move(2, ray, Quaternion.LookRotation(ray.direction));
        }

        private void Controllers()
        {
            for (int i = 0; i < 2; i++)
            {
                var input = i == 0 ? OVRInput.Controller.LTouch : OVRInput.Controller.RTouch;
                var hand = i == 0 ? rig.leftControllerAnchor : rig.rightControllerAnchor;
                var connected = OVRInput.IsControllerConnected(input);
                rays[i].enabled = connected;
                if (!connected) { Release(i); continue; }
                var ray = new Ray(hand.position, hand.forward);
                rays[i].SetPosition(0, ray.origin + ray.direction * .04f);
                rays[i].SetPosition(1, ray.GetPoint(3));
                if (OVRInput.GetDown(OVRInput.Button.PrimaryIndexTrigger, input)) Press(i, ray, hand.rotation, false, null);
                if (OVRInput.GetDown(OVRInput.Button.PrimaryHandTrigger, input)) Press(i, ray, hand.rotation, true, hand.position);
                if (OVRInput.GetUp(OVRInput.Button.PrimaryIndexTrigger, input) ||
                    OVRInput.GetUp(OVRInput.Button.PrimaryHandTrigger, input)) Release(i);
                Move(i, ray, hand.rotation);
            }
            if (OVRInput.GetDown(OVRInput.RawButton.A, OVRInput.Controller.RTouch)) voice.Begin();
            if (OVRInput.GetUp(OVRInput.RawButton.A, OVRInput.Controller.RTouch)) voice.Stop();
        }

        private void Press(int id, Ray ray, Quaternion rotation, bool grab, Vector3? point)
        {
            if (hands[id] != null || cutting) return;
            var propHit = Physics.Raycast(ray, out var hit, 3.5f) ?
                props.Values.FirstOrDefault(prop => prop.body == hit.rigidbody && !prop.held) : null;
            var distance = propHit != null ? hit.distance : float.PositiveInfinity;
            var prop = point.HasValue ? props.Values.Where(item => !item.held &&
                Vector3.Distance(point.Value, item.body.position) < item.size.magnitude / 2 + .07f)
                .OrderBy(item => (item.body.position - point.Value).sqrMagnitude).FirstOrDefault() : null;
            if (prop != null) distance = 0;
            if (!grab && TryButton(ray, distance)) return;
            prop ??= propHit;
            if (prop == null) return;
            var next = distance == 0 ? point.Value : ray.GetPoint(distance);
            var relative = Quaternion.Inverse(rotation);
            hands[id] = new Hold { prop = prop, depth = distance, target = prop.body.position,
                offset = relative * (prop.body.position - next), rotation = relative * prop.body.rotation, facing = prop.body.rotation };
            prop.held = true;
            prop.body.linearVelocity = Vector3.zero;
            prop.body.angularVelocity = Vector3.zero;
            prop.body.collisionDetectionMode = CollisionDetectionMode.ContinuousSpeculative;
            prop.body.isKinematic = true;
            if (story.BeatPhase == "choice_window" && story.BeatVisual.prop == prop.id)
                Choose(story.BeatVisual.action);
        }

        private bool TryButton(Ray ray, float maximum)
        {
            foreach (var button in buttons)
            {
                if (button.action == null || !button.root.activeSelf) continue;
                var transform = button.root.transform;
                var plane = new Plane(transform.forward, transform.position);
                if (!plane.Raycast(ray, out var distance) || distance > Mathf.Min(maximum, 3.5f)) continue;
                var local = transform.InverseTransformPoint(ray.GetPoint(distance));
                if (!((RectTransform)transform).rect.Contains(new Vector2(local.x, local.y))) continue;
                button.action();
                return true;
            }
            return false;
        }

        private void Move(int id, Ray ray, Quaternion rotation)
        {
            if (hands[id] is not { } held) return;
            held.target = ray.GetPoint(held.depth) + rotation * held.offset;
            held.facing = rotation * held.rotation;
        }

        private void FixedUpdate()
        {
            foreach (var held in hands)
            {
                if (held == null) continue;
                var body = held.prop.body;
                var delta = held.target - body.position;
                if (delta.sqrMagnitude > .000001f && body.SweepTest(delta.normalized, out var hit, delta.magnitude))
                    delta = delta.normalized * Mathf.Max(0, hit.distance - .003f);
                held.speed = Vector3.ClampMagnitude(delta / Time.fixedDeltaTime, 5f);
                body.MovePosition(body.position + delta);
                body.MoveRotation(held.facing);
            }
        }

        private void Release(int i)
        {
            var held = hands[i];
            if (held == null) return;
            hands[i] = null;
            var body = held.prop.body;
            held.prop.held = false;
            body.isKinematic = false;
            body.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
            body.linearVelocity = held.speed;
        }

        private void ReleaseAll()
        {
            for (int i = 0; i < hands.Length; i++) Release(i);
        }

        private void OnApplicationPause(bool paused)
        {
            if (!paused) return;
            ReleaseAll();
            if (voice) voice.Cancel();
        }
    }
}
