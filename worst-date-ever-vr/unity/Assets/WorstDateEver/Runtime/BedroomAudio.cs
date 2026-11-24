using UnityEngine;

namespace WorstDateEver
{
    [RequireComponent(typeof(AudioSource))]
    public sealed class BedroomAudio : MonoBehaviour
    {
        private static AudioClip knock, chime, croak;
        private AudioSource speaker;
        private float nextImpact;
        public BedroomController Bedroom;

        private void Awake()
        {
            speaker = GetComponent<AudioSource>();
            speaker.playOnAwake = false;
            speaker.spatialBlend = 1;
            speaker.minDistance = .2f;
            speaker.maxDistance = 3.5f;
            if (!knock) knock = Tone("Toc", .14f, 114f, 42f, 0);
            if (!chime) chime = Tone("Novo match", .31f, 523.25f, 783.99f, .12f);
        }

        public void Croak()
        {
            if (!croak) croak=FrogCall();
            speaker.PlayOneShot(croak,.53f);
        }

        private static AudioClip FrogCall()
        {
            const int rate=22050;
            var samples=new float[Mathf.CeilToInt(rate*.38f)];
            AddPulse(0,.15f,148);
            AddPulse(.13f,.23f,113);
            var clip=AudioClip.Create("Chamado do sapo",samples.Length,1,rate,false);
            clip.SetData(samples,0);
            return clip;

            void AddPulse(float delay,float duration,float frequency)
            {
                var phase=0f;
                var start=Mathf.RoundToInt(delay*rate);
                for(var sample=0;sample<Mathf.RoundToInt(duration*rate);sample++)
                {
                    var time=sample/(float)rate;
                    var fraction=time/duration;
                    phase+=Mathf.Lerp(frequency*1.16f,65f,fraction)*Mathf.PI*2/rate;
                    var rasp=Mathf.Sin(phase)+.46f*Mathf.Sin(phase*2)+.22f*Mathf.Sin(phase*3);
                    var tremolo=.74f+.26f*Mathf.Sin(time*175f);
                    samples[sample+start]+=.40f*rasp*tremolo*Mathf.Min(44f*time,1)*(1-fraction)*(1-fraction);
                }
            }
        }

        public void Notify() => speaker.PlayOneShot(chime, .25f);

        private void OnCollisionEnter(Collision collision)
        {
            var speed = collision.relativeVelocity.magnitude;
            if (Time.unscaledTime < nextImpact || speed < .80f) return;
            nextImpact = Time.unscaledTime + .30f;
            speaker.PlayOneShot(knock, Mathf.Clamp(speed * .13f, .08f, .32f));
            if (Bedroom && (collision.collider.name == "Colchão macio" || collision.collider.name == "Edredom dobrado"))
                Bedroom.Joke("O celular foi para a cama antes de mim.");
        }

        private static AudioClip Tone(string name, float seconds, float first, float second, float change)
        {
            const int rate = 22050;
            var samples = new float[Mathf.CeilToInt(seconds * rate)];
            var phase = 0f;
            for (var i = 0; i < samples.Length; i++)
            {
                var t = (float)i / rate;
                var frequency = change > 0 ? (t < change ? first : second) : Mathf.Lerp(first, second, t / seconds);
                phase += frequency * Mathf.PI * 2f / rate;
                var envelope = Mathf.Min(t * 230f, 1f) * (1f - t / seconds);
                samples[i] = .60f * Mathf.Sin(phase) * envelope * envelope;
            }
            var clip = AudioClip.Create(name, samples.Length, 1, rate, false);
            clip.SetData(samples, 0);
            return clip;
        }
    }
}
