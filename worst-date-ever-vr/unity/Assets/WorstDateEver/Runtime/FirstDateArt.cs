using UnityEngine;

namespace WorstDateEver
{
    public sealed class FirstDateArt : ScriptableObject
    {
        public GameObject[] Characters;
        public AnimationClip[] Walk, Idle;
        public Texture2D Walnut, Floor;
        public Material Surface;
        public Shader Unlit;
    }
}
