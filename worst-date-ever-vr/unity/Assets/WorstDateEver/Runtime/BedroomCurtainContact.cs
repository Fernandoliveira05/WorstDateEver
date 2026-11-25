using UnityEngine;

namespace WorstDateEver
{
    public sealed class BedroomCurtainContact : MonoBehaviour
    {
        public BedroomCurtain Curtain;

        private void OnTriggerEnter(Collider other)
        {
            var body = other.attachedRigidbody;
            if (body && !body.isKinematic && body.linearVelocity.sqrMagnitude > .10f)
                Curtain.Touch(other.bounds.center,Mathf.Clamp(body.linearVelocity.z*.22f,-1.1f,1.1f));
        }
    }
}
