using System.Collections.Generic;
using UnityEngine;

namespace WorstDateEver.Editor
{
    public static partial class BuildBedroom
    {
        private static void AddDeskDetails()
        {
            AddCeramics();
            var squishySize = new Vector3(.19f,.043f,.054f);
            var squishy = Prop("Lagarta de borracha",new(-1.43f,.923f,1.71f),squishySize,new(.55f,.64f,.34f),false);
            squishy.transform.GetChild(0).localScale = new Vector3(.90f,.65f,.68f);
            for (var segment=0; segment<5; segment++)
                Orb("Anel de borracha",squishy.transform.position+Vector3.right*((segment-2)*.034f),
                    new(.049f,.043f,.057f),segment%2==0 ? new(.56f,.64f,.31f): new(.46f,.55f,.32f))
                    .transform.SetParent(squishy.transform,true);
            MakeFlexible(squishy,squishySize,SoftRubber,"Rubber");

            var notebook = Prop("Caderno de capa dura", new(-1.81f,.924f,1.635f), new(.24f,.048f,.179f), Paper, false);
            var at = notebook.transform.position;
            foreach (var side in new[] { -1, 1 })
                Rounded("Capa de tecido", at + Vector3.up*.022f*side, new(.247f,.008f,.183f), .003f, Clay)
                    .transform.SetParent(notebook.transform,true);
            for (var i = 0; i < 4; i++)
                Rounded("Borda das páginas", at + new Vector3(.121f,-.014f+i*.009f,0),new(.003f,.001f,.168f),.0004f,Linen)
                    .transform.SetParent(notebook.transform,true);
            Rounded("Elástico do caderno", at + new Vector3(.082f,.026f,0),new(.010f,.003f,.183f),.001f,Charcoal)
                .transform.SetParent(notebook.transform,true);
            Rounded("Marcador de página", at + new Vector3(.049f,-.013f,-.099f),new(.016f,.003f,.039f),.001f,Brass)
                .transform.SetParent(notebook.transform,true);
            notebook.transform.rotation = Quaternion.Euler(0,12,0);

            var keyboard = Prop("Teclado", new(-.970f,.916f,1.467f), new(.355f,.030f,.125f), Charcoal, false);
            for (var row = 0; row < 4; row++)
            for (var col = 0; col < 12; col++)
            {
                if (row == 3 && col >= 3 && col <= 8) continue;
                Rounded("Tecla", keyboard.transform.position + new Vector3((col-5.5f)*.026f,.017f,(row-1.5f)*.024f),
                    new(.021f,.008f,.019f),.003f,row == 0 && col == 0 ? Clay : Linen)
                    .transform.SetParent(keyboard.transform,true);
            }
            Rounded("Barra de espaço",keyboard.transform.position + new Vector3(0,.017f,-.036f),
                new(.148f,.008f,.019f),.003f,Linen).transform.SetParent(keyboard.transform,true);
            keyboard.transform.rotation = Quaternion.Euler(0,-5,0);

            var keys = Prop("Chaves e chaveiro", new(-.676f,.914f,1.335f), new(.119f,.024f,.075f), Brass, false);
            keys.transform.GetChild(0).GetComponent<Renderer>().enabled = false;
            var loop = new List<Vector3>();
            for (var i = 0; i <= 24; i++)
            {
                var angle = i * Mathf.PI * 2 / 24;
                loop.Add(new Vector3(Mathf.Cos(angle)*.023f,Mathf.Sin(angle)*.023f,0));
            }
            var ring = MeshPart("Argola de aço",keys.transform,Tube("KeyRing",loop,.0028f),Charcoal);
            ring.transform.localRotation = Quaternion.Euler(90,0,0);
            for (var i = 0; i < 2; i++)
            {
                var key = new GameObject("Chave metálica").transform;
                key.SetParent(keys.transform,false);
                key.localPosition = new(-.027f + i*.034f, .006f+i*.006f, .007f);
                key.localRotation = Quaternion.Euler(0,31-54*i,0);
                Rounded("Haste",key.position+key.forward*.010f,new(.012f,.005f,.043f),.002f,Brass).transform.SetParent(key,true);
                Orb("Cabeça",key.position-key.forward*.016f,new(.022f,.007f,.022f),Brass).transform.SetParent(key,true);
                Rounded("Dente",key.position+key.right*.009f+key.forward*.024f,new(.013f,.005f,.011f),.001f,Brass)
                    .transform.SetParent(key,true);
            }

            var pencil = Prop("Lápis com borracha",new(-1.636f,.909f,1.627f),new(.126f,.014f,.014f),Brass,false);
            var pencilAt = pencil.transform.position;
            Rounded("Borracha",pencilAt+Vector3.left*.064f,new(.018f,.012f,.013f),.004f,Rose)
                .transform.SetParent(pencil.transform,true);
            var tip = Orb("Ponta de grafite",pencilAt+Vector3.right*.065f,new(.020f,.009f,.009f),Charcoal);
            tip.transform.SetParent(pencil.transform,true);
            pencil.transform.rotation = Quaternion.Euler(0,24,0);
        }

        private static void AddPreparationProps()
        {
            for (var i = 1; i < BedroomStory.PrepNames.Length; i++)
            {
                var at = new Vector3(-1.58f + (i-1)*.122f, .935f, 1.61f);
                BedroomProp prop;
                if (i <= 2)
                {
                    var shape = i == 1 ? new Vector3(.079f,.049f,.053f) : new Vector3(.073f,.014f,.064f);
                    prop = Prop(BedroomStory.PrepNames[i],at,shape,i == 1 ? SlateTeal : Paper,false);
                    Rounded(i == 1 ? "Tampa da lata" : "Aba do envelope", at+Vector3.up*(shape.y*.5f),
                        new(shape.x*.95f,.007f,shape.z*.89f), .003f, i == 1 ? Teal : Linen).transform.SetParent(prop.transform,true);
                }
                else
                {
                    var wide = i == 3 ? .055f : .035f;
                    var tall = i == 3 ? .088f : .061f;
                    at.y = .9f+tall*.5f;
                    prop = Prop(BedroomStory.PrepNames[i],at,new(wide,tall,wide),
                        i == 3 ? new Color(.43f,.25f,.13f) : SlateTeal,false,PrimitiveType.Cylinder);
                    Shape("Gargalo",at+Vector3.up*(tall*.5f),new(wide*.54f,.026f,wide*.54f),
                        i == 3 ? new Color(.43f,.25f,.13f) : SlateTeal, PrimitiveType.Cylinder,false).transform.SetParent(prop.transform,true);
                    Shape("Tampa",at+Vector3.up*(tall*.5f+.016f),new(wide*.59f,.012f,wide*.59f),
                        i == 3 ? Brass : Charcoal,PrimitiveType.Cylinder,false).transform.SetParent(prop.transform,true);
                }
                prop.PreparationItem = i;
            }
        }
    }
}
