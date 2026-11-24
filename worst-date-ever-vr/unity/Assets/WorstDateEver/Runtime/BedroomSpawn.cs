using UnityEngine;
using UnityEngine.XR;

namespace WorstDateEver
{
    public sealed class BedroomSpawn : MonoBehaviour
    {
        public static readonly Vector3 Aisle=new(.04f,0,.66f);
        public OVRCameraRig Rig;
        public bool Aligned { get; private set; }
        private readonly Collider[] nearby=new Collider[24];

        private void LateUpdate()
        {
            if (Aligned||!Rig||!Rig.centerEyeAnchor) return;
            var input=InputDevices.GetDeviceAtXRNode(XRNode.Head);
            if (!input.TryGetFeatureValue(CommonUsages.isTracked,out var tracked)||!tracked) return;
            Align(Rig.centerEyeAnchor.position);
        }

        public void Align(Vector3 eyePosition)
        {
            Physics.SyncTransforms();
            var spawn=Aisle;
            foreach(var candidate in new[]{Aisle,new Vector3(-.41f,0,.55f),new Vector3(.09f,0,1.27f)})
            {
                var count=Physics.OverlapCapsuleNonAlloc(candidate+Vector3.up*.34f,candidate+Vector3.up*1.56f,
                    .21f,nearby,~0,QueryTriggerInteraction.Ignore);
                var blocked=false;
                for(var index=0;index<count;index++)
                    blocked|=!nearby[index].transform.IsChildOf(transform);
                if (blocked) continue;
                spawn=candidate;
                break;
            }
            transform.position+=Vector3.ProjectOnPlane(spawn-eyePosition,Vector3.up);
            Aligned=true;
        }
    }
}
