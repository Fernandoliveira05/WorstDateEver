using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace WorstDateEver.Editor
{
    public static partial class BuildBedroom
    {
        private static readonly Color Asphalt = new(.40f,.42f,.43f);
        private static readonly Color Concrete = new(.73f,.67f,.58f);
        private static readonly Color StreetGreen = new(.45f,.58f,.41f);

        private const float StreetHeight = -.239f;
        private const float WalkHeight = -.159f;
        private const float RoadHalfWidth = 2.15f;
        private const float WalkWidth = 2.10f;
        private const float FrontRoad = 7.70f;
        private const float BackRoad = -7.95f;
        private const float AccessLeft = .82f;
        private const float AccessRight = 4.28f;

        private static void BuildNeighborhood(BedroomWindowView view,List<Renderer> windows)
        {
            var neighborhood = new GameObject("Bairro ao redor da casa").AddComponent<BedroomStreet>();
            neighborhood.Window = view;
            var scene = neighborhood.gameObject.scene;
            var outside = scene.GetRootGameObjects().ToHashSet();

            DressPlayerHouseRoof();
            StreetSurface("Quadra do bairro",new(0,-.317f,1.3f),new(61,.142f,63),"Concrete",StreetGreen,.34f);
            var center = BlockRoute();
            RoadRibbon("Rua em torno da quadra",center,-RoadHalfWidth,RoadHalfWidth,StreetHeight,"Asphalt",Asphalt,.72f);
            foreach (var side in new[] { -1,1 })
            {
                var edge = side*RoadHalfWidth;
                var lawn = edge+side*WalkWidth;
                RoadRibbon("Calçada larga "+side,center,Mathf.Min(edge,lawn),Mathf.Max(edge,lawn),
                    WalkHeight,"Concrete",Concrete,.46f);
                RoadRibbon("Meio-fio "+side,center,edge,edge,WalkHeight,"Concrete",Concrete*.85f,.46f);
            }

            BuildAccessRoad();

            foreach (var mark in new[] { -5.3f,-3.7f,-2.1f,2.1f,3.7f,5.3f })
                Block("Faixa central",new(mark,StreetHeight+.004f,FrontRoad),new(.58f,.005f,.058f),Paper,false);
            for (var stripe=0; stripe<11; stripe++)
                Block("Faixa de pedestres",new(.20f,StreetHeight+.004f,FrontRoad-1.94f+stripe*.388f),
                    new(1.12f,.006f,.19f),Paper,false);
            Block("Linha de retenção",new(-1.22f,StreetHeight+.004f,FrontRoad-.99f),new(.067f,.007f,1.74f),Paper,false);
            Block("Linha de retenção",new(1.62f,StreetHeight+.004f,FrontRoad+.99f),new(.067f,.007f,1.74f),Paper,false);

            Storefront(new(-3.80f,-.218f,13.76f),false);
            Storefront(new(3.84f,-.218f,13.94f),true);
            Plaza(new(.15f,-.239f,13.26f));
            ExteriorHouse(new(-8.25f,-.239f,15.21f),1.11f,new(.77f,.65f,.49f),new(.52f,.31f,.28f),windows);
            ExteriorHouse(new(8.55f,-.239f,15.85f),1.16f,new(.69f,.67f,.56f),new(.35f,.42f,.43f),windows);
            FrontPath(-8.25f,12.5f,14.39f);
            FrontPath(8.55f,12.5f,14.95f);
            var housePaints = new[] { new Color(.63f,.67f,.56f),new Color(.76f,.62f,.51f),new Color(.62f,.67f,.72f) };
            for (var i=0; i<3; i++)
            {
                var z = -4f+i*4.30f;
                var tint = housePaints[i];
                ArrangeRoots(scene,Vector3.zero,new Vector3(-15.28f,-.239f,z),-90,
                    () => ExteriorHouse(Vector3.zero,1.03f,tint,new Color(.49f,.36f,.31f),windows));
                ArrangeRoots(scene,Vector3.zero,new Vector3(15.38f,-.239f,z),90,
                    () => ExteriorHouse(Vector3.zero,1.04f,tint,new Color(.36f,.42f,.41f),windows));
                var x=new[] { -6.15f,-1.25f,6.62f }[i];
                ArrangeRoots(scene,Vector3.zero,new Vector3(x,-.239f,-14.0f),180,
                    () => ExteriorHouse(Vector3.zero,1.07f,tint,new Color(.48f,.35f,.31f),windows));
                FrontPath(x,-13.20f,-11.92f);
                StreetSurface("Caminho da casa lateral",new(-14.45f,-.218f,z),new(.67f,.052f,.64f),"Concrete",Concrete,.46f);
                StreetSurface("Caminho da casa lateral",new(14.49f,-.218f,z),new(.75f,.052f,.64f),"Concrete",Concrete,.46f);
            }
            for (var i=0; i<6; i++)
            {
                var x = -20.4f+i*8.1f+(i%2)*.7f;
                var tint = housePaints[(i+1)%3];
                ExteriorHouse(new(x,-.239f,21.2f+(i%2)*3.4f),1.16f+(i%3)*.16f,tint,
                    new(.47f,.39f,.36f),windows);
            }
            foreach (var position in new[] { new Vector3(-6.64f,-.239f,13.8f),new(6.76f,-.239f,14.2f),
                new(-11.8f,-.239f,16.4f),new(11.8f,-.239f,18.3f),new(-15.8f,-.239f,-.04f),
                new(15.65f,-.239f,-6.78f),new(-9.7f,-.239f,-12.7f),new(-2.67f,-.239f,-12.8f) })
                ExteriorTree(position,1.08f+Mathf.Abs(Mathf.Sin(position.x))*.34f);

            neighborhood.Signals = new[] {
                StreetSignal(new(-1.50f,WalkHeight,5.39f),-60),
                StreetSignal(new(1.88f,WalkHeight,9.92f),120)
            };
            var lanes = new[] {
                OffsetRoute(center,-.98f,StreetHeight),
                OffsetRoute(center,.98f,StreetHeight).Reverse().ToArray()
            };
            neighborhood.Vehicles = new[] {
                StreetCar("Sedan",lanes[0],new Vector3(-1.22f,StreetHeight,FrontRoad-.98f),5.1f,3.30f),
                StreetCar("Hatchback",lanes[1],new Vector3(1.62f,StreetHeight,FrontRoad+.98f),29f,3.12f)
            };

            // Separate walking lines on the outer pavement. Trips start and finish out of the bedroom's view.
            var outerLane = OffsetRoute(center,4.01f,WalkHeight);
            var curbLane = OffsetRoute(center,2.65f,WalkHeight);
            neighborhood.Walkers = new[] {
                StreetWalker("Pedestre de casaco","Caio",Trip(outerLane,35,21),13f,16f,false),
                StreetWalker("Pedestre com bolsa","Bia",Trip(curbLane,34,22).Reverse().ToArray(),19f,19f,false),
                StreetWalker("Carteiro","FormalMan",Trip(OffsetRoute(center,3.33f,WalkHeight),35,20).Reverse().ToArray(),4f,29f,true),
                StreetWalker("Pedestre da rua lateral","Rafa",Trip(OffsetRoute(center,-3.49f,WalkHeight),15,23),6f,20f,false)
            };

            BuildStreetLights(view, center);
            foreach (var root in scene.GetRootGameObjects().Where(g=>!outside.Contains(g)))
                root.transform.SetParent(neighborhood.transform,true);
        }

        // Clockwise from the bedroom's left side. Starting points for pedestrian trips refer to this shared curb.
        private static Vector3[] BlockRoute()
        {
            const int steps = 8;
            const float radius = 4.85f;
            var corners = new[] { new Vector2(-5.15f,FrontRoad-radius),new(5.15f,FrontRoad-radius),
                new(5.15f,BackRoad+radius),new(-5.15f,BackRoad+radius) };
            var points = new List<Vector3>();
            for (var corner=0;corner<corners.Length;corner++)
            for (var i=0;i<=steps;i++)
            {
                var angle=(180f-corner*90f-i*90f/steps)*Mathf.Deg2Rad;
                var c=corners[corner];
                points.Add(new(c.x+Mathf.Cos(angle)*radius,0,c.y+Mathf.Sin(angle)*radius));
            }
            return points.ToArray();
        }

        private static Vector3[] OffsetRoute(Vector3[] route,float offset,float height)
        {
            var points = new Vector3[route.Length];
            for (var i=0;i<route.Length;i++)
            {
                var incoming = (route[i]-route[(i+route.Length-1)%route.Length]).normalized;
                var outgoing = (route[(i+1)%route.Length]-route[i]).normalized;
                var outside = Vector3.Cross((incoming+outgoing).normalized,Vector3.up);
                points[i]=route[i]+outside*offset+Vector3.up*height;
            }
            return points;
        }

        private static Vector3[] Trip(Vector3[] route,int start,int end)
        {
            var points = new List<Vector3> { route[start] };
            while (start != end)
            {
                start=(start+1)%route.Length;
                points.Add(route[start]);
            }
            return points.ToArray();
        }

        private static void RoadRibbon(string label,Vector3[] center,float a,float b,float height,
            string map,Color tint,float textureStrength)
        {
            var kerb = Mathf.Approximately(a,b);
            var near = OffsetRoute(center,a,kerb ? StreetHeight : height);
            var far = OffsetRoute(center,b,height);
            var vertices = new List<Vector3>();
            var indices = new List<int>();
            for (var i=0;i<center.Length;i++)
            {
                var next=(i+1)%center.Length;
                var access=a>=RoadHalfWidth && Mathf.Approximately(center[i].z,BackRoad) &&
                    Mathf.Approximately(center[next].z,BackRoad) && center[i].x>AccessRight && center[next].x<AccessLeft;
                if (access)
                {
                    AddSegment(0,Mathf.InverseLerp(center[i].x,center[next].x,AccessRight));
                    AddSegment(Mathf.InverseLerp(center[i].x,center[next].x,AccessLeft),1);
                }
                else AddSegment(0,1);

                void AddSegment(float from,float to)
                {
                    var k=vertices.Count;
                    vertices.AddRange(new[] {
                        Vector3.Lerp(near[i],near[next],from),Vector3.Lerp(far[i],far[next],from),
                        Vector3.Lerp(near[i],near[next],to),Vector3.Lerp(far[i],far[next],to)
                    });
                    if (a<0 && kerb) indices.AddRange(new[] {k,k+2,k+1,k+1,k+2,k+3});
                    else indices.AddRange(new[] {k,k+1,k+2,k+1,k+3,k+2});
                }
            }
            var path=$"{Root}/Meshes/Street-{(kerb ? "kerb" : map)}-{Mathf.Sign(a)}.asset";
            var mesh=RefreshStreetMesh(path,label,vertices,indices);
            var root=new GameObject(label).transform;
            ApplySurface(MeshPart(label,root,mesh,tint),map,tint,new(.63f,.63f),textureStrength,map=="Asphalt" ? .27f : .12f);
        }

        private static void BuildAccessRoad()
        {
            const float end = -29.2f;
            const float width = AccessRight-AccessLeft;
            var edge=BackRoad-RoadHalfWidth;
            var at=new Vector3((AccessLeft+AccessRight)*.5f,StreetHeight-.027f,(edge+end)*.5f);
            StreetSurface("Rua de acesso ao bairro",at,new(width,.05f,edge-end+.02f),"Asphalt",Asphalt,.72f);
            foreach (var x in new[] { AccessLeft-.52f,AccessRight+.52f })
                StreetSurface("Calçada da rua de acesso",new(x,WalkHeight-.045f,at.z),new(1.10f,.09f,edge-end),
                    "Concrete",Concrete,.46f);
            for (var z= -26f;z<edge-1.4f;z+=2.3f)
                Block("Divisão da rua de acesso",new(at.x,StreetHeight+.002f,z),new(.050f,.004f,.59f),Paper,false);
            Block("Linha de retenção da rua de acesso",new(at.x+.78f,StreetHeight+.003f,edge-.34f),
                new(1.40f,.005f,.060f),Paper,false);
        }

        private static void FrontPath(float x,float from,float to)
        {
            StreetSurface("Caminho da entrada",new(x,-.221f,(from+to)*.5f),new(.63f,.049f,to-from),"Concrete",Concrete,.43f);
        }

        private static Mesh RefreshStreetMesh(string path,string name,List<Vector3> vertices,List<int> indices)
        {
            var mesh=AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (!mesh) return SaveMesh(path,name,vertices,indices);
            mesh.Clear();
            mesh.SetVertices(vertices);
            mesh.SetTriangles(indices,0);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            EditorUtility.SetDirty(mesh);
            return mesh;
        }

        private static void Plaza(Vector3 p)
        {
            StreetSurface("Caminho da praça",p+new Vector3(0,.024f,.70f),new(1.75f,.05f,3.85f),"Concrete",Concrete,.48f);
            var bench=new Color(.48f,.34f,.25f);
            for (var i=0;i<3;i++)
            {
                Rounded("Ripa do banco",p+new Vector3(-1.31f,.40f+(i==0?0:.17f+i*.065f),.11f+i*.085f),
                    new(1.16f,.065f,.15f),.013f,bench);
            }
            foreach (var side in new[] { -.44f,.44f })
                Rounded("Pé do banco",p+new Vector3(-1.31f+side,.20f,.14f),new(.08f,.40f,.26f),.015f,Charcoal);
            ExteriorTree(p+new Vector3(1.17f,0,1.60f),1.27f);
            for (var i=0;i<4;i++)
                Orb("Arbusto da praça",p+new Vector3(.61f+i*.34f,.21f,2.73f+Mathf.Sin(i)*.29f),new(.67f,.52f,.76f),StreetGreen);
        }

        private static void DressPlayerHouseRoof()
        {
            var tiles = new Color(.51f,.33f,.28f);
            foreach (var side in new[] {-1f,1f})
            {
                var roof = Rounded("Telhado da casa do jogador",new(side*1.21f,3.46f,.55f),
                    new(2.75f,.13f,6.08f),.022f,tiles);
                roof.transform.rotation=Quaternion.Euler(0,0,side*-24f);
                ApplySurface(roof,"RoofTiles",tiles,new(.91f,.91f),.71f,.14f);
                var gutter = Rounded("Calha da casa",new(side*2.47f,2.951f,.55f),new(.092f,.082f,6.12f),.019f,Charcoal);
                ApplySurface(gutter,"Powdercoat",Charcoal,new(2,2),.22f,.21f);
            }
            Rounded("Cumeeira da casa",new(0,4.046f,.55f),new(.16f,.10f,6.10f),.032f,tiles);
            foreach (var z in new[] {-2.31f,3.41f})
            {
                var point = new Vector3(0,2.966f,z);
                var vertices = new List<Vector3> { new(-2.30f,0,-.025f),new(2.30f,0,-.025f),new(0,1.07f,-.025f),
                    new(-2.30f,0,.025f),new(2.30f,0,.025f),new(0,1.07f,.025f) };
                var faces = new List<int> { 0,2,1,3,4,5,0,1,4,0,4,3,0,3,5,0,5,2,1,2,5,1,5,4 };
                const string path = Root+"/Meshes/PlayerHouseGable.asset";
                var mesh = AssetDatabase.LoadAssetAtPath<Mesh>(path);
                if (!mesh) mesh=SaveMesh(path,"Empena da casa",vertices,faces);
                var root = new GameObject("Empena externa").transform;
                root.position=point;
                var plaster = new Color(.65f,.55f,.51f);
                var gable = MeshPart("Fechamento do telhado",root,mesh,plaster);
                ApplySurface(gable,"Powdercoat",plaster,new(1,1),.41f,.14f);
            }
        }

        private static void StreetSurface(string label,Vector3 at,Vector3 size,string map,Color tint,float strength)
        {
            ApplySurface(Block(label,at,size,tint,false),map,tint,new Vector2(.69f,.69f),strength,.14f);
        }

        private static void Storefront(Vector3 p,bool postal)
        {
            var trim = postal ? new Color(.70f,.51f,.31f) : new Color(.31f,.50f,.47f);
            var plaster = postal ? new Color(.78f,.68f,.55f) : new Color(.78f,.75f,.65f);
            var warmWood = new Color(.47f,.32f,.24f);
            var walls = new[] {
                (new Vector3(-1.71f,1.31f,.55f),new Vector3(.15f,2.63f,3.15f)),
                (new Vector3(1.71f,1.31f,.55f),new Vector3(.15f,2.63f,3.15f)),
                (new Vector3(0,1.31f,2.05f),new Vector3(3.42f,2.63f,.17f))
            };
            foreach (var (offset, size) in walls)
                ApplySurface(Block("Alvenaria da loja",p+offset,size,plaster,false),"Powdercoat",
                    plaster,new(1.2f,1.2f),.47f,.13f);
            StreetSurface("Piso da loja",p+new Vector3(0,.009f,.55f),new(3.54f,.072f,3.17f),
                "Floorboards",warmWood,.63f);
            StreetSurface("Entrada da loja",p+new Vector3(0,-.004f,-1.33f),new(3.54f,.055f,.77f),
                "Concrete",Concrete,.55f);
            var brick = Rounded("Rodapé de tijolo",p+new Vector3(0,.18f,-1.03f),new(3.54f,.34f,.15f),.008f,Clay);
            ApplySurface(brick,"Brick",new(.85f,.66f,.56f),new(.81f,.93f),.70f,.11f);
            var roof = Rounded("Platibanda",p+new Vector3(0,2.62f,.53f),new(3.64f,.20f,3.35f),.014f,trim);
            ApplySurface(roof,"Powdercoat",trim,new(1,1),.31f,.18f);
            Rounded("Verga da vitrine",p+new Vector3(0,2.31f,-1.03f),new(3.60f,.40f,.20f),.018f,trim);
            for (var i=0;i<12;i++)
            {
                var stripe = i%2==0 ? trim : new Color(.87f,.80f,.65f);
                var awning = Rounded("Lona do toldo",p+new Vector3(-1.65f+i*.30f,2.075f,-1.39f),
                    new(.30f,.045f,.67f),.009f,stripe);
                awning.transform.rotation=Quaternion.Euler(-13,0,0);
                ApplySurface(awning,"Weave",stripe,new(2.5f,2.5f),.23f,.12f);
                Rounded("Saia do toldo",p+new Vector3(-1.65f+i*.30f,1.984f,-1.70f),new(.30f,.11f,.045f),.010f,stripe);
            }

            foreach (var x in new[] { -1.68f,-.46f,.46f,1.68f })
                Rounded("Montante de alumínio",p+new Vector3(x,1.24f,-1.055f),new(.070f,1.79f,.11f),.006f,trim*.68f);
            foreach (var x in new[] { -1.07f,1.07f })
            {
                StoreGlass(p+new Vector3(x,1.25f,-1.065f),new(1.18f,1.80f,.018f));
                Rounded("Travessa da vitrine",p+new Vector3(x,.73f,-1.092f),new(1.19f,.043f,.080f),.004f,trim*.72f);
                Rounded("Peitoril de alumínio",p+new Vector3(x,.343f,-1.107f),new(1.24f,.067f,.16f),.005f,trim);
            }
            StoreGlass(p+new Vector3(0,1.25f,-1.062f),new(.86f,1.70f,.022f));
            foreach (var y in new[] { .38f,1.04f,2.10f })
                Rounded("Travessa da porta de vidro",p+new Vector3(0,y,-1.075f),new(.90f,.050f,.082f),.005f,trim*.72f);
            Rounded("Puxador da porta",p+new Vector3(.29f,1.02f,-1.138f),new(.047f,.27f,.085f),.013f,Brass);
            Rounded("Capacho interno",p+new Vector3(0,.054f,-.78f),new(.82f,.021f,.42f),.008f,Charcoal);

            Rounded("Balcão de atendimento",p+new Vector3(.78f,.50f,.91f),new(1.40f,.91f,.59f),.032f,trim);
            var counter=Rounded("Tampo do balcão",p+new Vector3(.78f,.99f,.91f),new(1.47f,.085f,.66f),.013f,warmWood);
            ApplySurface(counter,"Floorboards",warmWood,new(2,2),.51f,.19f);
            Rounded("Caixa registradora",p+new Vector3(1.11f,1.09f,.81f),new(.31f,.15f,.23f),.016f,Charcoal);
            Rounded("Display da caixa",p+new Vector3(1.11f,1.19f,.85f),new(.229f,.117f,.047f),.009f,SlateTeal);

            var packages = new[] { Clay, Brass, Teal, Linen, new Color(.65f,.52f,.36f) };
            var rack = p+new Vector3(-.97f,0,.37f);
            foreach (var x in new[] { -.57f,.57f })
                Rounded("Estrutura da estante",rack+new Vector3(x,.90f,0),new(.055f,1.67f,.39f),.009f,warmWood);
            for (var shelf=0;shelf<4;shelf++)
            {
                var y=.30f+shelf*.40f;
                Rounded("Prateleira",rack+new Vector3(0,y,0),new(1.20f,.047f,.42f),.006f,warmWood);
                for (var i=0;i<6;i++)
                {
                    var height=.107f+.041f*((shelf*3+i)%4);
                    var color=packages[(i+2*shelf)%packages.Length];
                    var package=rack+new Vector3(-.48f+i*.188f,y+.026f+height*.50f,-.096f+Mathf.Sin(i)*.05f);
                    if (postal || i%3==0)
                    {
                        Rounded(postal ? "Encomenda" : "Caixa de mantimentos",package,new(.135f,height,.115f),.007f,color);
                        Rounded("Fita do pacote",package+new Vector3(.021f,0,-.060f),new(.037f,height*.92f,.006f),.001f,Linen);
                    }
                    else
                    {
                        Shape("Garrafa na prateleira",package,new(.081f,height,.081f),color,PrimitiveType.Cylinder,false);
                        Shape("Tampa de garrafa",package+Vector3.up*(height*.53f),new(.049f,.023f,.049f),
                            color*.77f,PrimitiveType.Cylinder,false);
                    }
                }
            }

            if (postal)
            {
                var mailbox = p+new Vector3(1.95f,.46f,-.84f);
                Rounded("Caixa postal",mailbox,new(.34f,.86f,.30f),.033f,trim);
                Rounded("Fenda de correspondência",mailbox+new Vector3(0,.24f,-.154f),new(.22f,.031f,.02f),.004f,Ink);
                for (var i=0;i<8;i++)
                    Rounded("Nicho de correspondência",p+new Vector3(.17f+i%4*.277f,1.35f+i/4*.243f,1.94f),
                        new(.24f,.196f,.18f),.015f,i%2==0 ? trim : warmWood);
            }
            else
            {
                var tray=p+new Vector3(.97f,.52f,-.63f);
                Rounded("Expositor de frutas",tray,new(.90f,.18f,.38f),.015f,warmWood);
                for (var i=0;i<9;i++)
                    Orb("Fruta no expositor",tray+new Vector3(-.31f+i%5*.15f,.13f,i/5*.14f-.07f),
                        Vector3.one*.115f,packages[i%3]);
            }

            var tube=Rounded("Luminária interna",p+new Vector3(0,2.43f,.52f),new(1.49f,.057f,.149f),.017f,Linen);
            Backdrop(tube,new(.94f,.84f,.64f));
            Lighting("Luz de teto da loja",p+new Vector3(-.22f,2.29f,.06f),LightType.Point,
                new(1f,.83f,.65f),.87f,2.75f);
        }

        private static void StoreGlass(Vector3 at,Vector3 size)
        {
            var pane = Block("Vidro transparente",at,size,Paper,false).GetComponent<Renderer>();
            pane.sharedMaterial=EffectMaterial("ShopGlass");
            pane.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;
        }

        private static BedroomStreet.Signal StreetSignal(Vector3 p,float yaw)
        {
            var unit = new GameObject("Semáforo").transform;
            unit.SetPositionAndRotation(p,Quaternion.Euler(0,yaw,0));
            var pole = Shape("Poste do semáforo",p+Vector3.up*1.20f,new(.067f,2.4f,.067f),Charcoal,PrimitiveType.Cylinder,false);
            pole.transform.SetParent(unit,true);
            var shell = Rounded("Carcaça do semáforo",Vector3.zero,new(.242f,.528f,.14f),.014f,Charcoal);
            shell.transform.SetParent(unit,false);
            shell.transform.localPosition=new(0,2.43f,0);
            Renderer Lens(float y,Color color)
            {
                var glass = Orb("Lente de sinal",Vector3.zero,new(.098f,.098f,.026f),color);
                glass.transform.SetParent(unit,false);
                glass.transform.localPosition=new(0,2.43f+y,-.076f);
                Backdrop(glass,color);
                var visor = Rounded("Pestana da lente",Vector3.zero,new(.124f,.030f,.109f),.012f,Charcoal);
                visor.transform.SetParent(unit,false);
                visor.transform.localPosition=new(0,2.43f+y+.066f,-.062f);
                return glass.GetComponent<Renderer>();
            }
            return new BedroomStreet.Signal
            {
                Red=Lens(.151f,new(.85f,.11f,.07f)),
                Amber=Lens(0,new(1f,.61f,.10f)),Green=Lens(-.151f,new(.16f,.75f,.38f))
            };
        }

        private static BedroomStreet.Vehicle StreetCar(string key,Vector3[] route,Vector3 stop,float progress,float length)
        {
            var car = new GameObject("Trânsito · "+key).transform;
            var path = $"{Root}/Models/Traffic/{key}.glb";
            var asset = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (!asset) throw new System.InvalidOperationException("Modelo de trânsito ausente: "+path);
            var model = (GameObject)PrefabUtility.InstantiatePrefab(asset);
            PrefabUtility.UnpackPrefabInstance(model,PrefabUnpackMode.Completely,InteractionMode.AutomatedAction);
            model.transform.SetParent(car,false);
            var renders = model.GetComponentsInChildren<Renderer>();
            var front = renders.Where(r=>r.name.Contains("Front")&&r.name.Contains("Wheel")).ToArray();
            var rear = renders.Single(r=>r.name.Contains("BackWheels"));
            var frontCenter = front.Select(r=>r.bounds.center).Aggregate(Vector3.zero,(sum,p)=>sum+p)/front.Length;
            var direction = Vector3.ProjectOnPlane(frontCenter-rear.bounds.center,Vector3.up).normalized;
            model.transform.rotation=Quaternion.FromToRotation(direction,Vector3.forward);
            var span=BoundsOf(renders);
            model.transform.localScale*=length/span.size.z;
            span=BoundsOf(renders);
            model.transform.position-=new Vector3(span.center.x,span.min.y,span.center.z);
            var wheels = new List<Transform>();
            foreach (var rolling in front.Append(rear))
            {
                var axle = new GameObject("Eixo · "+rolling.name).transform;
                axle.SetParent(car,false);
                axle.position=rolling.bounds.center;
                rolling.transform.SetParent(axle,true);
                wheels.Add(axle);
            }
            var vehicle = new BedroomStreet.Vehicle
            {
                Root=car,Wheels=wheels.ToArray(),WheelRadius=Mathf.Max(.12f,front[0].bounds.extents.y),
                Route=route,Stop=BedroomStreet.RouteDistance(route,stop)-length*.5f,Initial=progress,TopSpeed=4.5f,
                RearLights=new Renderer[2],Headlights=new Renderer[2]
            };
            for (var i=0; i<2; i++)
            {
                var side=i==0?-1f:1f;
                vehicle.Headlights[i]=VehicleLens(car,new(side*span.extents.x*.75f,span.size.y*.43f,span.extents.z*.981f),Paper);
                vehicle.RearLights[i]=VehicleLens(car,new(side*span.extents.x*.78f,span.size.y*.50f,-span.extents.z*.981f),Clay);
            }
            var point=BedroomStreet.RoutePoint(route,progress,true,out var heading);
            car.SetPositionAndRotation(point,Quaternion.LookRotation(heading));
            return vehicle;
        }

        private static Renderer VehicleLens(Transform car,Vector3 position,Color color)
        {
            var lens=Orb("Luz do carro",Vector3.zero,new(.14f,.064f,.031f),color);
            lens.transform.SetParent(car,false);
            lens.transform.localPosition=position;
            Backdrop(lens,color);
            return lens.GetComponent<Renderer>();
        }

        private static BedroomStreet.Walker StreetWalker(string label,string key,Vector3[] route,float phase,float rest,bool postal)
        {
            var walker = new GameObject(label).transform;
            var model = PlaceCharacter(key,walker,postal ? 1.46f : key=="Bia" ? 1.40f : 1.47f);
            foreach (var node in model.GetComponentsInChildren<Transform>(true)) node.gameObject.layer=0;
            foreach (var skin in model.GetComponentsInChildren<SkinnedMeshRenderer>())
                skin.updateWhenOffscreen=false;
            var clips = AssetDatabase.LoadAllAssetsAtPath($"{CharacterFolder}/{key}.glb").OfType<AnimationClip>().ToArray();
            if (postal) DressPostalWorker(model);
            walker.position=route[0];
            return new BedroomStreet.Walker
            {
                Root=walker,Model=model,Route=route,Postal=postal,Phase=phase,Rest=rest,Speed=postal ? 1.03f : 1.14f,
                Walk=clips.FirstOrDefault(clip=>clip.name.EndsWith("|Walk")||clip.name=="Walk")
            };
        }

        private static void DressPostalWorker(GameObject model)
        {
            var navy = new Color(.28f,.39f,.52f);
            var yellow = new Color(.91f,.73f,.30f);
            var bones=model.GetComponentsInChildren<Transform>();
            var head=bones.FirstOrDefault(t=>t.name=="Head");
            if (head)
            {
                var top = BoundsOf(model.GetComponentsInChildren<Renderer>()).max.y;
                var cap = Orb("Boné do carteiro",new(head.position.x,top-.008f,head.position.z+.011f),
                    new(.221f,.072f,.229f),navy).transform;
                cap.SetParent(head,true);
                Rounded("Aba do boné",cap.position+new Vector3(0,-.027f,.104f),new(.122f,.012f,.090f),.006f,yellow)
                    .transform.SetParent(head,true);
            }
            var chest=bones.FirstOrDefault(t=>t.name=="Chest");
            if (!chest) return;
            var satchel=Rounded("Bolsa postal",chest.position+new Vector3(.257f,-.34f,.044f),new(.168f,.25f,.114f),.013f,navy);
            satchel.transform.SetParent(chest,true);
            Rounded("Aba da bolsa postal",satchel.transform.position+new Vector3(0,.071f,.061f),
                new(.165f,.074f,.010f),.004f,yellow).transform.SetParent(satchel.transform,true);
            var strap=Rounded("Alça da bolsa postal",chest.position+new Vector3(.055f,-.061f,.128f),new(.045f,.60f,.019f),.007f,yellow);
            strap.transform.rotation=Quaternion.Euler(0,0,38);
            strap.transform.SetParent(chest,true);
        }
    }
}
