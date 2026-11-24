using UnityEngine;
using Oculus.Interaction;

namespace WorstDateEver
{
    [RequireComponent(typeof(Rigidbody))]
    public sealed class BedroomProp : MonoBehaviour
    {
        public int PreparationItem;
        public BedroomMaterialProfile Material;
        public BedroomSoftBody SoftBody;
        public bool DesktopHeld { get; set; }
        public bool IsHeld => DesktopHeld || (grab && grab.SelectingPointsCount > 0);
        private Grabbable grab;
        private Rigidbody body;
        private Collider[] grabShapes;
        private static readonly RaycastHit[] SolidSweep = new RaycastHit[64];
        private static readonly Collider[] Contacts = new Collider[64];
        private Vector3 startPosition;
        private Quaternion startRotation;
        private bool initiallyKinematic;

        public Rigidbody Body => body;

        private void Awake()
        {
            body = GetComponent<Rigidbody>();
            grab = GetComponent<Grabbable>();
            if (!GetComponent<BedroomPull>()) grabShapes = GetComponents<Collider>();

            startPosition = transform.position;
            startRotation = transform.rotation;
            initiallyKinematic = body.isKinematic;
        }

        private void Update()
        {
            if (SoftBody && SoftBody.Core != this) return;
            var position = transform.position;
            if (position.y < -.7f || Mathf.Abs(position.x) > 4 || Mathf.Abs(position.z) > 4)
                Recover();
        }

        public Vector3 LimitHeldTravel(Vector3 from,Quaternion orientation,Vector3 target)
        {
            var travel = target-from;
            var distance = travel.magnitude;
            if (distance < .0001f || grabShapes == null) return target;
            var direction = travel/distance;
            var permitted = distance;
            foreach (var collider in grabShapes)
            {
                if (!collider.enabled || collider.isTrigger) continue;
                var scale = transform.lossyScale;
                int count;
                if (collider is BoxCollider box)
                {
                    var center = from+orientation*Vector3.Scale(box.center,scale);
                    var extents = Vector3.Scale(box.size*.5f,scale);
                    count = Physics.BoxCastNonAlloc(center,extents,direction,SolidSweep,orientation,permitted,
                        ~0,QueryTriggerInteraction.Ignore);
                }
                else if (collider is SphereCollider sphere)
                {
                    var center = from+orientation*Vector3.Scale(sphere.center,scale);
                    var radius = sphere.radius*Mathf.Max(scale.x,scale.y,scale.z);
                    count = Physics.SphereCastNonAlloc(center,radius,direction,SolidSweep,permitted,
                        ~0,QueryTriggerInteraction.Ignore);
                }
                else continue;

                for (var i=0; i<count; i++)
                {
                    var hit = SolidSweep[i];
                    if (!CanBlock(collider,hit.collider) || Vector3.Dot(hit.normal,direction) > -.04f) continue;
                    permitted = Mathf.Min(permitted,Mathf.Max(0,hit.distance-.0015f));
                }
            }
            return from+direction*permitted;
        }

        private bool CanBlock(Collider shape,Collider obstacle)
        {
            if (!obstacle || obstacle.attachedRigidbody==body ||
                Physics.GetIgnoreLayerCollision(shape.gameObject.layer,obstacle.gameObject.layer) ||
                Physics.GetIgnoreCollision(shape,obstacle)) return false;
            return !SoftBody || !obstacle.attachedRigidbody ||
                obstacle.attachedRigidbody.GetComponent<BedroomProp>()?.SoftBody!=SoftBody;
        }

        public Pose LimitHeldPose(Pose from,Pose desired)
        {
            if (grabShapes==null) return desired;
            var position=LimitHeldTravel(from.position,from.rotation,desired.position);
            if (RotationClear(from,position,from.rotation))
            {
                var rotation=from.rotation;
                var steps=Mathf.Max(1,Mathf.CeilToInt(Quaternion.Angle(rotation,desired.rotation)/7f));
                for (var index=1;index<=steps;index++)
                {
                    var next=Quaternion.Slerp(from.rotation,desired.rotation,index/(float)steps);
                    if (!RotationClear(from,position,next)) break;
                    rotation=next;
                }
                return new Pose(position,rotation);
            }
            // Casts skip a shape that starts in contact. Check its proposed pose as a fallback.
            return from;
        }

        private bool RotationClear(Pose from,Vector3 position,Quaternion rotation)
        {
            var scale=transform.lossyScale;
            foreach (var shape in grabShapes)
            {
                if (!shape.enabled||shape.isTrigger) continue;
                int count;
                if (shape is BoxCollider box)
                {
                    var center=position+rotation*Vector3.Scale(box.center,scale);
                    count=Physics.OverlapBoxNonAlloc(center,Vector3.Scale(box.size*.5f,scale),Contacts,
                        rotation,~0,QueryTriggerInteraction.Ignore);
                }
                else if (shape is SphereCollider sphere)
                {
                    var center=position+rotation*Vector3.Scale(sphere.center,scale);
                    count=Physics.OverlapSphereNonAlloc(center,sphere.radius*Mathf.Max(scale.x,scale.y,scale.z),
                        Contacts,~0,QueryTriggerInteraction.Ignore);
                }
                else continue;
                for (var i=0;i<count;i++)
                {
                    var other=Contacts[i];
                    if (!CanBlock(shape,other)) continue;
                    var otherTransform=other.transform;
                    if (!Physics.ComputePenetration(shape,position,rotation,other,otherTransform.position,
                        otherTransform.rotation,out _,out var overlap)) continue;
                    var wasOverlapping=Physics.ComputePenetration(shape,from.position,from.rotation,other,
                        otherTransform.position,otherTransform.rotation,out _,out var prior);
                    if (overlap>(wasOverlapping?prior:0)+.00065f) return false;
                }
            }
            return true;
        }

        public void Recover()
        {
            if (!body) return;
            if (!body.isKinematic)
            {
                body.linearVelocity = Vector3.zero;
                body.angularVelocity = Vector3.zero;
            }
            body.isKinematic = initiallyKinematic;
            body.position = startPosition;
            body.rotation = startRotation;
            if (SoftBody && SoftBody.Core == this) SoftBody.ResetEnds();
        }
    }
}
