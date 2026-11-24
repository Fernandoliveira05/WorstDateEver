using UnityEngine;

namespace WorstDateEver
{
    internal sealed class BedroomHandContacts
    {
        private readonly OVRSkeleton[] skeletons =
            Object.FindObjectsByType<OVRSkeleton>(FindObjectsInactive.Include, FindObjectsSortMode.None);
        private readonly OVRCameraRig rig = Object.FindFirstObjectByType<OVRCameraRig>();

        public bool TryGetPosition(int hand, out Vector3 point)
        {
            foreach (var skeleton in skeletons)
            {
                if (!skeleton.isActiveAndEnabled || !skeleton.IsDataValid) continue;
                var type = skeleton.GetSkeletonType();
                if (type != OVRSkeleton.SkeletonType.HandLeft && type != OVRSkeleton.SkeletonType.HandRight &&
                    type != OVRSkeleton.SkeletonType.XRHandLeft && type != OVRSkeleton.SkeletonType.XRHandRight) continue;
                var left = type == OVRSkeleton.SkeletonType.HandLeft || type == OVRSkeleton.SkeletonType.XRHandLeft;
                if (left != (hand == 0) || skeleton.Bones == null) continue;
                foreach (var bone in skeleton.Bones)
                {
                    if (bone.Id != OVRSkeleton.BoneId.Hand_IndexTip && bone.Id != OVRSkeleton.BoneId.XRHand_IndexTip) continue;
                    point = bone.Transform.position;
                    return true;
                }
            }

            var controller = hand == 0 ? OVRInput.Controller.LTouch : OVRInput.Controller.RTouch;
            if (rig && OVRInput.IsControllerConnected(controller))
            {
                var anchor = hand == 0 ? rig.leftHandAnchor : rig.rightHandAnchor;
                point = anchor.position + anchor.forward * .085f;
                return true;
            }

            point = default;
            return false;
        }
    }
}
