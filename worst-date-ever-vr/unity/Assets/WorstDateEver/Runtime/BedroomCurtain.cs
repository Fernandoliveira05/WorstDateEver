using UnityEngine;

namespace WorstDateEver
{
    public sealed class BedroomCurtain : MonoBehaviour
    {
        public const int Columns = 25;
        public const int Rows = 43;
        public MeshFilter[] Panels;
        private Fabric[] fabric;
        private BedroomHandContacts hands;
        private readonly Vector3[] lastContact=new Vector3[2];
        private readonly bool[] tracked=new bool[2];

        private void Awake()
        {
            hands = new BedroomHandContacts();
            fabric = new Fabric[Panels.Length];
            for (var i=0; i<Panels.Length; i++) fabric[i] = new Fabric(Panels[i]);
        }

        public void Touch(Vector3 point,float force)
        {
            foreach (var part in fabric)
                if (part.Near(point,.13f)) part.Disturb(point,Mathf.Clamp(force,-.36f,.36f),true);
        }

        private void LateUpdate()
        {
            var dt = Mathf.Min(Time.deltaTime,.026f);
            for (var hand=0; hand<2; hand++)
            {
                if (!hands.TryGetPosition(hand,out var point)) { tracked[hand]=false; continue; }
                var speed=tracked[hand]?point.z-lastContact[hand].z:0;
                tracked[hand]=true;
                lastContact[hand]=point;
                foreach (var part in fabric)
                {
                    if (!part.Near(point,.115f)) continue;
                    part.Disturb(point,Mathf.Clamp(speed*3.4f,-.105f,.105f),false);
                }
            }
            foreach (var part in fabric) part.Step(dt);
        }

        private void OnDestroy()
        {
            if (fabric == null) return;
            foreach (var part in fabric) Destroy(part.Mesh);
        }

        private sealed class Fabric
        {
            public readonly Transform Transform;
            public readonly Mesh Mesh;
            private readonly Vector3[] rest,vertices;
            private readonly float[] lift,speed,next,contact;
            private readonly Bounds widthHeight;
            private bool moving;

            public Fabric(MeshFilter filter)
            {
                Transform = filter.transform;
                Mesh = Instantiate(filter.sharedMesh);
                Mesh.MarkDynamic();
                filter.sharedMesh = Mesh;
                rest = Mesh.vertices;
                vertices = (Vector3[])rest.Clone();
                lift = new float[rest.Length];
                speed = new float[rest.Length];
                next = new float[rest.Length];
                contact = new float[rest.Length];
                widthHeight = Mesh.bounds;
                var enlarged = widthHeight;
                enlarged.Expand(new Vector3(.28f,.04f,.55f));
                Mesh.bounds = enlarged;
            }

            public bool Near(Vector3 point,float radius)
            {
                var p = Transform.InverseTransformPoint(point);
                return p.x >= widthHeight.min.x-radius && p.x <= widthHeight.max.x+radius &&
                    p.y >= widthHeight.min.y-radius && p.y <= widthHeight.max.y+radius && Mathf.Abs(p.z)<.23f;
            }

            public void Disturb(Vector3 point,float force,bool impulse)
            {
                var local = Transform.InverseTransformPoint(point);
                const float radius = .17f;
                var r2 = radius*radius;
                for (var i=Columns; i<rest.Length; i++)
                {
                    var distance = new Vector2(rest[i].x-local.x,rest[i].y-local.y).sqrMagnitude;
                    if (distance >= r2) continue;
                    var weight = 1f-distance/r2;
                    var bump = force*weight*weight;
                    if (impulse) speed[i] += bump;
                    else contact[i] += bump;
                    moving = true;
                }
            }

            public void Step(float dt)
            {
                if (!moving || dt <= 0) return;
                dt=Mathf.Min(dt,.014f);
                var changes=0f;
                for (var r=1; r<Rows; r++)
                for (var c=0; c<Columns; c++)
                {
                    var i = r*Columns+c;
                    var adjacent = lift[i-Columns]+lift[r+1<Rows ? i+Columns : i]
                        +lift[c>0 ? i-1 : i]+lift[c+1<Columns ? i+1 : i];
                    var tension=(adjacent*.25f-lift[i])*460f;
                    speed[i]=Mathf.Clamp(speed[i]+(tension-lift[i]*58f-speed[i]*7.5f)*dt+contact[i],-.38f,.38f);
                    contact[i] = 0;
                    next[i]=Mathf.Clamp(lift[i]+speed[i]*dt,-.046f,.046f);
                    changes = Mathf.Max(changes,Mathf.Abs(next[i])+Mathf.Abs(speed[i])*.04f);
                }
                for(var pass=0;pass<3;pass++)
                    for(var i=Columns;i<next.Length;i++)
                    {
                        Smooth(i,i-Columns);
                        if (i%Columns>0) Smooth(i,i-1);
                    }
                moving=changes>.0006f;
                for (var i=Columns; i<vertices.Length; i++)
                {
                    lift[i] = moving ? next[i] : 0;
                    if (!moving) speed[i] = 0;
                    var drape = (i/Columns)/(float)(Rows-1);
                    var z = lift[i];
                    vertices[i] = rest[i]+new Vector3(Mathf.Sin(i%Columns*.29f)*z*.28f*drape,
                        z*z*.57f*drape,z);
                }
                Mesh.vertices = vertices;
                Mesh.RecalculateNormals();
            }

            private void Smooth(int a,int b)
            {
                var edge=rest[a]-rest[b];
                var limit=new Vector2(edge.x,edge.y).magnitude*.43f;
                var difference=next[a]-next[b];
                var excess=difference-Mathf.Clamp(difference,-limit,limit);
                next[a]-=excess*(b<Columns?1f:.5f);
                if (b>=Columns) next[b]+=excess*.5f;
            }
        }
    }
}
