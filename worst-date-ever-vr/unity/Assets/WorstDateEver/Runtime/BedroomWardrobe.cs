using UnityEngine;

namespace WorstDateEver
{
    /// <summary>Two-door wardrobe fitted from the CC0 Quaternius Closet model.</summary>
    public sealed class BedroomWardrobe : MonoBehaviour
    {
        public Vector3 TargetSize = new(1.22f, 2.02f, .62f);
        public Vector3 TargetPosition = new(-1.95f, 0f, 1.35f);
        public BedroomWardrobeDoor Left, Right;

        private void Awake() => Fit();

        private void Fit()
        {
            var bounds = Bounds();
            if (bounds.size.y < .001f) return;
            transform.localScale *= TargetSize.y / bounds.size.y;
            bounds = Bounds();
            transform.position += new Vector3(TargetPosition.x - bounds.center.x, -bounds.min.y,
                TargetPosition.z - bounds.center.z);
            transform.rotation = Quaternion.Euler(0, 90, 0);
            bounds = Bounds();
            transform.position += new Vector3(0, 0, 0);

            var left = Find("Closet_LeftDoor");
            var right = Find("Closet_RightDoor");
            if (left)
            {
                Left = left.gameObject.AddComponent<BedroomWardrobeDoor>();
                Left.Door = left;
                Left.Sign = 1f;
                Left.Limit = 96f;
            }
            if (right)
            {
                Right = right.gameObject.AddComponent<BedroomWardrobeDoor>();
                Right.Door = right;
                Right.Sign = -1f;
                Right.Limit = 96f;
            }
        }

        private Bounds Bounds()
        {
            var renderers = GetComponentsInChildren<Renderer>();
            if (renderers.Length == 0) return new Bounds();
            var bounds = renderers[0].bounds;
            for (var i = 1; i < renderers.Length; i++) bounds.Encapsulate(renderers[i].bounds);
            return bounds;
        }

        private Transform Find(string name)
        {
            foreach (var child in GetComponentsInChildren<Transform>())
                if (child.name == name) return child;
            return null;
        }
    }

    public sealed class BedroomWardrobeDoor : MonoBehaviour
    {
        public Transform Door;
        public float Sign = 1f;
        public float Limit = 96f;
        public float HandleHeight = 1.02f;
        public float HandleReach = .095f;

        private BedroomHandContacts hands;
        private float angle;
        private bool holding;
        private Quaternion rest;

        private void Start()
        {
            hands = new BedroomHandContacts();
            if (Door) rest = Door.localRotation;
        }

        private void LateUpdate()
        {
            if (!Door) return;
            var grabbed = false;
            var target = angle;
            for (var hand = 0; hand < 2; hand++)
            {
                if (!hands.TryGetPosition(hand, out var point)) continue;
                var local = Door.InverseTransformPoint(point);
                var handle = new Vector3(Sign * .46f, HandleHeight, .055f);
                if (Vector3.Distance(local, handle) > HandleReach && !holding) continue;
                var raw = Mathf.Atan2(local.z, Mathf.Max(.04f, Sign * local.x)) * Mathf.Rad2Deg;
                if (raw < -20f) continue;
                target = Mathf.Clamp(raw, 0f, Limit);
                grabbed = true;
                holding = true;
                break;
            }
            if (!grabbed && holding && !AnyNear())
            {
                holding = false;
            }
            if (grabbed)
                angle = Mathf.MoveTowards(angle, target, 150f * Time.deltaTime);

            Door.localRotation = rest * Quaternion.Euler(0, Sign * angle, 0);
        }

        private bool AnyNear()
        {
            for (var hand = 0; hand < 2; hand++)
            {
                if (!hands.TryGetPosition(hand, out var point)) continue;
                var local = Door.InverseTransformPoint(point);
                if (Vector3.Distance(local, new Vector3(Sign * .46f, HandleHeight, .055f)) < .26f)
                    return true;
            }
            return false;
        }
    }
}
