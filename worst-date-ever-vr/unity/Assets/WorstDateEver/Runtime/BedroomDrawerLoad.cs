using System.Collections;
using UnityEngine;
using UnityEngine.Events;

namespace WorstDateEver
{
    public sealed class BedroomDrawerLoad : MonoBehaviour
    {
        public BedroomDrawerTray Tray;
        public BedroomProp[] Contents;
        public BedroomProp SpringToy;
        public UnityEvent ToyPopped = new();

        public void Open()
        {
            if (!SpringToy || SpringToy.IsHeld || !Tray.Contains(SpringToy.Body.worldCenterOfMass)) return;

            var body = SpringToy.Body;
            var eye=Camera.main;
            var at=body.worldCenterOfMass;
            var face=eye ? eye.transform.position : at-Tray.transform.forward*.68f+Vector3.up*1.1f;
            var gravity=Physics.gravity.magnitude;
            var vertical=Mathf.Clamp(Mathf.Sqrt(2*gravity*Mathf.Max(.8f,face.y+.22f-at.y)),4.8f,6.2f);
            var approach=Vector3.ProjectOnPlane(face-at,Vector3.up)/Mathf.Max(.18f,vertical/gravity-.055f);
            body.WakeUp();
            body.linearVelocity=Vector3.up*vertical;
            body.angularVelocity=Tray.transform.TransformDirection(new Vector3(-3,2,1));
            StartCoroutine(AimAfterClearingRim(body,Vector3.ClampMagnitude(approach,3.3f)));
            SpringToy.GetComponent<BedroomAudio>()?.Croak();
            ToyPopped.Invoke();
        }

        private IEnumerator AimAfterClearingRim(Rigidbody body,Vector3 velocity)
        {
            yield return new WaitForSeconds(.055f);
            if (body && SpringToy && !SpringToy.IsHeld && body.linearVelocity.y>.7f)
                body.linearVelocity=velocity+Vector3.up*body.linearVelocity.y;
        }
    }
}
