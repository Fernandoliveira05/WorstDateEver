using System.Collections.Generic;
using UnityEngine;

namespace WorstDateEver
{
    /// <summary>Small, cheap shatter response for ceramic, glass and bottle props.</summary>
    public sealed class BreakableProp : MonoBehaviour
    {
        public enum Ware { Ceramic, Glass, Bottle }
        public Ware Kind = Ware.Ceramic;
        public float Threshold = 2.8f;
        public Color ShardColor = new(.82f, .78f, .70f);
        public bool Spills;
        public Color SpillColor = new(.38f, .58f, .66f);

        private bool broken;
        private static AudioClip shatter;

        public static BreakableProp Attach(GameObject root, string id)
        {
            if (!root || root.GetComponent<BreakableProp>()) return root ? root.GetComponent<BreakableProp>() : null;
            var ware = id switch
            {
                "plate" or "cup" or "coffee" or "cake" => Ware.Ceramic,
                "beer" or "wine" or "sake" or "soy" => Ware.Glass,
                "hot-sauce" or "kombucha" => Ware.Bottle,
                _ => (Ware)(-1)
            };
            if ((int)ware < 0) return null;
            var breakable = root.AddComponent<BreakableProp>();
            breakable.Kind = ware;
            breakable.Threshold = ware switch { Ware.Ceramic => 2.75f, Ware.Glass => 2.25f, _ => 2.55f };
            breakable.Shards = ware == Ware.Glass ? 9 : 7;
            breakable.Spills = ware != Ware.Ceramic;
            breakable.SpillColor = id switch
            {
                "beer" => new Color(.88f, .58f, .18f), "wine" => new Color(.52f, .12f, .18f),
                "sake" or "soy" => new Color(.68f, .58f, .42f),
                "kombucha" => new Color(.86f, .52f, .20f),
                _ => new Color(.34f, .54f, .64f)
            };
            return breakable;
        }

        private int Shards = 8;

        private void OnCollisionEnter(Collision collision)
        {
            if (broken) return;
            var body = GetComponent<Rigidbody>();
            if (body && body.isKinematic) return;
            var speed = collision.relativeVelocity.magnitude;
            if (speed < Threshold) return;
            broken = true;
            var point = collision.contactCount > 0 ? collision.GetContact(0).point : transform.position;
            var normal = collision.contactCount > 0 ? collision.GetContact(0).normal : Vector3.up;
            Shatter(point, normal, speed);
        }

        private void Shatter(Vector3 point, Vector3 normal, float impact)
        {
            foreach (var renderer in GetComponentsInChildren<Renderer>())
            {
                var source = renderer.sharedMaterial;
                var material = source ? new Material(source) : new Material(Shader.Find("Standard"));
                material.color = ShardColor;
                for (var i = 0; i < Shards; i++)
                {
                    var shard = GameObject.CreatePrimitive(Kind == Ware.Glass && i % 2 == 0
                        ? PrimitiveType.Cube : PrimitiveType.Sphere);
                    shard.name = "Broken " + name;
                    shard.transform.SetParent(transform.parent, true);
                    shard.transform.position = point + Random.insideUnitSphere * .055f;
                    var thin = Kind == Ware.Glass ? new Vector3(.035f, .012f, .035f)
                        : new Vector3(.045f, .026f, .045f);
                    shard.transform.localScale = thin * Random.Range(.65f, 1.35f);
                    shard.GetComponent<Renderer>().sharedMaterial = material;
                    var rb = shard.AddComponent<Rigidbody>();
                    rb.mass = .018f;
                    rb.linearDamping = .18f;
                    rb.angularDamping = .25f;
                    rb.collisionDetectionMode = CollisionDetectionMode.Discrete;
                    rb.AddForce((normal * .55f + Random.insideUnitSphere * .9f) * Mathf.Min(impact, 6f)
                        + Vector3.up * .4f, ForceMode.VelocityChange);
                    rb.AddTorque(Random.insideUnitSphere * 4f, ForceMode.VelocityChange);
                    Destroy(shard, Random.Range(4f, 6f));
                }
                renderer.enabled = false;
            }
            foreach (var collider in GetComponentsInChildren<Collider>()) collider.enabled = false;
            var held = GetComponent<Rigidbody>();
            if (held) { held.isKinematic = true; held.detectCollisions = false; }
            if (Spills) Spill(point);
            sound();
            FindFirstObjectByType<FirstDateVenue>()?.NotifyBreak(point);
            Destroy(gameObject, 5.5f);
        }

        private void Spill(Vector3 point)
        {
            var spill = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            spill.name = "Spilled drink";
            spill.transform.SetParent(transform.parent, true);
            spill.transform.position = point + Vector3.up * .012f;
            spill.transform.localScale = new Vector3(.24f, .004f, .24f);
            var material = new Material(Shader.Find("Standard")) { color = SpillColor };
            spill.GetComponent<Renderer>().sharedMaterial = material;
            Destroy(spill.GetComponent<Collider>());
            Destroy(spill, 7f);
        }

        private void sound()
        {
            if (!shatter)
            {
                const int rate = 22050, length = rate / 3;
                var samples = new float[length];
                var random = new System.Random(17);
                for (var i = 0; i < samples.Length; i++)
                {
                    var envelope = Mathf.Pow(1f - i / (float)length, 1.7f);
                    samples[i] = ((float)random.NextDouble() * 2f - 1f) * envelope * .65f +
                        Mathf.Sin(i * .035f) * envelope * .18f;
                }
                shatter = AudioClip.Create("Shatter", length, 1, rate, false);
                shatter.SetData(samples, 0);
            }
            AudioSource.PlayClipAtPoint(shatter, transform.position, .38f);
        }
    }
}
