using System.Collections.Generic;
using UnityEngine;

namespace WorstDateEver.Editor
{
    public static partial class BuildBedroom
    {
        private static GameObject DetailBlock(Transform root,string name,Vector3 local,Vector3 size,float round,Color tint)
        {
            var part=Rounded(name,root.TransformPoint(local),size,round,tint);
            part.transform.SetParent(root,true);
            return part;
        }

        private static void DetailOrb(Transform root,string name,Vector3 local,Vector3 size,Color tint)
        {
            Orb(name,root.TransformPoint(local),size,tint).transform.SetParent(root,true);
        }

        private static void DressDrawerStamp(Transform root)
        {
            DetailBlock(root,"Base de madeira",new(0,-.009f,0),new(.100f,.019f,.066f),.006f,new(.65f,.38f,.19f));
            DetailBlock(root,"Borracha do carimbo",new(0,-.020f,0),new(.088f,.009f,.053f),.003f,new(.51f,.17f,.18f));
            DetailOrb(root,"Haste usinada",new(0,.014f,0),new(.032f,.034f,.031f),Wood);
            DetailOrb(root,"Empunhadura entalhada",new(0,.036f,0),new(.052f,.035f,.041f),new(.43f,.25f,.16f));
            foreach(var z in new[] {-.025f,.025f})
                DetailBlock(root,"Friso da base",new(0,.002f,z),new(.086f,.002f,.002f),.0007f,Brass);
            DetailBlock(root,"Relevo gravado",new(0,-.025f,0),new(.066f,.002f,.025f),.0007f,new(.36f,.12f,.15f));
        }

        private static void DressDrawerDentures(Transform root)
        {
            DetailBlock(root,"Estojo de dentadura",new(0,-.012f,0),new(.097f,.017f,.066f),.007f,SlateTeal);
            var lid=DetailBlock(root,"Tampa entreaberta",new(0,.004f,.027f),new(.095f,.010f,.054f),.006f,new(.31f,.55f,.55f));
            lid.transform.localRotation=Quaternion.Euler(-46,0,0);
            DetailBlock(root,"Fecho de latão",new(0,-.004f,-.034f),new(.023f,.007f,.006f),.001f,Brass);
            var gum=new List<Vector3>();
            for(var index=0;index<=24;index++)
            {
                var theta=Mathf.PI*index/24;
                gum.Add(new(Mathf.Cos(theta)*.029f,.002f,-Mathf.Sin(theta)*.023f-.002f));
            }
            MeshPart("Arcada de gengiva",root,Tube("DentureArcGum",gum,.006f),new(.76f,.35f,.42f));
            for(var index=0;index<=10;index++)
            {
                var theta=Mathf.PI*index/10;
                var crown=DetailBlock(root,"Dente de porcelana",new(Mathf.Cos(theta)*.029f,.009f,-Mathf.Sin(theta)*.023f-.002f),
                    new(.008f,index is >2 and <8?.015f:.010f,.009f),.0025f,index%2==0?Linen:Paper);
                crown.transform.localRotation=Quaternion.Euler(0,theta*Mathf.Rad2Deg-90,0);
            }
        }

        private static void DressDrawerSock(Transform root)
        {
            var mauve=new Color(.58f,.37f,.39f);
            var heel=new Color(.34f,.26f,.34f);
            DetailOrb(root,"Pé da meia",new(.014f,-.002f,-.011f),new(.077f,.030f,.039f),mauve);
            DetailOrb(root,"Tornozelo dobrado",new(-.024f,.002f,.007f),new(.049f,.031f,.063f),mauve);
            DetailOrb(root,"Biqueira contrastante",new(.046f,-.001f,-.012f), new(.028f,.029f,.037f),heel);
            DetailOrb(root,"Calcanhar contrastante",new(-.023f,-.003f,-.014f),new(.029f,.027f,.029f),heel);
            var cuff=DetailBlock(root,"Punho canelado",new(-.029f,.002f,.028f),new(.044f,.026f,.014f),.006f,heel);
            ApplySurface(cuff,"Weave",heel,new(19,19),.45f,.11f);
            for(var index=0;index<7;index++)
                DetailBlock(root,"Tricô do punho",new(-.048f+index*.006f,.014f,.027f),new(.002f,.002f,.009f),.0007f,new(.70f,.52f,.49f));
            foreach(var x in new[]{.018f,.025f})
                DetailBlock(root,"Faixa da meia",new(x,.011f,-.012f),new(.0035f,.003f,.029f),.001f,Paper);
        }

        private static void DressDrawerFrog(Transform root)
        {
            var olive=new Color(.40f,.56f,.29f);
            var feet=new Color(.30f,.45f,.24f);
            DetailOrb(root,"Corpo verde",new(0,.002f,0),new(.084f,.071f,.082f),olive);
            DetailOrb(root,"Barriga pintada",new(0,-.010f,-.020f),new(.060f,.042f,.052f),new(.65f,.63f,.36f));
            DetailOrb(root,"Focinho saliente",new(0,.009f,-.034f),new(.071f,.029f,.033f),new(.48f,.62f,.32f));
            var grin=new List<Vector3>();
            for(var index=0;index<=14;index++)
            {
                var t=index/14f;
                grin.Add(new((t-.5f)*.048f,.006f-.011f*Mathf.Sin(t*Mathf.PI),-.048f));
            }
            MeshPart("Sorriso do sapo",root,Tube("SpringFrogGrin",grin,.0017f),Ink);
            foreach(var sign in new[]{-1f,1f})
            {
                DetailOrb(root,"Olho protuberante",new(sign*.023f,.031f,-.018f),new(.037f,.037f,.035f),olive);
                DetailOrb(root,"Íris dourada",new(sign*.023f,.034f,-.031f),new(.026f,.025f,.020f),new(.84f,.78f,.52f));
                DetailOrb(root,"Pupila",new(sign*.023f,.034f,-.041f),new(.011f,.015f,.007f),Ink);
                DetailOrb(root,"Brilho no olho",new(sign*.023f+.002f,.038f,-.045f),Vector3.one*.003f,Paper);
                DetailOrb(root,"Coxa dobrada",new(sign*.037f,-.018f,.012f),new(.028f,.034f,.044f),feet);
                for(var toe=0;toe<3;toe++)
                    DetailOrb(root,"Dedos palmados",new(sign*(.025f+toe*.007f),-.022f,-.031f+toe*.003f),
                        new(.014f,.008f,.022f),olive);
            }
            var coil=new List<Vector3>();
            for(var index=0;index<=48;index++)
            {
                var t=index/48f;
                var a=t*Mathf.PI*7;
                coil.Add(new(Mathf.Cos(a)*.023f,-.047f+t*.033f,Mathf.Sin(a)*.023f));
            }
            MeshPart("Mola de latão",root,Tube("SpringFrogCoil",coil,.0017f),Brass);
            DetailOrb(root,"Base da mola",new(0,-.047f,0),new(.057f,.007f,.057f),Wood);
        }
    }
}
