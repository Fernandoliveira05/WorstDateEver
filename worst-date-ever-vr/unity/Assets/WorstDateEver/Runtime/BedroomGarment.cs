using System.Collections.Generic;
using UnityEngine;

namespace WorstDateEver
{
    public sealed class BedroomGarment : MonoBehaviour
    {
        public Transform[] Bones;
        public float Bend;
        public float Damp;
        public BedroomSoftBody Item;
        private readonly Vector3[] positions=new Vector3[9], previous=new Vector3[9], start=new Vector3[9];
        private readonly float[] depth=new float[9];
        private readonly RaycastHit[] contacts=new RaycastHit[12];
        private readonly List<Edge> edges=new();
        private float time;
        private int settled;
        private const float StepSize=.01f;
        private const int Middle=3;
        private const float Radius=.009f;
        private readonly struct Edge
        {
            public readonly int A,B;
            public readonly float Length,Strength;
            public Edge(int a,int b,float length,float strength)
            { A=a; B=b; Length=length; Strength=strength; }
        }

        private void Start()
        {
            for(var index=0;index<9;index++) positions[index]=previous[index]=Bones[index].position;
            for(var row=0;row<3;row++)
            for(var column=0;column<3;column++)
            {
                var index=row*3+column;
                if (row<2) Link(index,index+3,.98f);
                if (column<2) Link(index,index+1,.98f);
                if (row<2&&column<2) Link(index,index+4,.52f);
                if (row<2&&column>0) Link(index,index+2,.52f);
                if (row==0) Link(index,index+6,Bend*.32f);
                if (!Pinned(index)) depth[index]=Vector3.Distance(positions[index],positions[Middle+column]);
            }
        }

        private void Link(int a,int b,float strength) =>
            edges.Add(new Edge(a,b,Vector3.Distance(positions[a],positions[b]),strength));

        private static bool Pinned(int index)=>index>=Middle&&index<Middle+3;

        private void LateUpdate()
        {
            var movingPin=false;
            for(var i=Middle;i<Middle+3;i++)
                movingPin|=(Bones[i].position-positions[i]).sqrMagnitude>.000000025f;
            if (settled>=12&&!movingPin) return;
            time+=Mathf.Min(.04f,Time.deltaTime);
            while(time>=StepSize)
            {
                Simulate();
                time-=StepSize;
            }
            Dress();
        }

        private void Simulate()
        {
            for(var i=0;i<9;i++)
            {
                start[i]=positions[i];
                if (Pinned(i))
                {
                    previous[i]=positions[i];
                    positions[i]=Bones[i].position;
                    continue;
                }
                var velocity=Vector3.ClampMagnitude(positions[i]-previous[i],.024f)*Damp;
                previous[i]=positions[i];
                positions[i]+=velocity+Physics.gravity*(StepSize*StepSize);
            }
            for(var pass=0;pass<8;pass++)
                foreach(var link in edges) Constrain(link);

            var largest=0f;
            for(var i=0;i<9;i++)
            {
                if (!Pinned(i))
                {
                    var point=Sweep(start[i],positions[i]);
                    var anchor=positions[Middle+i%3];
                    var reach=point-anchor;
                    var length=depth[i]*1.045f;
                    if (reach.sqrMagnitude>length*length)
                    {
                        point=Sweep(anchor,anchor+reach.normalized*length);
                        previous[i]=point;
                    }
                    positions[i]=point;
                }
                largest=Mathf.Max(largest,(positions[i]-start[i]).sqrMagnitude);
            }
            settled=largest<.00000007f?settled+1:0;
        }

        private void Constrain(Edge link)
        {
            var a=Pinned(link.A)?0f:1f;
            var b=Pinned(link.B)?0f:1f;
            if (a+b==0) return;
            var delta=positions[link.B]-positions[link.A];
            var length=delta.magnitude;
            if (length<.0001f) return;
            var correction=delta*((length-link.Length)*link.Strength/((a+b)*length));
            positions[link.A]+=correction*a;
            positions[link.B]-=correction*b;
        }

        private Vector3 Sweep(Vector3 from,Vector3 to)
        {
            var stop=Cast(from,to,out var normal);
            if (normal.sqrMagnitude<.5f) return stop;
            var slide=Vector3.ProjectOnPlane(to-stop,normal);
            return Cast(stop,stop+slide,out _);
        }

        private Vector3 Cast(Vector3 from,Vector3 to,out Vector3 normal)
        {
            normal=Vector3.zero;
            var delta=to-from;
            var distance=delta.magnitude;
            if (distance<.0001f) return to;
            var direction=delta/distance;
            var hitCount=Physics.SphereCastNonAlloc(from,Radius,direction,contacts,distance,~0,QueryTriggerInteraction.Ignore);
            for(var i=0;i<hitCount;i++)
            {
                var hit=contacts[i];
                if (hit.collider&&hit.collider.attachedRigidbody&&
                    hit.collider.attachedRigidbody.GetComponent<BedroomProp>()?.SoftBody==Item) continue;
                if (Vector3.Dot(hit.normal,direction)>=-.035f||hit.distance>distance+.0007f) continue;
                distance=Mathf.Max(0,hit.distance-.0007f);
                normal=hit.normal;
            }
            return from+direction*distance;
        }

        private void Dress()
        {
            for(var i=0;i<9;i++)
            {
                if (Pinned(i)) continue;
                var row=i/3;
                var column=i%3;
                var right=positions[row*3+Mathf.Min(2,column+1)]-positions[row*3+Mathf.Max(0,column-1)];
                var forward=positions[Mathf.Min(2,row+1)*3+column]-positions[Mathf.Max(0,row-1)*3+column];
                var up=Vector3.Cross(forward,right);
                var rotation=up.sqrMagnitude>.0000001f?Quaternion.LookRotation(forward,up):Bones[i].rotation;
                Bones[i].SetPositionAndRotation(positions[i],rotation);
            }
        }
    }
}
