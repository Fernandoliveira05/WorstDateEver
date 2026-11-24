using UnityEditor;
using UnityEditor.Events;
using UnityEngine;

namespace WorstDateEver.Editor
{
    public static partial class BuildBedroom
    {
        private static void BuildComputer(BedroomController game)
        {
            var center = new Vector3(-.87f,1.205f,1.692f);
            var housing = Rounded("Carcaça do monitor",center,new(.527f,.326f,.063f),.009f,Charcoal,true);
            ApplySurface(housing,"Powdercoat",Charcoal,new(3,3),.30f,.29f);
            Rounded("Bisel do monitor",center+Vector3.back*.034f,new(.514f,.31f,.018f),.005f,Ink);
            Rounded("Vidro desligado",center+Vector3.back*.045f+Vector3.up*.012f,
                new(.474f,.266f,.007f),.0025f,new(.073f,.086f,.096f));
            var display = GameObject.CreatePrimitive(PrimitiveType.Quad);
            Object.DestroyImmediate(display.GetComponent<Collider>());
            display.name = "Área ativa do monitor";
            display.transform.position = center+Vector3.back*.050f+Vector3.up*.012f;
            display.transform.localScale = new(.466f,.258f,1);
            game.Monitor = display.GetComponent<Renderer>();
            const string path = Root + "/Materials/MonitorDisplay.mat";
            var lit = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (!lit)
            {
                lit = new Material(Shader.Find("Unlit/Texture"));
                lit.mainTexture = AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/Textures/Desktop.png");
                AssetDatabase.CreateAsset(lit,path);
            }
            game.Monitor.sharedMaterial = lit;

            Rounded("Haste de metal",new(-.87f,1.018f,1.745f),new(.047f,.20f,.047f),.006f,Charcoal);
            Rounded("Pé plano",new(-.87f,.913f,1.745f),new(.225f,.026f,.153f),.008f,Charcoal);
            for (var i=0; i<7; i++)
                Rounded("Respiro traseiro",center+new Vector3((i-3)*.026f,.103f,.035f),
                    new(.016f,.048f,.006f),.002f,Ink);
            var led = new Vector3(-.645f,1.062f,1.648f);
            Orb("LED verde",led,new(.009f,.005f,.003f),new(.52f,.73f,.40f));
            var power = HiddenButton("Botão do monitor",led+Vector3.back*.007f,.041f,.025f);
            UnityEventTools.AddPersistentListener(power.onClick,game.ToggleMonitor);

            var tower = new Vector3(-.708f,.278f,1.765f);
            var shell = Rounded("Gabinete",tower,new(.215f,.536f,.358f),.007f,Charcoal,true);
            ApplySurface(shell,"Powdercoat",new(.26f,.28f,.31f),new(2.5f,2.5f),.48f,.21f);
            Rounded("Painel frontal do gabinete",tower+Vector3.back*.183f,new(.194f,.505f,.012f),.004f,Ink);
            for (var i=0; i<9; i++)
                Rounded("Abertura da grade",tower+new Vector3(0,-.172f+i*.029f,-.192f),
                    new(.137f,.010f,.006f),.002f,new(.43f,.44f,.42f));
            Rounded("Porta USB",tower+new Vector3(-.045f,.191f,-.192f),new(.032f,.013f,.006f),.0015f,Brass);
            Rounded("Porta USB",tower+new Vector3(.002f,.191f,-.192f),new(.032f,.013f,.006f),.0015f,Brass);
            Orb("Botão de alimentação",tower+new Vector3(.062f,.194f,-.192f),new(.020f,.020f,.008f),Teal);

            var mouse = Prop("Mouse",new(-.645f,.924f,1.694f),new(.074f,.045f,.108f),Paper,false);
            var at = mouse.transform.position;
            Rounded("Divisão dos botões do mouse",at+new Vector3(0,.023f,-.029f),new(.003f,.003f,.043f),.0005f,Ink)
                .transform.SetParent(mouse.transform,true);
            Rounded("Roda do mouse",at+new Vector3(0,.025f,-.015f),new(.012f,.011f,.015f),.003f,Charcoal)
                .transform.SetParent(mouse.transform,true);
        }
    }
}
