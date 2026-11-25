using UnityEngine;

namespace WorstDateEver
{
    [RequireComponent(typeof(Rigidbody))]
    public sealed class BedroomDrawerTray : MonoBehaviour
    {
        public Bounds Interior;
        public BoxCollider Floor;

        public bool Contains(Vector3 worldPoint) => Interior.Contains(transform.InverseTransformPoint(worldPoint));
    }
}
