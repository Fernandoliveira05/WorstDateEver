using System.Linq;
using UnityEditor;
using UnityEditor.Events;
using UnityEngine;
using UnityEngine.UI;

namespace WorstDateEver.Editor
{
    public static partial class BuildBedroom
    {
        private static readonly Color PhonePearl = new(.98f,.945f,.90f);
        private static readonly Color PhonePlum = new(.17f,.12f,.23f);
        private static readonly Color PhonePink = new(.93f,.59f,.57f);
        private static readonly Color PhoneMint = new(.72f,.85f,.77f);
        private static readonly Color PhoneIvory = new(.98f,.91f,.83f);

        private static void BuildPhone(BedroomController game)
        {
            PreparePhoneSprite();
            var position = new Vector3(1.84f,1.057f,-.276f);
            var phone = Prop("Telefone iClona",position,new(.105f,.206f,.022f),Rose,true);
            phone.transform.rotation = Quaternion.Euler(12,0,0);
            DetailPhoneCase(phone.transform,.72f);
            game.Phone = phone;
            game.PhoneAudio = phone.GetComponent<BedroomAudio>();
            game.PhoneAudio.Bedroom = game;
            var glass = Rounded("Vidro do iClona",position,new(.103f,.202f,.003f),.0014f,Ink).transform;
            glass.SetParent(phone.transform,false);
            glass.localPosition = new Vector3(0,0,-.012f);
            Rounded("Base baixa da doca",new(1.84f,.945f,-.243f),new(.145f,.030f,.126f),.008f,Charcoal,true);
            Rounded("Encosto da doca",new(1.84f,.974f,-.223f),new(.093f,.032f,.052f),.008f,Charcoal,true);
            Rounded("Apoio da doca",new(1.84f,.957f,-.281f),new(.097f,.014f,.022f),.004f,Ink,true);
            Orb("LED da doca",new(1.89f,.949f,-.306f),new(.010f,.005f,.003f),Teal);

            var screen = CanvasAt("Tela do iClona",phone.transform.position,420,800,.000237f);
            screen.SetParent(phone.transform,false);
            screen.localPosition = new Vector3(0,0,-.014f);
            screen.localRotation = Quaternion.identity;

            var launcher = Rect("Tela inicial iClona",screen,Vector2.zero,screen.sizeDelta);
            game.PhoneLauncher = launcher.gameObject;
            Flat(launcher,Vector2.zero,screen.sizeDelta,PhonePlum);
            var art = Rect("Papel de parede do iClona",launcher,Vector2.zero,screen.sizeDelta).gameObject.AddComponent<RawImage>();
            art.texture = AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/Textures/PhoneWallpaper.png");
            art.raycastTarget = false;

            Label(launcher,new(-125,344),new(128,33),"iClona",26,PhoneIvory).alignment=TextAnchor.MiddleLeft;
            Label(launcher,new(130,344),new(116,30),"•••   84%",21,PhoneIvory).alignment=TextAnchor.MiddleRight;
            game.PhoneClock = Label(launcher,new(0,222),new(368,119),"16:41",77,PhonePearl);
            game.PhoneClock.fontStyle=FontStyle.Bold;

            var app = PhoneAction(launcher,new(0,33),new(320,143),"",new Color(.35f,.235f,.44f),PhonePearl,24);
            app.name = "Abrir Deu Ruim";
            PhoneFill((RectTransform)app.transform,new(-99,0),new(83,83),PhonePink);
            var icon = Rect("Ícone do Deu Ruim",app.transform,new(-99,0),new(65,65)).gameObject.AddComponent<RawImage>();
            icon.texture=AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/Textures/BadDateIcon.png");
            icon.raycastTarget=false;
            var appTitle=Label((RectTransform)app.transform,new(47,12),new(179,57),"Deu Ruim",33,PhonePearl);
            appTitle.alignment=TextAnchor.MiddleLeft;
            appTitle.fontStyle=FontStyle.Bold;
            Label((RectTransform)app.transform,new(43,-34),new(173,37),"Abrir  ›",22,new Color(.91f,.78f,.92f))
                .alignment=TextAnchor.MiddleLeft;
            UnityEventTools.AddPersistentListener(app.onClick,game.OpenDatingApp);

            game.PhoneWindowButton = PhoneAction(launcher,new(0,-178),new(320,57),"",new Color(.29f,.225f,.375f),PhonePearl,25);
            game.PhoneIntensityButton = PhoneAction(launcher,new(0,-251),new(320,57),"",new Color(.29f,.225f,.375f),PhonePearl,24);
            UnityEventTools.AddPersistentListener(game.PhoneWindowButton.onClick,game.CycleWindowTime);
            UnityEventTools.AddPersistentListener(game.PhoneIntensityButton.onClick,game.ToggleIntensity);
            PhoneFill(launcher,new(0,-367),new(127,7),new Color(.78f,.68f,.79f));

            var dating = Rect("Aplicativo Deu Ruim",screen,Vector2.zero,screen.sizeDelta);
            game.DatingApp = dating.gameObject;
            Flat(dating,Vector2.zero,screen.sizeDelta,PhonePearl);
            var nav = PhoneAction(dating,new(-153,340),new(72,55),"‹",PhonePlum,PhonePearl,38);
            nav.name="Voltar ao iClona";
            UnityEventTools.AddPersistentListener(nav.onClick,game.ShowPhoneHome);
            var name = Label(dating,new(18,338),new(245,67),"Deu Ruim",40,PhonePlum);
            name.fontStyle=FontStyle.Bold;
            Flat(dating,new(0,296),new(369,3),new Color(.86f,.745f,.80f));
            PhoneFill(dating,new(0,-372),new(124,6),new Color(.62f,.50f,.63f));

            game.Heading = Label(dating,new(0,210),new(362,91),"",44,PhonePlum);
            game.Heading.fontStyle=FontStyle.Bold;
            game.Heading.resizeTextForBestFit=true;
            game.Heading.resizeTextMinSize=31;
            game.Heading.resizeTextMaxSize=44;
            game.Copy = Label(dating,new(0,54),new(349,194),"",33,PhonePlum);

            var cardZone = Rect("Área de deslize do perfil",dating,new(0,22),new(364,500));
            var hit = cardZone.gameObject.AddComponent<Image>();
            hit.color = Color.clear;
            var cards = Rect("Cartão",cardZone,Vector2.zero,cardZone.sizeDelta);
            PhoneFill(cards,Vector2.zero,cards.sizeDelta,Color.white);
            game.PhoneProfile = cardZone.gameObject;
            game.ProfilePicture = ProfileImage(cards,new(0,68),new(340,338));
            game.PhoneProfileName = Label(cards,new(0,-126),new(329,50),"",36,PhonePlum);
            game.PhoneProfileName.alignment=TextAnchor.MiddleLeft;
            game.PhoneProfileName.fontStyle=FontStyle.Bold;
            game.PhoneProfileBio = Label(cards,new(0,-185),new(329,78),"",26,PhonePlum);
            game.PhoneProfileBio.alignment=TextAnchor.UpperLeft;
            var badge = Label(cards,new(0,130),new(240,65),"",39,PhonePearl);
            badge.fontStyle=FontStyle.Bold;
            var stamp = PhoneFill(cards,new(0,130),new(245,64),PhonePlum);
            stamp.transform.SetSiblingIndex(badge.transform.GetSiblingIndex());
            var swipe = cardZone.gameObject.AddComponent<PhoneSwipe>();
            swipe.Bedroom = game;
            swipe.Card = cards;
            swipe.Badge = badge;
            swipe.BadgeBackground = stamp;
            stamp.enabled=false;

            game.PhoneMatchPortrait = ProfileImage(dating,new(0,157),new(169,151));
            game.Portraits = BuildProfilePictures();
            game.PhoneButtons = Enumerable.Range(0,4).Select(i => PhoneAction(dating,
                new(0,-115-i*68),new(353,55),"",i==0 ? PhonePlum : new Color(.87f,.79f,.88f),
                i==0 ? PhonePearl : PhonePlum,25)).ToArray();
            dating.gameObject.SetActive(false);
            cardZone.gameObject.SetActive(false);
        }

        private static void PreparePhoneSprite()
        {
            const string path = Root+"/Textures/PhoneRound.png";
            var importer = (TextureImporter)AssetImporter.GetAtPath(path);
            if (importer.textureType == TextureImporterType.Sprite && importer.spriteBorder.x > 0) return;
            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = SpriteImportMode.Single;
            importer.spriteBorder = new Vector4(11,11,11,11);
            importer.mipmapEnabled = false;
            importer.alphaIsTransparency = true;
            importer.SaveAndReimport();
        }

        private static RawImage ProfileImage(RectTransform parent,Vector2 point,Vector2 size)
        {
            var photo = Rect("Retrato",parent,point,size).gameObject.AddComponent<RawImage>();
            photo.raycastTarget=false;
            return photo;
        }

        private static Image Flat(RectTransform parent,Vector2 point,Vector2 size,Color color)
        {
            var image = Rect("Fundo",parent,point,size).gameObject.AddComponent<Image>();
            image.color=color;
            image.raycastTarget=false;
            return image;
        }

        private static Image PhoneFill(RectTransform parent,Vector2 point,Vector2 size,Color color)
        {
            var image=Flat(parent,point,size,color);
            image.sprite=AssetDatabase.LoadAssetAtPath<Sprite>(Root+"/Textures/PhoneRound.png");
            image.type=Image.Type.Sliced;
            return image;
        }

        private static Button PhoneAction(RectTransform parent,Vector2 point,Vector2 size,string caption,
            Color fill,Color text,int pixels)
        {
            var face=PhoneFill(parent,point,size,fill);
            face.raycastTarget=true;
            var button=face.gameObject.AddComponent<Button>();
            button.targetGraphic=face;
            var title=Label(face.rectTransform,Vector2.zero,size-new Vector2(17,3),caption,pixels,text);
            title.fontStyle=FontStyle.Bold;
            title.resizeTextForBestFit=true;
            title.resizeTextMaxSize=pixels;
            title.resizeTextMinSize=18;
            return button;
        }
    }
}
