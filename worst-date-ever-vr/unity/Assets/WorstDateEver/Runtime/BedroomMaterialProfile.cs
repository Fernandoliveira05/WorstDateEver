using UnityEngine;

namespace WorstDateEver
{
    [CreateAssetMenu(menuName = "Worst Date Ever/Physical Material")]
    public sealed class BedroomMaterialProfile : ScriptableObject
    {
        public enum Response { Flexible, Rebound, Brittle }
        public Response Behavior;
        public PhysicsMaterial Surface;
        [Min(.005f)] public float Mass = .15f;
        [Range(.08f,.40f)] public float EndMass = .20f;
        [Range(5,80)] public float BendLimit = 38;
        [Min(0)] public float BendSpring = .025f;
        [Min(0)] public float BendDamping = .0015f;
        [Min(.1f)] public float BreakSpeed = 3.1f;

        public void Apply(Rigidbody body, Collider collider)
        {
            body.mass = Mass;
            collider.sharedMaterial = Surface;
        }
    }
}
