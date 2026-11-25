using UnityEngine;
using UnityEngine.XR;

namespace WorstDateEver
{
    public sealed class DesktopBedroomControls : MonoBehaviour
    {
        private Camera eye;
        private BedroomProp held;
        private BedroomPull pull;
        private Plane dragPlane;
        private Vector3 dragOffset;
        private float previousMouseY, slideStart;
        private Vector3 previousPosition;
        private Vector3 releaseVelocity;
        private readonly RaycastHit[] walkHits=new RaycastHit[32];

        private void Awake() => eye = GetComponent<Camera>();

        private void Update()
        {
            if (XRSettings.isDeviceActive || !Application.isEditor) return;
            if (Input.GetMouseButton(2))
            {
                var angles = transform.eulerAngles;
                transform.rotation = Quaternion.Euler(
                    Mathf.Clamp(Mathf.DeltaAngle(0, angles.x) - Input.GetAxisRaw("Mouse Y") * 3, -80, 80),
                    angles.y + Input.GetAxisRaw("Mouse X") * 3, 0);
            }
            var motion = Vector3.ProjectOnPlane(transform.forward, Vector3.up).normalized * Input.GetAxisRaw("Vertical")
                + Vector3.ProjectOnPlane(transform.right, Vector3.up).normalized * Input.GetAxisRaw("Horizontal");
            var target = transform.position + Vector3.ClampMagnitude(motion, 1) * Time.deltaTime * 1.6f;
            target.x = Mathf.Clamp(target.x, -1.75f, 1.75f);
            target.z = Mathf.Clamp(target.z, -1.4f, 3.02f);
            var at=transform.position;
            at=Walk(at,new Vector3(target.x-at.x,0,0));
            transform.position=Walk(at,new Vector3(0,0,target.z-at.z));
            if (Input.GetKeyDown(KeyCode.N)) FindFirstObjectByType<BedroomController>().CycleWindowTime();
            if (Input.GetKeyDown(KeyCode.R)) FindFirstObjectByType<BedroomController>().RecoverPhone();
            if (Input.GetMouseButtonDown(0) && Physics.Raycast(eye.ScreenPointToRay(Input.mousePosition), out var touch, 3f))
            {
                touch.collider.GetComponentInParent<BedroomCurtain>()?.Touch(touch.point, .9f);
                touch.collider.GetComponentInParent<BedroomDoor>()?.PushAt(touch.point, eye.transform.forward * .018f);
            }
            if (Input.GetMouseButtonDown(1))
            {
                if (held) Release();
                else if (Physics.Raycast(eye.ScreenPointToRay(Input.mousePosition), out var hit, 3f) &&
                         hit.collider.GetComponentInParent<BedroomProp>() is { } prop)
                {
                    held = prop;
                    pull = prop.GetComponent<BedroomPull>();
                    if (pull)
                    {
                        dragPlane = new Plane(transform.forward, hit.point);
                        dragOffset = prop.Body.position - hit.point;
                        pull.DesktopHeld = true;
                        previousMouseY = Input.mousePosition.y;
                        slideStart = Vector3.Dot(prop.Body.position - pull.Anchor.position, pull.Anchor.TransformDirection(pull.Axis));
                    }
                    prop.DesktopHeld = true;
                    previousPosition = prop.Body.position;
                    prop.Body.isKinematic = true;
                    releaseVelocity = Vector3.zero;
                }
            }
            if (!held) return;
            if (pull)
            {
                var ray = eye.ScreenPointToRay(Input.mousePosition);
                if (dragPlane.Raycast(ray, out var distance))
                {
                    var movement = ray.GetPoint(distance) + dragOffset;
                    var axis = pull.Anchor.TransformDirection(pull.Axis);
                    if (Mathf.Abs(Vector3.Dot(axis, transform.forward)) > .65f)
                        movement = pull.Anchor.position + axis * ((Input.mousePosition.y - previousMouseY) * -.002f + slideStart);
                    if (pull.GetComponentInParent<BedroomDoor>())
                        movement += transform.forward * Input.mouseScrollDelta.y * .08f;
                    held.transform.position = movement;
                }
                return;
            }
            var targetPosition = transform.position+transform.forward*.67f+Vector3.down*.16f;
            var rotation=held.name.StartsWith("Telefone") ?
                Quaternion.LookRotation(transform.forward,Vector3.up) : held.Body.rotation;
            var pose=held.LimitHeldPose(new Pose(held.Body.position,held.Body.rotation),new Pose(targetPosition,rotation));
            var position=pose.position;
            releaseVelocity = Vector3.ClampMagnitude((position - previousPosition) / Mathf.Max(.01f, Time.deltaTime), 5f);
            held.Body.position = position;
            held.Body.rotation=pose.rotation;
            previousPosition = position;
            if (Input.GetKeyDown(KeyCode.Space)) Release(transform.forward * 2f);
        }

        private Vector3 Walk(Vector3 at,Vector3 step)
        {
            var distance=step.magnitude;
            if (distance<.0001f) return at;
            var direction=step/distance;
            var bottom=new Vector3(at.x,.31f,at.z);
            var top=new Vector3(at.x,at.y-.18f,at.z);
            var count=Physics.CapsuleCastNonAlloc(bottom,top,.165f,direction,walkHits,distance,~0,QueryTriggerInteraction.Ignore);
            for(var index=0;index<count;index++)
            {
                var hit=walkHits[index];
                if ((held&&hit.collider.attachedRigidbody==held.Body)||Vector3.Dot(hit.normal,direction)>-.045f) continue;
                distance=Mathf.Min(distance,Mathf.Max(0,hit.distance-.005f));
            }
            return at+direction*distance;
        }

        private void Release(Vector3 extra = default)
        {
            held.DesktopHeld = false;
            if (pull)
            {
                pull.DesktopHeld = false;
                pull = null;
                held = null;
                return;
            }
            held.Body.isKinematic = false;
            held.Body.linearVelocity = releaseVelocity + extra;
            held = null;
        }
    }
}
