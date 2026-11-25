using UnityEngine;

namespace WorstDateEver
{
    public sealed class BedroomStreet : MonoBehaviour
    {
        [System.Serializable]
        public sealed class Signal
        {
            public Renderer Red, Amber, Green;
        }

        [System.Serializable]
        public sealed class Vehicle
        {
            public Transform Root;
            public Transform[] Wheels;
            public Renderer[] RearLights,Headlights;
            public Vector3[] Route;
            public float Stop,Initial,TopSpeed = 4.2f,WheelRadius = .27f;
            [System.NonSerialized] public float Distance,Speed,WheelAngle,Length;
            [System.NonSerialized] public bool Braking;
        }

        [System.Serializable]
        public sealed class Walker
        {
            public Transform Root;
            public GameObject Model;
            public AnimationClip Walk;
            public Vector3[] Route;
            public float Phase,Rest,Speed;
            public bool Postal;
            [System.NonSerialized] public float Length;
        }

        public BedroomWindowView Window;
        public Signal[] Signals;
        public Vehicle[] Vehicles;
        public Walker[] Walkers;
        private float elapsed, walkSample;
        private int lastStage = -1;
        private MaterialPropertyBlock lights;

        private void Awake()
        {
            lights = new MaterialPropertyBlock();
            foreach (var car in Vehicles)
            {
                car.Distance = car.Initial;
                car.Speed = car.TopSpeed;
                car.Length = RouteLength(car.Route,true);
            }
            foreach (var walker in Walkers)
                walker.Length = RouteLength(walker.Route,false);
        }

        private void Update() => Advance(Mathf.Min(Time.deltaTime,.05f));

        public void Advance(float delta)
        {
            elapsed += delta;
            var stage = Mathf.Repeat(elapsed,29f) switch
            {
                < 18f => 0,
                < 20f => 1,
                _ => 2
            };
            if (stage != lastStage)
            {
                lastStage = stage;
                foreach (var light in Signals)
                {
                    SetLamp(light.Red,new Color(.85f,.11f,.07f),stage==2);
                    SetLamp(light.Amber,new Color(1f,.61f,.10f),stage==1);
                    SetLamp(light.Green,new Color(.16f,.75f,.38f),stage==0);
                }
            }

            var night = Window.Current == WindowTime.Night;
            foreach (var car in Vehicles) Drive(car,delta,stage==0,night);

            walkSample += delta;
            var sample = walkSample >= 1f/24f;
            if (sample) walkSample = 0;
            foreach (var walker in Walkers) Walk(walker,sample);
        }

        private void Drive(Vehicle car,float dt,bool allowed,bool night)
        {
            var approach = Mathf.Repeat(car.Stop-car.Distance,car.Length);
            var stopping = !allowed && approach < 12f;
            var target = stopping ? Mathf.Min(car.TopSpeed,Mathf.Sqrt(5.7f*approach)) : car.TopSpeed;
            var speed = Mathf.MoveTowards(car.Speed,target,dt*(target < car.Speed ? 5.6f : 2.35f));
            var step = speed*dt;
            var reachedStop = stopping && step >= approach;
            if (reachedStop)
            {
                step = approach;
                speed = 0;
            }
            car.Braking = speed < car.Speed-.015f || stopping && speed<.15f;
            car.Speed = speed;
            car.Distance = reachedStop ? car.Stop : Mathf.Repeat(car.Distance+step,car.Length);
            var center = RoutePoint(car.Route,car.Distance,true,out var heading);
            var lookAhead=RoutePoint(car.Route,Mathf.Repeat(car.Distance+.6f,car.Length),true,out _);
            car.Root.SetPositionAndRotation(center,Quaternion.LookRotation((lookAhead-center).sqrMagnitude>.01f ? lookAhead-center : heading));
            car.WheelAngle = Mathf.Repeat(car.WheelAngle+step/car.WheelRadius*Mathf.Rad2Deg,360f);
            foreach (var wheel in car.Wheels) wheel.localRotation = Quaternion.AngleAxis(car.WheelAngle,Vector3.right);
            foreach (var rear in car.RearLights) SetLamp(rear,new Color(1f,.14f,.08f),car.Braking||night);
            foreach (var front in car.Headlights) SetLamp(front,new Color(1f,.91f,.66f),night);
        }

        private void Walk(Walker walker,bool sample)
        {
            var travel=walker.Length/walker.Speed;
            var time=Mathf.Repeat(elapsed+walker.Phase,travel+walker.Rest);
            var visible=time<travel;
            if (walker.Root.gameObject.activeSelf!=visible) walker.Root.gameObject.SetActive(visible);
            if (!visible) return;
            var distance=time*walker.Speed;
            var p=RoutePoint(walker.Route,distance,false,out var direction);
            var lookAhead=RoutePoint(walker.Route,distance+.38f,false,out _);
            walker.Root.SetPositionAndRotation(p,Quaternion.LookRotation((lookAhead-p).sqrMagnitude>.01f ? lookAhead-p : direction));
            if (sample && walker.Walk)
                walker.Walk.SampleAnimation(walker.Model,Mathf.Repeat(distance/(walker.Postal ? 1.13f : 1.24f),walker.Walk.length));
        }

        public static float RouteLength(Vector3[] route,bool closed)
        {
            var length=0f;
            for (var i=0;i<route.Length-(closed?0:1);i++)
                length+=Vector3.Distance(route[i],route[(i+1)%route.Length]);
            return length;
        }

        public static Vector3 RoutePoint(Vector3[] route,float distance,bool closed,out Vector3 heading)
        {
            heading=Vector3.forward;
            for (var i=0;i<route.Length-(closed?0:1);i++)
            {
                var a=route[i];
                var segment=route[(i+1)%route.Length]-a;
                var length=segment.magnitude;
                if (length<.0001f) continue;
                heading=segment/length;
                if (distance<=length) return a+heading*distance;
                distance-=length;
            }
            return closed ? route[0] : route[route.Length-1];
        }

        public static float RouteDistance(Vector3[] route,Vector3 point)
        {
            var bestDistance=float.PositiveInfinity;
            var bestRoute=0f;
            var distance=0f;
            for (var i=0;i<route.Length;i++)
            {
                var segment=route[(i+1)%route.Length]-route[i];
                var length=segment.magnitude;
                var along=Mathf.Clamp(Vector3.Dot(point-route[i],segment/length),0,length);
                var error=(route[i]+segment*(along/length)-point).sqrMagnitude;
                if (error<bestDistance)
                {
                    bestDistance=error;
                    bestRoute=distance+along;
                }
                distance+=length;
            }
            return bestRoute;
        }

        private void SetLamp(Renderer renderer,Color color,bool lit)
        {
            lights.SetColor("_Color",lit ? color : color*.23f);
            renderer.SetPropertyBlock(lights);
        }
    }
}
