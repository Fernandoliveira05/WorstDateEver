using Oculus.Interaction;
using UnityEngine;
using UnityEngine.Events;

namespace WorstDateEver
{
    [DefaultExecutionOrder(100)]
    public sealed class BedroomPull : MonoBehaviour
    {
        public Transform Anchor;
        public Vector3 Axis = Vector3.down;
        public Vector3 LeverAxis;
        public float LeverAngle;
        public float Travel = .12f;
        public bool RetainPosition;
        public LineRenderer Cord;
        public Rigidbody SlidingBox;
        [Min(.05f)] public float DrawerSpeed = .68f;
        [Range(.15f,.95f)] public float TriggerFraction = .68f;
        public float OpenFraction => displacement / Travel;
        public UnityEvent Pulled = new();

        private Grabbable grab;
        private float displacement, requestedSlide, slideVelocity;
        private bool fired;
        public bool DesktopHeld { get; set; }
        public bool IsHeld => DesktopHeld || (grab && grab.SelectingPointsCount > 0);
        public Vector3 GrabOffset { get; private set; }

        private void Awake() => grab = GetComponent<Grabbable>();

        private void FixedUpdate()
        {
            if (!SlidingBox) return;
            var axis = Anchor.TransformDirection(Axis);
            var current = Vector3.Dot(SlidingBox.position-Anchor.position,axis);
            var remaining = requestedSlide-current;
            const float acceleration = 2.15f;
            var dt = Time.fixedDeltaTime;
            var targetSpeed = Mathf.Sign(remaining)*Mathf.Min(DrawerSpeed,Mathf.Sqrt(2*acceleration*Mathf.Abs(remaining)));
            slideVelocity = Mathf.MoveTowards(slideVelocity,targetSpeed,acceleration*dt);
            var next = Mathf.Clamp(current+slideVelocity*dt,0,Travel);
            if ((requestedSlide-current)*(requestedSlide-next) <= 0 && Mathf.Abs(remaining) < DrawerSpeed*dt)
            {
                next = requestedSlide;
                slideVelocity = 0;
            }
            if (!Mathf.Approximately(current,next)) SlidingBox.MovePosition(Anchor.position+axis*next);
        }

        private void LateUpdate()
        {
            var axis = Anchor.TransformDirection(Axis);
            var held = IsHeld;
            GrabOffset = held ? transform.position - Anchor.position : Vector3.zero;
            if (SlidingBox)
            {
                if (held) requestedSlide = Mathf.Clamp(Vector3.Dot(GrabOffset, axis), 0, Travel);
                displacement = Mathf.Clamp(Vector3.Dot(SlidingBox.position - Anchor.position, axis), 0, Travel);
            }
            else if (held)
                displacement = Mathf.Clamp(Vector3.Dot(GrabOffset, axis), 0, Travel);
            else if (!RetainPosition)
                displacement = Mathf.MoveTowards(displacement, 0, Time.deltaTime * .65f);

            var rotation = Anchor.rotation;
            if (LeverAngle != 0f) rotation *= Quaternion.AngleAxis(LeverAngle * displacement / Travel, LeverAxis);
            var position = SlidingBox ? SlidingBox.transform.position : Anchor.position + axis * displacement;
            transform.SetPositionAndRotation(position, rotation);
            if (displacement < Travel * .25f) fired = false;
            if ((held || SlidingBox) && !fired && displacement >= Travel * TriggerFraction)
            {
                fired = true;
                Pulled.Invoke();
            }

            if (Cord) Cord.SetPosition(1, Cord.transform.InverseTransformPoint(transform.position));
        }
    }
}
