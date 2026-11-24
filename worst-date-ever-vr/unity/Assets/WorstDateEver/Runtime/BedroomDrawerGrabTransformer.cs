using Oculus.Interaction;
using UnityEngine;

namespace WorstDateEver
{
    public sealed class BedroomDrawerGrabTransformer : GrabFreeTransformer, ITransformer
    {
        private BedroomProp prop;

        void ITransformer.Initialize(IGrabbable grabbable)
        {
            base.Initialize(grabbable);
            prop = grabbable.Transform.GetComponent<BedroomProp>();
        }

        void ITransformer.UpdateTransform()
        {
            if (!prop)
            {
                base.UpdateTransform();
                return;
            }

            var target=prop.transform;
            var from=new Pose(target.position,target.rotation);
            base.UpdateTransform();
            var pose=prop.LimitHeldPose(from,new Pose(target.position,target.rotation));
            target.SetPositionAndRotation(pose.position,pose.rotation);
        }
    }
}
