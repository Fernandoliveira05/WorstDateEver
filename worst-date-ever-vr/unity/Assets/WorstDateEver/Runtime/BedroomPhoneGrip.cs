using Oculus.Interaction;
using UnityEngine;

namespace WorstDateEver
{
    public sealed class BedroomPhoneGrip : MonoBehaviour, ITransformer
    {
        private IGrabbable source;
        private BedroomProp prop;
        private HandVisual hand;
        private Quaternion fallbackRotation;
        private Vector3 fallbackOffset;

        public void Initialize(IGrabbable grabbable)
        {
            source = grabbable;
            prop = grabbable.Transform.GetComponent<BedroomProp>();
        }

        public void BeginTransform()
        {
            if (source.GrabPoints.Count == 0) return;
            var point = source.GrabPoints[0];
            hand = FindFirstObjectByType<BedroomGripVisual>()?.FindPhoneHand(point.position);
            var eye = Camera.main;
            var forward = eye ? Vector3.ProjectOnPlane(eye.transform.forward, Vector3.up) : Vector3.forward;
            if (forward.sqrMagnitude < .001f) forward = Vector3.forward;
            fallbackRotation = Quaternion.Inverse(point.rotation) * Quaternion.LookRotation(forward, Vector3.up);
            fallbackOffset = Quaternion.Inverse(point.rotation) * Vector3.up * .045f;
        }

        public void UpdateTransform()
        {
            if (source.GrabPoints.Count == 0 || !prop) return;
            var point = source.GrabPoints[0];
            if (!BedroomGripVisual.TryPhonePose(hand, out var target))
                target = new Pose(point.position + point.rotation * fallbackOffset, point.rotation * fallbackRotation);
            var model = prop.transform;
            var limited = prop.LimitHeldPose(new Pose(model.position, model.rotation), target);
            model.SetPositionAndRotation(limited.position, limited.rotation);
        }

        public void EndTransform() => hand = null;
    }
}
