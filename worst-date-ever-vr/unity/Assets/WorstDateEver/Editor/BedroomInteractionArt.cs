using UnityEditor.Events;
using UnityEngine;

namespace WorstDateEver.Editor
{
    public static partial class BuildBedroom
    {
        private const float DoorLeft = 1.10f, DoorRight = 2.00f;

        private static BedroomPull GuidedProp(string name, Vector3 position, Vector3 size, Color color,
            Transform parent = null, PrimitiveType shape = PrimitiveType.Cube)
        {
            var anchor = new GameObject(name + " • base").transform;
            anchor.position = position;
            if (parent) anchor.SetParent(parent, true);
            var prop = Prop(name, position, size, color, true, shape);
            prop.GetComponent<Rigidbody>().useGravity = false;
            if (parent) prop.transform.SetParent(parent, true);
            var pull = prop.gameObject.AddComponent<BedroomPull>();
            pull.Anchor = anchor;
            return pull;
        }

        private static void AddLampCord(BedroomController game)
        {
            var shade = new Vector3(1.27f, 1.27f, -.18f);
            var pull = GuidedProp("Ponta do cordão", shade + Vector3.down * .16f,
                new(.028f,.054f,.028f), Brass, shape: PrimitiveType.Sphere);
            pull.Travel = .11f;
            var grip = pull.GetComponent<BoxCollider>();
            grip.size = new(.056f,.064f,.056f);
            var cord = new GameObject("Cordão trançado").AddComponent<LineRenderer>();
            cord.sharedMaterial = Painted(new Color(.23f,.18f,.13f));
            cord.startWidth = cord.endWidth = .005f;
            cord.positionCount = 2;
            cord.useWorldSpace = false;
            cord.transform.position = shade;
            cord.SetPosition(0,Vector3.zero);
            cord.SetPosition(1,pull.transform.position-shade);
            pull.Cord = cord;
            UnityEventTools.AddPersistentListener(pull.Pulled, game.ToggleLamp);

        }

        private static void BuildDoor(Color trim, BedroomController game)
        {
            var center = (DoorLeft + DoorRight) * .5f;
            var hinge = new GameObject("Dobradiças da porta").transform;
            hinge.position = new(DoorRight-.024f,0,3.335f);
            var control = hinge.gameObject.AddComponent<BedroomDoor>();
            foreach (var edge in new[] { DoorLeft, DoorRight })
                Rounded("Guarnição da porta", new(edge,1.09f,3.33f), new(.069f,2.18f,.18f), .014f, trim);
            Rounded("Guarnição superior", new(center,2.165f,3.33f), new(.98f,.075f,.18f), .014f, trim);
            var door = Rounded("Folha da porta",new(center,1.075f,3.32f),new(.85f,2.12f,.071f),.011f,SlateTeal,true);
            ApplySurface(door,"Powdercoat",SlateTeal,new(.90f,.90f),.34f,.21f);
            door.transform.SetParent(hinge,true);
            foreach (var y in new[] { .58f,1.52f })
            {
                var panel = Rounded("Painel da porta",new(center,y,3.278f),new(.64f,.69f,.033f),.009f,new(.32f,.45f,.45f));
                ApplySurface(panel,"Powdercoat",new(.32f,.45f,.45f),new(.90f,.90f),.25f,.21f);
                panel.transform.SetParent(hinge,true);
            }
            var handleStart = new Vector3(DoorLeft+.14f,1.02f,3.23f);
            Rounded("Espelho de metal da fechadura", handleStart + Vector3.forward * .045f,
                new(.055f,.116f,.031f), .021f, Charcoal).transform.SetParent(hinge, true);
            var lever = GuidedProp("Maçaneta", handleStart + Vector3.right * .050f,
                new(.133f,.027f,.044f), Brass, hinge);
            lever.Travel = .057f;
            lever.LeverAxis = Vector3.forward;
            lever.LeverAngle = -24f;
            control.Handle = lever;
            UnityEventTools.AddPersistentListener(lever.Pulled, control.ReleaseLatch);
            UnityEventTools.AddPersistentListener(control.Opened, game.DoorOpened);

            Block("Piso do corredor", new(center,-.08f,3.87f), new(.91f,.16f,1.0f), Wood);
            Block("Fundo do corredor", new(center,1.36f,4.37f), new(1.03f,2.72f,.12f), Charcoal);
            Block("Retorno do corredor", new(2.08f,1.36f,3.89f), new(.17f,2.72f,1.08f), Wood);
            Lighting("Luz do corredor", new(center,1.90f,3.88f), LightType.Point, new(1f,.70f,.47f), .35f, 1.05f);
        }

        private static void BuildCabinet(BedroomController game, Color timber)
        {
            var center = new Vector3(.45f,0,2.80f);
            foreach (var side in new[] { -.35f,.35f })
                Rounded("Lateral do armário", center + new Vector3(side,.43f,0), new(.040f,.85f,.55f), .016f, SlateTeal,true);
            Rounded("Tampo do armário", center + Vector3.up * .825f, new(.74f,.055f,.55f), .021f, SlateTeal,true);
            Rounded("Base do armário", center + Vector3.up * .123f, new(.70f,.05f,.54f), .019f, SlateTeal,true);
            Rounded("Divisória", center + Vector3.up * .465f, new(.70f,.035f,.54f), .009f, SlateTeal,true);
            Rounded("Fundo do armário", center + new Vector3(0,.431f,.24f), new(.70f,.65f,.035f), .009f, Charcoal,true);
            for (var i = 0; i < 2; i++)
            {
                var position = center + new Vector3(0,.30f+i*.34f,-.29f);
                var size = new Vector3(.64f,.27f,.30f);
                var drawer = Drawer("Gaveta do armário", position + Vector3.back * .025f, size, Wood, .33f);
                var board = Rounded("Frente de nogueira",position,new(.69f,.27f,.052f),.007f,timber);
                ApplySurface(board,"Walnut",new(.78f,.66f,.54f),new(1.1f,1.1f),.72f,.24f);
                board.transform.SetParent(drawer.SlidingBox.transform,true);
                var bounds=board.GetComponent<Renderer>().bounds;
                AddDrawerWalls(drawer.SlidingBox.transform,position+Vector3.back*.025f,size,bounds,timber,Linen);
                DrawerFaceCollider(drawer.SlidingBox.transform,bounds);
                if (i == 1) AddSpringToy(drawer,position,size,game);
                else HookLoad(drawer,BuildWardrobe(game,drawer.SlidingBox.GetComponent<BedroomDrawerTray>()));
            }
        }

        private static void AddSoftFabrics(float mattressTop)
        {
            var pillowSize = new Vector3(.55f,.166f,.39f);
            for (var i = 0; i < 2; i++)
            {
                var position = new Vector3(.62f+i*.62f,mattressTop+.112f,-1.75f);
                var pillow = Prop("Travesseiro de linho",position,pillowSize,i==0 ? Linen : SlateTeal,false);
                Rounded("Costura", position, new(.552f,.008f,.392f),.004f,i==0 ? Paper : Teal)
                    .transform.SetParent(pillow.transform,true);
                MakeFlexible(pillow,pillowSize,FilledLinen,"Pillow");
                pillow.transform.rotation = Quaternion.Euler(0,-7+i*15,0);
            }

            var size = new Vector3(.41f,.088f,.33f);
            var hoodie = Prop("Moletom dobrado",new(.82f,mattressTop+.075f,-.91f),size,Clay,false);
            for (var i = -1; i <= 1; i += 2)
                Rounded("Manga do moletom",hoodie.transform.position+new Vector3(i*.126f,.048f,.034f),
                    new(.112f,.036f,.23f),.018f,Clay).transform.SetParent(hoodie.transform,true);
            var at = hoodie.transform.position;
            Rounded("Capuz dobrado",at+new Vector3(0,.045f,.093f),new(.18f,.043f,.114f),.015f,new(.55f,.3f,.27f))
                .transform.SetParent(hoodie.transform,true);
            Rounded("Forro do capuz",at+new Vector3(0,.065f,.088f),new(.104f,.005f,.060f),.002f,Charcoal)
                .transform.SetParent(hoodie.transform,true);
            Rounded("Bolso canguru",at+new Vector3(0,.049f,-.08f),new(.188f,.010f,.105f),.004f,new(.57f,.31f,.28f))
                .transform.SetParent(hoodie.transform,true);
            foreach (var side in new[] {-1f,1f})
            {
                var drawstring = Rounded("Cordão do capuz",at+new Vector3(side*.031f,.049f,.012f),
                    new(.005f,.006f,.078f),.002f,Paper);
                drawstring.transform.rotation=Quaternion.Euler(0,side*13,0);
                drawstring.transform.SetParent(hoodie.transform,true);
            }
            MakeFlexible(hoodie,size,HeavyKnit,"DetailedKnit");
        }
    }
}
