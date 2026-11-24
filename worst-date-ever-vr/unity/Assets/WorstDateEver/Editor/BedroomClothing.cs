using UnityEngine;

namespace WorstDateEver.Editor
{
    public static partial class BuildBedroom
    {
        private static void DressFoldedClothing(BedroomProp clothing,int style,Color color)
        {
            var root = clothing.transform;
            var origin = root.position;
            var fabric = root.GetChild(0);
            fabric.GetComponent<MeshFilter>().sharedMesh = RoundedMesh(new Vector3(.130f,.026f,.200f),.006f);
            var edge = new Color(color.r*.71f,color.g*.71f,color.b*.71f);
            var thread = new Color(color.r*.83f+.13f,color.g*.83f+.13f,color.b*.83f+.13f);

            Detail("Bainha",new(0,.013f,-.085f),new(.126f,.005f,.011f),edge);
            for (var side=-1; side<=1; side+=2)
            {
                Detail(style == 0 ? "Manga curta" : "Manga dobrada",new(side*.063f,.0f,.047f),
                    style == 0 ? new(.063f,.024f,.071f) : new(.050f,.028f,.107f),color,side*(style==0 ? -24 : -10));
                Detail("Costura da manga",new(side*.079f,.012f,.019f),new(.023f,.0035f,.031f),thread,side*13);
            }

            if (style == 0)
            {
                Detail("Abertura da gola",new(0,.014f,.066f),new(.052f,.004f,.035f),edge);
                for (var side=-1; side<=1; side+=2)
                    Detail("Gola canelada",new(side*.023f,.017f,.060f),new(.027f,.006f,.008f),thread,side*42);
                Detail("Colarinho",new(0,.017f,.046f),new(.030f,.006f,.008f),thread);
                Detail("Etiqueta interna",new(0,.017f,.079f),new(.019f,.004f,.010f),Paper);
                Detail("Bolso da camiseta",new(-.035f,.016f,.014f),new(.031f,.005f,.038f),edge);
                Detail("Pesponto do bolso",new(-.035f,.019f,.028f),new(.028f,.0028f,.003f),thread);
            }
            else if (style == 1)
            {
                Detail("Faixa do zíper",new(0,.015f,-.008f),new(.009f,.004f,.168f),edge);
                Detail("Dentes do zíper",new(0,.018f,-.008f),new(.003f,.003f,.162f),Brass);
                Detail("Cursor do zíper",new(0,.022f,.039f),new(.010f,.005f,.013f),Brass);
                Detail("Puxador do zíper",new(0,.022f,.029f),new(.006f,.003f,.017f),Ink);
                for (var side=-1; side<=1; side+=2)
                {
                    Detail("Gola da jaqueta",new(side*.023f,.020f,.076f),new(.034f,.009f,.038f),edge,side*26);
                    Detail("Boca do bolso",new(side*.035f,.018f,-.041f),new(.008f,.004f,.046f),thread,side*27);
                }
            }
            else
            {
                Detail("Peitilho de camisa",new(0,.015f,.059f),new(.051f,.004f,.071f),Paper);
                for (var side=-1; side<=1; side+=2)
                    Detail("Lapela do paletó",new(side*.028f,.019f,.048f),new(.027f,.009f,.091f),edge,side*23);
                Detail("Bolso do paletó",new(-.047f,.021f,-.014f),new(.032f,.0035f,.009f),thread,5);
                Detail("Lenço dobrado",new(-.047f,.022f,-.006f),new(.027f,.0035f,.009f),Linen,5);
                for (var button=0; button<3; button++)
                    Orb("Botão do paletó",origin+new Vector3(.009f,.018f,-.018f-button*.022f),
                        new(.008f,.004f,.008f),Wood).transform.SetParent(root,true);
            }

            void Detail(string name,Vector3 offset,Vector3 size,Color tint,float yaw=0)
            {
                var objectPart = Rounded(name,origin+offset,size,.003f,tint);
                objectPart.transform.rotation = Quaternion.Euler(0,yaw,0);
                objectPart.transform.SetParent(root,true);
            }
        }
    }
}
