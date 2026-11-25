using UnityEngine;
using UnityEngine.Events;

namespace WorstDateEver
{
    public sealed class BedroomDoor : MonoBehaviour
    {
        public BedroomPull Handle;
        public float Width = .85f;
        public float Height = 2.12f;
        public UnityEvent Opened = new();
        private const float Stop = 94f;
        private readonly Vector3[] lastTouch = new Vector3[2];
        private readonly bool[] wasTracked = new bool[2];
        private BedroomHandContacts hands;
        private float angle, speed;
        private bool unlatched;

        private void Start() => hands = new BedroomHandContacts();

        public void ReleaseLatch()
        {
            unlatched = true;
            if (angle < 3f) speed = Mathf.Max(speed, 18f);
        }

        public void PushAt(Vector3 point, Vector3 movement)
        {
            var lever = transform.InverseTransformPoint(point);
            if (lever.x > -.035f || lever.x < -Width - .045f || lever.y < 0 || lever.y > Height) return;
            ApplyPush(lever.x, transform.InverseTransformVector(movement).z);
        }

        private void ApplyPush(float x, float movement)
        {
            if (Mathf.Abs(movement) < .0006f) return;
            if (!unlatched && movement <= 0) return;
            unlatched = true;
            speed = Mathf.Clamp(speed + movement * -x * 12000f, -180f, 180f);
        }

        private void LateUpdate()
        {
            for (var hand = 0; hand < lastTouch.Length; hand++)
            {
                var tracked = hands.TryGetPosition(hand, out var point);
                if (tracked && wasTracked[hand])
                {
                    var current = transform.InverseTransformPoint(point);
                    var previous = transform.InverseTransformPoint(lastTouch[hand]);
                    if (Mathf.Abs(current.z) < .095f && Mathf.Abs(previous.z) < .13f &&
                        (current.z - previous.z) * previous.z <= 0)
                        PushAt(point, point - lastTouch[hand]);
                }
                lastTouch[hand] = point;
                wasTracked[hand] = tracked;
            }

            if (Handle.IsHeld && unlatched)
                ApplyPush(-Width * .80f, Vector3.Dot(Handle.GrabOffset, transform.forward) * Time.deltaTime * 4f);

            var previousAngle = angle;
            angle = Mathf.Clamp(angle + speed * Time.deltaTime, 0, Stop);
            if (previousAngle < 32f && angle >= 32f) Opened.Invoke();
            speed = Mathf.MoveTowards(speed, 0, 140f * Time.deltaTime);
            if (angle <= 0 && speed <= 0)
            {
                speed = 0;
                if (!Handle.IsHeld) unlatched = false;
            }
            if (angle >= Stop && speed > 0) speed = 0;
            transform.localRotation = Quaternion.Euler(0, angle, 0);
        }
    }
}
