using UnityEngine;

namespace WorstDateEver
{
    public enum WindowTime { GoldenHour, Day, Night }

    public sealed class BedroomWindowView : MonoBehaviour
    {
        [System.Serializable]
        public struct Bird
        {
            public Transform Body, LeftWing, RightWing;
        }

        public Renderer Sky;
        public Renderer[] Clouds;
        public Renderer[] Mountains;
        public GameObject StreetLighting;
        public Renderer[] NeighborWindows;
        public Bird[] Birds;
        public Light Sun, Fill, Accent;
        public GameObject Beams;
        public WindowTime Current { get; private set; }
        private bool initialized;

        public void SetTime(WindowTime time)
        {
            if (initialized && Current == time) return;
            initialized = true;
            Current = time;
            var night = time == WindowTime.Night;
            var day = time == WindowTime.Day;
            var block = new MaterialPropertyBlock();
            Sky.GetPropertyBlock(block);
            block.SetFloat("_TimeOfDay",(float)time);
            Sky.SetPropertyBlock(block);
            foreach (var mountain in Mountains) mountain.SetPropertyBlock(block);
            StreetLighting.SetActive(night);
            var cloudColor = night ? new Color(.19f,.23f,.38f)
                : day ? new Color(.93f,.94f,.9f) : new Color(.92f,.76f,.65f);
            foreach (var cloud in Clouds)
            {
                foreach (var layer in cloud.GetComponentsInChildren<Renderer>())
                    Tint(layer, layer == cloud ? cloudColor : cloudColor * (night ? .83f : 1.035f),block);
            }
            foreach (var window in NeighborWindows)
                Tint(window, night ? new Color(.95f,.55f,.24f) : new Color(.34f,.44f,.49f), block);

            Sun.color = night ? new Color(.40f,.54f,1f) : day ? new Color(1f,.94f,.82f) : new Color(1f,.70f,.42f);
            Sun.intensity = night ? .85f : day ? 3.25f : 4.9f;
            Beams.SetActive(time == WindowTime.GoldenHour);
            Fill.intensity = night ? .28f : .66f;
            Fill.color = night ? new Color(.59f,.70f,1f) : new Color(1f,.95f,.86f);
            Accent.intensity = night ? .38f : .55f;
            RenderSettings.ambientLight = night ? new Color(.26f,.29f,.43f) : new Color(.49f,.46f,.50f);
            foreach (var bird in Birds) bird.Body.gameObject.SetActive(!night);
        }

        private static void Tint(Renderer renderer, Color color, MaterialPropertyBlock block)
        {
            block.Clear();
            block.SetColor("_Color",color);
            block.SetColor("_BaseColor",color);
            renderer.SetPropertyBlock(block);
        }

        private void Update()
        {
            var elapsed = Time.timeSinceLevelLoad;
            for (var i=0; i<Clouds.Length; i++)
            {
                var cloud = Clouds[i].transform;
                var p = cloud.position;
                p.x = -16f + Mathf.Repeat(8.7f+i*3.5f+elapsed*(.24f+.035f*(i%3)),32f);
                cloud.position = p;
            }
            if (Current == WindowTime.Night) return;
            for (var i=0; i<Birds.Length; i++)
            {
                var bird = Birds[i];
                var age = elapsed + i*.47f;
                var x = -10f + Mathf.Repeat(age*1.07f+4.2f,19f);
                bird.Body.position = new Vector3(x,3.4f+i*.17f+Mathf.Sin(age*1.4f)*.13f,10.1f+i*.42f);
                var flap = Mathf.Sin(age*17f)*(25f+19f*Mathf.Sin(age*2.1f));
                bird.LeftWing.localRotation = Quaternion.Euler(flap,6,0);
                bird.RightWing.localRotation = Quaternion.Euler(-flap,-6,0);
            }
        }
    }
}
