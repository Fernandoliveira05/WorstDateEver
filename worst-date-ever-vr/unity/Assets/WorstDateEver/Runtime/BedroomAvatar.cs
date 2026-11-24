using System.Collections.Generic;
using UnityEngine;

namespace WorstDateEver
{
    [DefaultExecutionOrder(120)]
    public sealed class BedroomAvatar : MonoBehaviour
    {
        public GameObject[] Masculine;
        public GameObject[] Feminine;
        private OVRCameraRig xr;
        private Rig rig;
        private Vector3 previousEye;
        private Vector3 walkDirection = Vector3.forward;
        private float stride, cadence;
        private bool following;

        private void Awake() => xr = FindFirstObjectByType<OVRCameraRig>();

        public void Select(int identity, int outfit)
        {
            var selected = identity == 1 ? Feminine[outfit] : Masculine[outfit];
            if (rig?.Model == selected) return;
            foreach (var look in Masculine) look.SetActive(look == selected);
            foreach (var look in Feminine) look.SetActive(look == selected);
            rig = new Rig(selected);
        }

        private void LateUpdate()
        {
            var eye = xr && xr.centerEyeAnchor ? xr.centerEyeAnchor : Camera.main ? Camera.main.transform : null;
            if (!eye || rig == null) return;
            var left = xr && OVRInput.GetControllerPositionTracked(OVRInput.Controller.LTouch) ? xr.leftControllerAnchor : null;
            var right = xr && OVRInput.GetControllerPositionTracked(OVRInput.Controller.RTouch) ? xr.rightControllerAnchor : null;
            DrivePose(eye,left,right,Time.deltaTime);
        }

        public void DrivePose(Transform eye, Transform leftGrip, Transform rightGrip, float deltaTime)
        {
            var forward = Vector3.ProjectOnPlane(eye.forward,Vector3.up).normalized;
            if (forward.sqrMagnitude < .01f) forward = transform.forward;
            var delta = following ? Vector3.ProjectOnPlane(eye.position-previousEye,Vector3.up) : Vector3.zero;
            previousEye = eye.position;
            following = true;
            var distance = delta.magnitude;
            if (distance > .35f) distance = 0;
            var dt = Mathf.Max(deltaTime,.001f);
            var motion = Mathf.Clamp01((distance/dt-.035f)/.78f);
            cadence = Mathf.MoveTowards(cadence,motion,dt * (motion>.05f ? 6f : 8f));
            if (motion > .025f)
            {
                walkDirection = Vector3.Slerp(walkDirection,delta.normalized,Mathf.Min(1,dt*15f));
                stride = Mathf.Repeat(stride+distance*10.4f,Mathf.PI*2f);
            }

            transform.SetPositionAndRotation(new Vector3(eye.position.x,0,eye.position.z)-forward*.095f,
                Quaternion.LookRotation(forward));
            transform.localScale = Vector3.one*Mathf.Clamp(eye.position.y/1.56f,.73f,1.2f);
            var axis = Vector3.Cross(Vector3.up,walkDirection).normalized;
            if (axis.sqrMagnitude < .5f) axis = transform.right;
            rig.PoseLegs(stride,cadence,axis);
            rig.PoseUpperBody(eye,leftGrip,rightGrip,transform);
        }

        private sealed class Rig
        {
            public GameObject Model { get; }
            private readonly Leg leftLeg, rightLeg;
            private readonly Arm leftArm, rightArm;
            private readonly Joint head;

            public Rig(GameObject model)
            {
                Model = model;
                var bones = new Dictionary<string,Transform>();
                foreach (var bone in model.GetComponentsInChildren<Transform>()) bones[bone.name] = bone;
                leftLeg = new Leg(bones,".L",model.transform);
                rightLeg = new Leg(bones,".R",model.transform);
                leftArm = new Arm(bones,".L",-1);
                rightArm = new Arm(bones,".R",1);
                head = new Joint(Find(bones,"Head"));
            }

            public void PoseLegs(float phase, float amount, Vector3 axis)
            {
                leftLeg.Pose(phase,amount,axis);
                rightLeg.Pose(phase+Mathf.PI,amount,axis);
            }

            public void PoseUpperBody(Transform eye, Transform left, Transform right, Transform body)
            {
                head.Reset();
                if (head.Bone) head.Bone.rotation = eye.rotation*Quaternion.Inverse(body.rotation)*head.Bone.rotation;
                leftArm.Pose(left,body);
                rightArm.Pose(right,body);
            }

            private static Transform Find(Dictionary<string,Transform> bones, string name) =>
                bones.TryGetValue(name,out var bone) ? bone : null;

            private sealed class Leg
            {
                private readonly Joint thigh,knee,foot;
                private readonly Transform ankle,model;
                private readonly Vector3 ankleOffset;

                public Leg(Dictionary<string,Transform> bones, string side, Transform model)
                {
                    this.model = model;
                    thigh = new Joint(Find(bones,"UpperLeg"+side));
                    knee = new Joint(Find(bones,"LowerLeg"+side));
                    foot = new Joint(Find(bones,"Foot"+side));
                    ankle = Find(bones,"LowerLeg"+side+"_end");
                    if (ankle && foot.Bone)
                        ankleOffset = model.InverseTransformVector(foot.Bone.position-ankle.position);
                }

                public void Pose(float phase, float amount, Vector3 axis)
                {
                    var swing = Mathf.Sin(phase);
                    var lift = Mathf.Max(0,Mathf.Cos(phase));
                    thigh.Turn(-swing*amount*30f,axis);
                    knee.Turn(lift*amount*34f,axis);
                    foot.Turn((swing*12f-lift*10f)*amount,axis);
                    if (ankle && foot.Bone)
                        foot.Bone.position = ankle.position+model.TransformVector(ankleOffset);
                }
            }

            private sealed class Arm
            {
                private readonly Joint upper,lower,wrist;
                private readonly float side;
                private readonly Quaternion wristFrame;

                public Arm(Dictionary<string,Transform> bones, string suffix, float side)
                {
                    this.side = side;
                    upper = new Joint(Find(bones,"UpperArm"+suffix));
                    lower = new Joint(Find(bones,"LowerArm"+suffix));
                    wrist = new Joint(Find(bones,"Wrist"+suffix));
                    var middle = Find(bones,"Middle1"+suffix);
                    var index = Find(bones,"Index1"+suffix);
                    var pinky = Find(bones,"Pinky1"+suffix);
                    if (!wrist.Bone || !middle || !index || !pinky) return;
                    var finger = wrist.Bone.InverseTransformDirection(middle.position-wrist.Bone.position).normalized;
                    var across = wrist.Bone.InverseTransformDirection(index.position-pinky.position).normalized;
                    wristFrame = Quaternion.LookRotation(finger,Vector3.Cross(finger,across)*side);
                }

                public void Pose(Transform grip, Transform body)
                {
                    upper.Reset();
                    lower.Reset();
                    wrist.Reset();
                    if (!grip || !upper.Bone || !lower.Bone || !wrist.Bone) return;
                    var shoulder = upper.Bone.position;
                    var target = grip.position-grip.forward*.025f;
                    var toTarget = target-shoulder;
                    if (toTarget.sqrMagnitude < .0001f) return;
                    var a = Vector3.Distance(shoulder,lower.Bone.position);
                    var b = Vector3.Distance(lower.Bone.position,wrist.Bone.position);
                    var length = Mathf.Clamp(toTarget.magnitude,Mathf.Abs(a-b)+.001f,a+b-.001f);
                    var axis = toTarget.normalized;
                    var elbowSide = Vector3.ProjectOnPlane(-body.up+body.right*(.48f*side)-body.forward*.22f,axis).normalized;
                    if (elbowSide.sqrMagnitude < .01f) elbowSide = Vector3.Cross(axis,body.forward).normalized;
                    var along = (a*a-b*b+length*length)/(2*length);
                    var elbow = shoulder+axis*along+elbowSide*Mathf.Sqrt(Mathf.Max(0,a*a-along*along));
                    upper.Bone.rotation = Quaternion.FromToRotation(lower.Bone.position-shoulder,elbow-shoulder)*upper.Bone.rotation;
                    lower.Bone.rotation = Quaternion.FromToRotation(wrist.Bone.position-lower.Bone.position,
                        shoulder+axis*length-lower.Bone.position)*lower.Bone.rotation;
                    wrist.Bone.rotation = grip.rotation*(wristFrame == default ? Quaternion.identity : Quaternion.Inverse(wristFrame));
                }
            }
        }

        private readonly struct Joint
        {
            public readonly Transform Bone;
            private readonly Quaternion rest;

            public Joint(Transform bone)
            {
                Bone = bone;
                rest = bone ? bone.localRotation : Quaternion.identity;
            }

            public void Reset()
            {
                if (Bone) Bone.localRotation = rest;
            }

            public void Turn(float angle, Vector3 axis)
            {
                if (Bone) Bone.localRotation = Quaternion.AngleAxis(angle,Bone.parent.InverseTransformDirection(axis))*rest;
            }
        }
    }
}
