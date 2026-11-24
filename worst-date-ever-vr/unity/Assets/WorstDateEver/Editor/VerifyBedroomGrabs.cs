using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Oculus.Interaction;
using UnityEditor;
using UnityEngine;

namespace WorstDateEver.Editor
{
    public static class VerifyBedroomGrabs
    {
        [MenuItem("Worst Date Ever/Verify Bedroom Grabs in Play Mode")]
        public static void Run()
        {
            if (!EditorApplication.isPlaying) throw new InvalidOperationException("Open BedroomQuest in Play mode.");
            var scene = UnityEngine.SceneManagement.SceneManager.GetActiveScene();
            var bedroom = scene.GetRootGameObjects().Single(item => item.name == "Bedroom objects");
            var active = bedroom.activeSelf;
            bedroom.SetActive(true);
            try { Verify(scene); }
            finally { bedroom.SetActive(active); }
        }

        private static void Verify(UnityEngine.SceneManagement.Scene scene)
        {
            var props = UnityEngine.Object.FindObjectsByType<BedroomProp>(FindObjectsInactive.Include, FindObjectsSortMode.None)
                .Where(prop => prop.gameObject.scene == scene).ToArray();
            var failures = new List<string>();
            foreach (var prop in props)
            {
                var grab = prop.GetComponent<Grabbable>();
                if (!grab || !prop.Body) { failures.Add(prop.name + " (missing grab or body)"); continue; }
                var position = prop.Body.position;
                var rotation = prop.Body.rotation;
                var kinematic = prop.Body.isKinematic;
                var pose = new Pose(position, rotation);
                const int id = 991;
                try
                {
                    grab.ProcessPointerEvent(new PointerEvent(id, PointerEventType.Select, pose));
                    if (!prop.IsHeld) failures.Add(prop.name + " (select)");
                    grab.ProcessPointerEvent(new PointerEvent(id, PointerEventType.Move,
                        new Pose(position + Vector3.up * .008f, rotation)));
                    grab.ProcessPointerEvent(new PointerEvent(id, PointerEventType.Unselect, pose));
                    if (prop.IsHeld) failures.Add(prop.name + " (release)");
                    if (!float.IsFinite(prop.Body.position.sqrMagnitude))
                        failures.Add(prop.name + " (invalid pose)");
                }
                catch (Exception ex) { failures.Add(prop.name + " (" + ex.Message + ")"); }
                finally
                {
                    if (!prop.Body.isKinematic)
                    {
                        prop.Body.linearVelocity = Vector3.zero;
                        prop.Body.angularVelocity = Vector3.zero;
                    }
                    prop.Body.isKinematic = kinematic;
                    prop.Body.position = position;
                    prop.Body.rotation = rotation;
                }
            }

            var phone = props.Single(prop => prop.GetComponent<BedroomPhoneGrip>());
            if (phone.GetComponent<Grabbable>().MaxGrabPoints != 1) failures.Add("Phone grab limit");
            var report = $"{props.Length} props exercised. {failures.Count} failures. " + string.Join(", ", failures);
            Debug.Log("Bedroom grab check: " + report);
            var evidence = Environment.GetEnvironmentVariable("WDE_GRAB_EVIDENCE");
            evidence ??= Path.Combine(Path.GetTempPath(), "wde-grip");
            if (!string.IsNullOrWhiteSpace(evidence))
            {
                Directory.CreateDirectory(evidence);
                File.WriteAllText(Path.Combine(evidence, "unity-grab-report.txt"), report);
                CapturePhone(phone, Path.Combine(evidence, "unity-phone.png"));
            }
            if (props.Length == 0 || failures.Count > 0) throw new InvalidOperationException(report);
        }

        [MenuItem("Worst Date Ever/Verify Restaurant Grabs in Play Mode")]
        public static void VerifyRestaurant()
        {
            var venue = UnityEngine.Object.FindFirstObjectByType<FirstDateVenue>();
            if (!EditorApplication.isPlaying || !venue)
                throw new InvalidOperationException("Enter a restaurant in Play mode before checking its props.");
            var restaurant = venue.GetComponentsInChildren<Transform>(true).Single(item => item.name == "Table props");
            var type = typeof(FirstDateVenue);
            const BindingFlags members = BindingFlags.Instance | BindingFlags.NonPublic;
            var press = type.GetMethod("Press", members);
            var move = type.GetMethod("Move", members);
            var heldBody = type.GetMethod("HeldBody", members);
            var release = type.GetMethod("Release", members);

            foreach (Transform prop in restaurant)
            {
                var body = prop.GetComponent<Rigidbody>();
                var pose = new Pose(body.position, body.rotation);
                var ray = new Ray(pose.position + Vector3.up * .65f, Vector3.down);
                press.Invoke(venue, new object[] { 2, ray, Quaternion.identity, true, (Vector3?)pose.position });
                if ((Rigidbody)heldBody.Invoke(venue, new object[] { 2 }) != body)
                    throw new InvalidOperationException("Could not grab " + prop.name);
                move.Invoke(venue, new object[] { 2, ray, Quaternion.identity });
                release.Invoke(venue, new object[] { 2 });
                if ((Rigidbody)heldBody.Invoke(venue, new object[] { 2 }))
                    throw new InvalidOperationException("Could not release " + prop.name);
            }
            Debug.Log($"Restaurant grab check: {restaurant.childCount} props exercised. 0 failures.");
        }

        private static void CapturePhone(BedroomProp phone, string path)
        {
            var original = Camera.main;
            if (!original) return;
            var camera = new GameObject("Grip review camera", typeof(Camera)).GetComponent<Camera>();
            var texture = new RenderTexture(1200, 760, 24);
            var result = new Texture2D(texture.width, texture.height, TextureFormat.RGB24, false);
            var previous = RenderTexture.active;
            var grab = phone.GetComponent<Grabbable>();
            var body = phone.Body;
            var originalPose = new Pose(body.position, body.rotation);
            var wasKinematic = body.isKinematic;
            var interpolation = body.interpolation;
            camera.CopyFrom(original);
            camera.stereoTargetEye = StereoTargetEyeMask.None;
            camera.targetTexture = texture;
            original.tag = "Untagged";
            camera.tag = "MainCamera";
            camera.fieldOfView = 43;
            var eye = new Vector3(0, 1.52f, .55f);
            camera.transform.SetPositionAndRotation(eye, Quaternion.Euler(8, 155, 0));
            var forward = camera.transform.forward;
            var anchor = eye + forward * .6f + camera.transform.right * .13f - Vector3.up * .1f;
            var point = new Pose(anchor, camera.transform.rotation);
            body.interpolation = RigidbodyInterpolation.None;
            phone.transform.SetPositionAndRotation(anchor - Vector3.up * .04f, Quaternion.Euler(55, 45, 90));
            body.position = phone.transform.position;
            body.rotation = phone.transform.rotation;
            Physics.SyncTransforms();
            try
            {
                grab.ProcessPointerEvent(new PointerEvent(992, PointerEventType.Select, point));
                grab.ProcessPointerEvent(new PointerEvent(992, PointerEventType.Move, point));
                Physics.SyncTransforms();
                var framed = camera.WorldToViewportPoint(phone.transform.position);
                var screen = Vector3.Dot(phone.transform.up, Vector3.up);
                var reading = Vector3.Dot(phone.transform.forward, forward);
                if (framed.z < 0 || !new Rect(0, 0, 1, 1).Contains(framed) || screen < .98f || reading < .96f)
                    throw new InvalidOperationException("Phone grip preview was not framed upright: " + framed);
                camera.Render();
                RenderTexture.active = texture;
                result.ReadPixels(new Rect(0, 0, texture.width, texture.height), 0, 0);
                File.WriteAllBytes(path, result.EncodeToPNG());
            }
            finally
            {
                grab.ProcessPointerEvent(new PointerEvent(992, PointerEventType.Unselect, point));
                if (!body.isKinematic) { body.linearVelocity = Vector3.zero; body.angularVelocity = Vector3.zero; }
                body.isKinematic = wasKinematic;
                body.interpolation = interpolation;
                body.position = originalPose.position;
                body.rotation = originalPose.rotation;
                original.tag = "MainCamera";
                RenderTexture.active = previous;
                UnityEngine.Object.DestroyImmediate(camera.gameObject);
                UnityEngine.Object.DestroyImmediate(result);
                UnityEngine.Object.DestroyImmediate(texture);
            }
        }
    }
}
