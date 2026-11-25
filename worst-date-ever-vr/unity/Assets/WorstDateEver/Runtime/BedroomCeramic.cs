using UnityEngine;

namespace WorstDateEver
{
    public sealed class BedroomCeramic : MonoBehaviour
    {
        [System.Serializable]
        public sealed class Fracture
        {
            public Rigidbody[] Pieces;
        }

        public Fracture[] Patterns;
        [Min(.1f)] public float BreakSpeed = 3.1f;
        private Rigidbody body;
        private bool broken;
        public int SelectedPattern { get; private set; } = -1;

        private void Awake() => body = GetComponent<Rigidbody>();

        private void OnCollisionEnter(Collision collision)
        {
            if (broken || body.isKinematic || collision.contactCount == 0) return;
            var impact = collision.GetContact(0);
            var speed = Mathf.Abs(Vector3.Dot(collision.relativeVelocity,impact.normal));
            if (speed < BreakSpeed) return;

            broken = true;
            var local = transform.InverseTransformPoint(impact.point);
            var normal = transform.InverseTransformDirection(impact.normal);
            var angle = Mathf.Atan2(local.z-normal.z*.028f,local.x-normal.x*.028f)*Mathf.Rad2Deg;
            var band = Mathf.FloorToInt(Mathf.Repeat(angle+20f,360f)/60f);
            var severity = speed >= BreakSpeed*1.65f ? 1 : 0;
            SelectedPattern = (band+severity)%Patterns.Length;

            foreach (var piece in Patterns[SelectedPattern].Pieces)
            {
                piece.transform.SetParent(null,true);
                piece.gameObject.SetActive(true);
                var scatter = piece.worldCenterOfMass-impact.point;
                var direction = scatter.sqrMagnitude > .00001f ? scatter.normalized : impact.normal;
                var spread = Mathf.Clamp(.23f+.065f/Mathf.Max(.018f,piece.mass),.29f,.86f);
                piece.linearVelocity = Vector3.ClampMagnitude(body.linearVelocity,.7f)
                    + direction*Mathf.Min(speed*spread,2.4f)+impact.normal*.42f;
                piece.angularVelocity = Vector3.Cross(direction,impact.normal)*(8f+spread*9f);
            }
            gameObject.SetActive(false);
        }
    }
}
