using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEditor.Events;
using UnityEngine;

namespace WorstDateEver.Editor
{
    public static partial class BuildBedroom
    {
        private static void DressImportedDrawers(GameObject furniture, BedroomController game, bool desk)
        {
            PrefabUtility.UnpackPrefabInstance(furniture, PrefabUnpackMode.Completely, InteractionMode.AutomatedAction);
            var fronts = furniture.GetComponentsInChildren<Transform>()
                .Where(part => part.name.StartsWith("drawer-") && part.name.Length == 8)
                .OrderBy(part => part.position.y).ToArray();
            for (var i = 0; i < fronts.Length; i++)
            {
                var panel = fronts[i];
                var pieces = panel.GetComponentsInChildren<Renderer>();
                var handle = pieces.Single(piece => piece.name.EndsWith("black"));
                var bounds = BoundsOf(pieces.Where(piece => piece != handle).ToArray());
                handle.enabled = false;
                var size = new Vector3(bounds.size.x * .91f, bounds.size.y, desk ? .285f : .27f);
                var front = new Vector3(bounds.center.x, bounds.center.y, bounds.min.z);
                var drawer = Drawer(desk ? "Gaveta da escrivaninha" : "Gaveta do criado-mudo", front, size, Wood,
                    desk ? .32f : .31f);
                panel.SetParent(drawer.SlidingBox.transform, true);
                AddDrawerWalls(drawer.SlidingBox.transform, front, size, bounds, Wood, Linen);
                DrawerFaceCollider(drawer.SlidingBox.transform,bounds);
                if (desk && i == fronts.Length - 1) PackBouncyBalls(drawer, front, size);
                else if (desk && i == 0) AddDrawerOddities(drawer, front, size, 0);
                else AddDrawerOddities(drawer, front, size, desk ? 1 : 2);

                if (!desk) UnityEventTools.AddPersistentListener(drawer.Pulled, game.DrawerOpened);
            }
        }

        private static BedroomPull Drawer(string name, Vector3 front, Vector3 size, Color color, float travel)
        {
            var drawer = GuidedProp(name, front + Vector3.back * .026f,
                new(size.x * .53f, .033f, .043f), color);
            drawer.Axis = Vector3.back;
            drawer.Travel = travel;
            drawer.RetainPosition = true;
            var boxObject = new GameObject(name + " • caixa física");
            boxObject.transform.position = drawer.Anchor.position;
            var box = boxObject.AddComponent<Rigidbody>();
            boxObject.AddComponent<BedroomDrawerTray>();
            ApplySurface(drawer.transform.GetChild(0).gameObject,"Walnut",new(.72f,.60f,.49f),new(1.4f,4),.46f,.25f);
            box.isKinematic = true;
            box.useGravity = false;
            box.interpolation = RigidbodyInterpolation.Interpolate;
            box.collisionDetectionMode = CollisionDetectionMode.ContinuousSpeculative;
            drawer.SlidingBox = box;
            foreach (var side in new[] { -.19f,.19f })
                Rounded("Suporte do puxador", front + new Vector3(size.x * side,0,-.010f),
                    new(.034f,.032f,.039f), .008f, Brass).transform.SetParent(drawer.transform,true);
            return drawer;
        }

        private static void AddDrawerWalls(Transform drawer,Vector3 front,Vector3 size,Bounds face,Color wood,Color lining)
        {
            const float thickness=.016f;
            var baseY=front.y-size.y*.42f;
            var rim=Mathf.Clamp(size.y*.82f,.082f,.155f);
            var tray=drawer.GetComponent<BedroomDrawerTray>();
            var start=Mathf.Max(front.z,face.max.z);
            var back=front.z+size.z;
            var middle=(start+back)*.5f;
            var depth=back-start;
            var floorTop=baseY+thickness*.5f;
            tray.Floor=DrawerBoard("Fundo forrado",drawer,new(front.x,baseY,middle),
                new(size.x,thickness,depth),lining);
            foreach(var side in new[]{-.5f,.5f})
                DrawerBoard("Lateral da caixa",drawer,new(front.x+side*(size.x-thickness),floorTop+rim*.5f,middle),
                    new(thickness,rim,depth),wood);
            DrawerBoard("Travessa da caixa",drawer,new(front.x,floorTop+rim*.5f,back-thickness*.5f),
                new(size.x-2*thickness,rim,thickness),wood);

            var min=new Vector3(front.x-size.x*.5f+thickness,floorTop-.008f,start);
            var max=new Vector3(front.x+size.x*.5f-thickness,floorTop+rim,back-thickness);
            var interior=new Bounds();
            interior.SetMinMax(drawer.InverseTransformPoint(min),drawer.InverseTransformPoint(max));
            tray.Interior=interior;
        }

        private static BoxCollider DrawerBoard(string name, Transform drawer, Vector3 center, Vector3 size, Color color)
        {
            var board = Rounded(name,center,size,.003f,color,true);
            var fabric = name=="Fundo forrado";
            ApplySurface(board,fabric ? "Weave" : "Walnut",color,fabric ? new Vector2(5,5) : new Vector2(1.0f,1.7f),
                fabric ? .44f : .47f,.16f);
            board.transform.SetParent(drawer,true);
            return board.GetComponent<BoxCollider>();
        }

        private static void DrawerFaceCollider(Transform drawer, Bounds face)
        {
            var hit = drawer.gameObject.AddComponent<BoxCollider>();
            hit.center = drawer.InverseTransformPoint(face.center);
            hit.size = face.size;
        }

        private static void PackBouncyBalls(BedroomPull drawer, Vector3 front, Vector3 size)
        {
            var palette = new[] { Teal, Rose, Brass, new Color(.46f,.42f,.59f), new Color(.71f,.36f,.25f) };
            var balls = new List<BedroomProp>();
            var rows = 4;
            var columns = 5;
            var spacing = Mathf.Min((size.x-.028f)/columns, (size.z-.045f)/rows);
            var radius = spacing * .43f;
            var floor = front.y-size.y*.42f+.011f;
            for (var x = 0; x < columns; x++)
            for (var z = 0; z < rows; z++)
            {
                var p = front + new Vector3((x-2)*spacing, floor+radius-front.y, .052f + z*spacing);
                var ball = Prop("Bolinha de borracha", p, Vector3.one * (radius*2), palette[(x+z*3)%palette.Length],
                    false, PrimitiveType.Sphere);
                Object.DestroyImmediate(ball.GetComponent<BoxCollider>());
                var sphere = ball.gameObject.AddComponent<SphereCollider>();
                sphere.radius = radius;
                SetPhysicalMaterial(ball,BouncyRubber);
                balls.Add(ball);
            }
            HookLoad(drawer,balls);
        }

        private static void AddDrawerOddities(BedroomPull drawer, Vector3 front, Vector3 size, int variant)
        {
            var at = front + new Vector3(0,-size.y*.42f+.030f,.108f);
            var item = Prop(variant switch { 0 => "Carimbo de emergência", 1 => "Caixa de dentes de mentira", _ => "Meia sem par" },
                at,new(.10f,.037f,.071f),variant == 2 ? Rose : SlateTeal,false);
            item.transform.GetChild(0).GetComponent<Renderer>().enabled=false;
            if (variant==0)
            {
                DressDrawerStamp(item.transform);
                var grip=item.gameObject.AddComponent<SphereCollider>();
                grip.center=Vector3.up*.035f;
                grip.radius=.024f;
            }
            else if (variant==1) DressDrawerDentures(item.transform);
            else
            {
                DressDrawerSock(item.transform);
                MakeFlexible(item,new Vector3(.116f,.037f,.071f),CottonJersey,"DrawerSock-");
            }
            HookLoad(drawer,new[] { item });
        }

        private static void AddSpringToy(BedroomPull drawer, Vector3 front, Vector3 size, BedroomController game)
        {
            var at = front + new Vector3(.05f,-size.y*.42f+.061f,.115f);
            var toy = Prop("Sapo de mola",at,new(.105f,.106f,.105f),new(.48f,.58f,.29f),false,PrimitiveType.Sphere);
            toy.GetComponent<BoxCollider>().center = Vector3.down*.010f;
            toy.transform.GetChild(0).GetComponent<Renderer>().enabled=false;
            DressDrawerFrog(toy.transform);
            var pop = HookLoad(drawer,new[] { toy },toy);
            drawer.TriggerFraction = .58f;
            UnityEventTools.AddPersistentListener(pop.ToyPopped,game.SpringToyPopped);
        }

        private static BedroomDrawerLoad HookLoad(BedroomPull drawer, IEnumerable<BedroomProp> props, BedroomProp toy = null)
        {
            var load = drawer.gameObject.AddComponent<BedroomDrawerLoad>();
            load.Tray = drawer.SlidingBox.GetComponent<BedroomDrawerTray>();
            load.Contents = props.ToArray();
            load.SpringToy = toy;
            if (toy) UnityEventTools.AddPersistentListener(drawer.Pulled,load.Open);
            return load;
        }
    }
}
