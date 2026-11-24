using System;
using System.Collections.Generic;
using Oculus.Interaction;
using Oculus.Interaction.HandGrab;
using Oculus.Interaction.Input;
using UnityEngine;

namespace WorstDateEver
{
    public sealed class BedroomGripVisual : MonoBehaviour
    {
        // The SDK supplies the underlying pose, so allow only a small opening
        // correction while searching farther in the direction of palm flexion.
        private static readonly float[] Adjustments = { 0, -7, 12, 24, 39, 57 };
        private HandVisual[] visuals;
        private HandGrabInteractor[] hands;
        private GrabInteractor[] controllers;
        private BedroomProp phone;
        private FirstDateVenue venue;
        private readonly Dictionary<HandVisual, Action> updates = new();

        public void Initialize(BedroomProp phoneProp)
        {
            phone = phoneProp;
            visuals = GetComponentsInChildren<HandVisual>(true);
            hands = GetComponentsInChildren<HandGrabInteractor>(true);
            controllers = GetComponentsInChildren<GrabInteractor>(true);
            venue = FindFirstObjectByType<FirstDateVenue>();
            foreach (var visual in visuals)
            {
                Action update = () => Fit(visual);
                updates.Add(visual, update);
                visual.WhenHandVisualUpdated += update;
            }
        }

        private void Update()
        {
            if (!venue) venue = FindFirstObjectByType<FirstDateVenue>();
        }

        private void OnDestroy()
        {
            foreach (var (visual, update) in updates)
                if (visual) visual.WhenHandVisualUpdated -= update;
        }

        private void Fit(HandVisual visual)
        {
            if (!TryFrame(visual, out var wrist, out var across, out _)) return;
            var body = GetHeldBody(visual, wrist);
            if (!body) return;
            var colliders = body.GetComponents<Collider>();
            // Unity's hand frame is left-handed. Positive rotation on this axis bends toward the palm.
            var flexionAxis = visual.Hand.Handedness == Handedness.Right ? -across : across;
            foreach (var finger in HandJointUtils.FingerToJointList)
            for (var i = 0; i + 1 < finger.Length; i++)
            {
                var joint = visual.GetTransformByHandJointId(finger[i]);
                var child = visual.GetTransformByHandJointId(finger[i + 1]);
                if (joint && child) Conform(joint, child, flexionAxis, colliders);
            }
        }

        private Rigidbody GetHeldBody(HandVisual visual, Vector3 wrist)
        {
            var dateBody = venue ? venue.HeldBody(visual.Hand.Handedness == Handedness.Left ? 0 : 1) : null;
            if (dateBody) return dateBody;
            Rigidbody nearest = null;
            var best = .24f * .24f;
            void Match(Rigidbody candidate)
            {
                if (!candidate) return;
                var distance = (candidate.position - wrist).sqrMagnitude;
                if (distance < best) { best = distance; nearest = candidate; }
            }
            foreach (var hand in hands)
            {
                if (hand.Hand?.Handedness != visual.Hand.Handedness) continue;
                var candidate = hand.SelectedInteractable;
                if (candidate) Match(candidate.Rigidbody);
            }
            foreach (var controller in controllers)
            {
                var candidate = controller.SelectedInteractable;
                if (candidate && (controller.transform.position - wrist).sqrMagnitude < .18f * .18f)
                    Match(candidate.Rigidbody);
            }
            if (phone && phone.IsHeld) Match(phone.Body);
            return nearest;
        }

        public HandVisual FindPhoneHand(Vector3 selection)
        {
            if (visuals == null) return null;
            HandVisual hand = null;
            var nearest = .32f * .32f;
            foreach (var visual in visuals)
            {
                if (!TryFrame(visual, out var wrist, out _, out _)) continue;
                var distance = (selection - wrist).sqrMagnitude;
                if (distance >= nearest) continue;
                nearest = distance;
                hand = visual;
            }
            return hand;
        }

        public static bool TryPhonePose(HandVisual hand, out Pose pose)
        {
            pose = default;
            if (!hand || !TryFrame(hand, out var wrist, out var across, out var fingers)) return false;
            var forward = Vector3.Cross(across, fingers).normalized;
            if (hand.Hand.Handedness == Handedness.Left) forward = -forward;
            pose = new Pose(wrist + across * .025f + fingers * .111f - forward * .019f,
                Quaternion.LookRotation(forward, fingers));
            return true;
        }

        private static bool TryFrame(HandVisual visual, out Vector3 wrist, out Vector3 across, out Vector3 fingers)
        {
            wrist = across = fingers = default;
            if (!visual.isActiveAndEnabled || visual.Hand == null || !visual.Hand.IsTrackedDataValid) return false;
            var root = visual.GetTransformByHandJointId(HandJointId.HandWristRoot);
            var index = visual.GetTransformByHandJointId(HandJointId.HandIndex1);
            var little = visual.GetTransformByHandJointId(HandJointId.HandPinky1);
            if (!root || !index || !little) return false;
            wrist = root.position;
            across = (index.position - little.position).normalized;
            fingers = Vector3.ProjectOnPlane((index.position + little.position) * .5f - wrist, across).normalized;
            return across.sqrMagnitude > .9f && fingers.sqrMagnitude > .9f;
        }

        private static void Conform(Transform joint, Transform child, Vector3 axis, Collider[] colliders)
        {
            var origin = joint.position;
            var segment = child.position - origin;
            if (segment.sqrMagnitude < .000001f || Distance(origin, colliders) > segment.magnitude + .035f) return;
            var score = float.PositiveInfinity;
            var best = Quaternion.identity;
            foreach (var angle in Adjustments)
            {
                var adjust = Quaternion.AngleAxis(angle, axis);
                var end = adjust * segment;
                var tip = Distance(origin + end, colliders) - .007f;
                var middle = Distance(origin + end * .55f, colliders) - .006f;
                var error = Mathf.Abs(tip) - 4 * Mathf.Min(0, tip, middle) + Mathf.Abs(angle) * .000052f;
                if (error >= score) continue;
                score = error;
                best = adjust;
            }
            joint.rotation = best * joint.rotation;
        }

        private static float Distance(Vector3 point, Collider[] colliders)
        {
            var distance = float.PositiveInfinity;
            foreach (var collider in colliders)
            {
                if (!collider.enabled || collider.isTrigger) continue;
                var offset = collider.ClosestPoint(point) - point;
                distance = Mathf.Min(distance, offset.sqrMagnitude);
            }
            return Mathf.Sqrt(distance);
        }
    }
}
