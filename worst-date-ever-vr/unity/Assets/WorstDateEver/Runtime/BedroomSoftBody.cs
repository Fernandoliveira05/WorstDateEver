using UnityEngine;
using UnityEngine.Events;

namespace WorstDateEver
{
    public sealed class BedroomSoftBody : MonoBehaviour
    {
        public BedroomProp Core;
        public BedroomProp[] Ends;
        public UnityEvent Grabbed = new();
        private bool wasHeld;

        private void Start()
        {
            foreach (var end in Ends) end.transform.SetParent(null,true);
        }

        private void FixedUpdate()
        {
            var held = Core.IsHeld;
            foreach (var end in Ends) held |= end.IsHeld;
            if (held)
            {
                if (!Core.Body.isKinematic) Core.Body.WakeUp();
                foreach (var end in Ends)
                    if (!end.Body.isKinematic) end.Body.WakeUp();
                if (!wasHeld) Grabbed.Invoke();
            }
            wasHeld = held;
        }

        public void ResetEnds()
        {
            var root = Core.Body;
            foreach (var end in Ends)
            {
                var tip = end.Body;
                var joint = tip.GetComponent<ConfigurableJoint>();
                tip.position = root.position + root.rotation * (joint.connectedAnchor-joint.anchor);
                tip.rotation = root.rotation;
                if (!tip.isKinematic) tip.linearVelocity = tip.angularVelocity = Vector3.zero;
            }
        }
    }
}
