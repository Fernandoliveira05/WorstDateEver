using System;
using UnityEngine;
using UnityEngine.UI;

namespace WorstDateEver
{
    public sealed class BedroomController : MonoBehaviour
    {
        public Text Heading, Copy;
        public BedroomNarration Narration;
        public Button[] PhoneButtons;
        public GameObject PhoneLauncher, DatingApp, PhoneProfile;
        public Text PhoneClock, PhoneProfileName, PhoneProfileBio;
        public Button PhoneWindowButton, PhoneIntensityButton;
        public RawImage PhoneMatchPortrait;
        public BedroomAvatar Avatar;
        public RawImage ProfilePicture;
        public Texture[] Portraits;
        public BedroomProp Phone;
        public BedroomAudio PhoneAudio;
        public BedroomSpeech Speech;
        public Light Lamp;
        public BedroomWindowView Window;
        public Renderer Monitor;
        public Light RoomAccent;
        private BedroomStory story;
        private string dialogue;
        private bool monitorOn = true;
        private bool datingAppOpen;
        private float nextJoke;
        private FirstDateVenue activeDate;

        private void Start()
        {
            var rig = FindFirstObjectByType<OVRCameraRig>();
            var phone = Phone;
            if (rig && phone)
            {
                var grip = rig.transform.root.gameObject.AddComponent<BedroomGripVisual>();
                grip.Initialize(phone);
            }
            story = BedroomStory.Load();
            Speech.Heard += OnSpeech;
            Speech.Status += ShowStatus;
            Show();
            var args = Environment.GetCommandLineArgs();
            if (Array.IndexOf(args, "-look") >= 0)
            {
                var wardrobe = FindFirstObjectByType<BedroomWardrobe>();
                var camera = Camera.main;
                if (wardrobe && camera)
                {
                    var bounds = wardrobe.GetComponentInChildren<Renderer>().bounds;
                    camera.transform.LookAt(bounds.center);
                }
            }
            var venueArg = Array.IndexOf(args, "-venue");
            if (venueArg >= 0 && venueArg + 1 < args.Length)
            {
                var match = Array.IndexOf(new[] { "caio", "rafa", "bia", "luiza" }, args[venueArg + 1].ToLowerInvariant());
                if (match >= 0)
                {
                    var handoff = new FirstDateStory.Handoff { avatarGender = "male", preference = "all",
                        matchId = new[] { "caio", "rafa", "bia", "luiza" }[match], substance = "none" };
                    activeDate = FirstDateVenue.Enter(handoff, ResetStory);
                    return;
                }
            }
            if (story.phase == BedroomPhase.Exit) TryDate();
            else FirstDateVenue.ClearProgress();
            if (story.phase == BedroomPhase.Intro)
                Narration.Say("Ainda está claro. Já adiei esse encontro duas vezes.", 6f);
        }

        private void OnDestroy()
        {
            if (!Speech) return;
            Speech.Heard -= OnSpeech;
            Speech.Status -= ShowStatus;
        }

        private void OnApplicationPause(bool paused)
        {
            if (paused && story != null) PlayerPrefs.Save();
        }

        public void Swipe(bool like)
        {
            if (!datingAppOpen || story == null || story.phase != BedroomPhase.Browse) return;
            story.Swipe(like);
            if (like)
            {
                Narration.Say("Deu match! Agora começa a parte difícil.");
                PhoneAudio.Notify();
            }
            SaveAndShow();
        }

        public void SelectPreparation(int item)
        {
            if (story == null || story.phase != BedroomPhase.Prep ||
                item < 0 || item >= BedroomStory.PrepNames.Length) return;
            story.prep = item;
            Narration.Say($"Preparação: {BedroomStory.PrepNames[item]}.");
            SaveAndShow();
        }

        public void Joke(string line)
        {
            if (story == null || Time.unscaledTime < nextJoke) return;
            nextJoke = Time.unscaledTime + 3f;
            ShowStatus(line);
        }

        public void PickAppearance(int choice)
        {
            if (story == null || choice == story.appearance) return;
            story.appearance = choice;
            Narration.Say($"{BedroomStory.AppearanceNames[choice]}. Parece que tenho a vida em ordem.");
            SaveAndShow();
        }

        public void ToggleLamp()
        {
            Lamp.enabled = !Lamp.enabled;
            Joke(Lamp.enabled ? "Muito melhor. Agora dá para ver a bagunça." : "Pronto. A bagunça deixou de existir.");
        }

        public void ToggleMonitor()
        {
            monitorOn = !monitorOn;
            Monitor.enabled = monitorOn;
            Joke(monitorOn ? "Sete abas abertas. Nenhuma com respostas." : "Sem luz azul. Só decisões ruins.");
        }

        public void RecoverPhone()
        {
            Phone.Recover();
            Narration.Say("De volta à base. O celular, pelo menos.");
        }

        public void DrawerOpened() => Joke("Uma gaveta só de cabos que não servem para nada.");
        public void SpringToyPopped() => Joke("O sapo está pronto para o encontro. Eu ainda não.");

        public void DoorOpened()
        {
            if (story?.phase == BedroomPhase.Prep) Advance();
            else if (story?.phase == BedroomPhase.Exit) TryDate();
        }

        public void ToggleIntensity()
        {
            if (story == null) return;
            story.reducedIntensity = !story.reducedIntensity;
            Narration.Say(story.reducedIntensity ? "Intensidade reduzida." : "Intensidade normal.");
            SaveAndShow();
        }

        private void OnSpeech(string text)
        {
            if (story.phase != BedroomPhase.Match) return;
            dialogue = story.Respond(text);
            Show();
        }

        private void ShowStatus(string status)
        {
            if (!string.IsNullOrWhiteSpace(status)) Narration.Say(status);
            if (story != null && story.phase == BedroomPhase.Match) Show();
        }

        private void Advance()
        {
            Speech.Cancel();
            dialogue = "";
            if (story.TryAdvance())
            {
                if (story.phase == BedroomPhase.Identity) Narration.Say("O espelho está aceitando sugestões.");
                if (story.phase == BedroomPhase.Wait) Narration.Say("«Estou chegando.» Faltam duas horas.");
                if (story.phase == BedroomPhase.Prep) Narration.Say("A bandeja espera uma decisão. Eu também.");
                SaveAndShow();
                if (story.phase == BedroomPhase.Exit) TryDate();
            }
        }

        private void SaveAndShow()
        {
            story.Save();
            Show();
        }

        public void CycleWindowTime()
        {
            if (story == null) return;
            story.windowTime = (int)(((int)Window.Current+1)%3);
            story.windowOverride = true;
            SaveAndShow();
        }

        public void OpenDatingApp()
        {
            if (story == null) return;
            datingAppOpen = true;
            Show();
        }

        public void ShowPhoneHome()
        {
            if (story == null) return;
            datingAppOpen = false;
            if (Speech.Listening) Speech.Cancel();
            Show();
        }

        private void Show()
        {
            Avatar.Select(story.identity, story.appearance);
            var time = story.windowOverride ? (WindowTime)Mathf.Clamp(story.windowTime,0,2)
                : story.phase >= BedroomPhase.Wait ? WindowTime.Night : WindowTime.GoldenHour;
            Window.SetTime(time);
            PhoneLauncher.SetActive(!datingAppOpen);
            DatingApp.SetActive(datingAppOpen);
            PhoneClock.text = story.phase >= BedroomPhase.Wait ? "18:41" : "16:41";
            PhoneWindowButton.GetComponentInChildren<Text>(true).text = time == WindowTime.Night ? "Janela · Noite"
                : time == WindowTime.Day ? "Janela · Dia" : "Janela · Entardecer";
            PhoneIntensityButton.GetComponentInChildren<Text>(true).text = story.reducedIntensity
                ? "Intensidade · Reduzida" : "Intensidade · Normal";

            var browsing = story.phase == BedroomPhase.Browse;
            var match = story.phase == BedroomPhase.Match;
            PhoneProfile.SetActive(browsing);
            PhoneMatchPortrait.gameObject.SetActive(match);
            Heading.gameObject.SetActive(!browsing);
            Copy.gameObject.SetActive(!browsing);
            Heading.rectTransform.anchoredPosition = new Vector2(0,match ? 248 : 210);
            Copy.rectTransform.anchoredPosition = new Vector2(0,match ? 14 : 54);
            Copy.rectTransform.sizeDelta = new Vector2(349,match ? 110 : 194);
            Copy.fontSize = match ? 27 : 33;
            if (browsing || match)
            {
                var index = System.Array.IndexOf(BedroomStory.Profiles,story.Current);
                var portrait = Portraits[index];
                ProfilePicture.texture = portrait;
                PhoneMatchPortrait.texture = portrait;
                if (browsing)
                {
                    var bio = story.Current.Bio.Split(new[] { " · " },2,System.StringSplitOptions.None);
                    PhoneProfileName.text = bio.Length == 2 ? story.Current.Name+", "+bio[0] : story.Current.Name;
                    PhoneProfileBio.text = bio.Length == 2 ? bio[1] : bio[0];
                }
            }
            RoomAccent.color = story.phase == BedroomPhase.Aftermath && !story.reducedIntensity
                ? new Color(.59f,.27f,.46f) : new Color(.70f,.77f,.86f);
            for (var i=0; i<PhoneButtons.Length; i++)
            {
                var button = PhoneButtons[i];
                button.onClick.RemoveAllListeners();
                button.gameObject.SetActive(false);
                var rect = (RectTransform)button.transform;
                rect.anchoredPosition = browsing ? new Vector2(i==0 ? -96 : 96,-277) : new Vector2(0,-116-i*68);
                rect.sizeDelta = browsing ? new Vector2(176,66) : new Vector2(353,55);
                var label = button.GetComponentInChildren<Text>(true);
                label.rectTransform.sizeDelta = rect.sizeDelta-new Vector2(17,3);
                button.targetGraphic.color = browsing
                    ? i==0 ? new Color(.93f,.72f,.72f) : new Color(.72f,.85f,.77f)
                    : i==0 ? new Color(.17f,.12f,.23f) : new Color(.87f,.79f,.88f);
                label.color = browsing || i>0 ? new Color(.17f,.12f,.23f) : new Color(.98f,.945f,.90f);
            }
            switch (story.phase)
            {
                case BedroomPhase.Intro:
                    SetCopy("Deu Ruim?", "Encontros pra contar na terapia.");
                    Option(0,"COMEÇAR",Advance);
                    break;
                case BedroomPhase.Identity:
                    SetCopy("QUEM É VOCÊ?", "Seu perfil");
                    Option(0, "HOMEM", () => { story.SetIdentity(0); SaveAndShow(); });
                    Option(1, "MULHER", () => { story.SetIdentity(1); SaveAndShow(); });
                    break;
                case BedroomPhase.Preference:
                    SetCopy("QUEM VOCÊ PROCURA?", "O visual não muda quem aparece aqui.");
                    for (var i = 0; i < 3; i++)
                    {
                        var preference = i;
                        Option(i, new[] { "HOMENS", "MULHERES", "TODOS" }[i],
                            () => { story.SetPreference(preference); SaveAndShow(); });
                    }
                    break;
                case BedroomPhase.Browse:
                    Option(0,"×  PASSAR",() => Swipe(false));
                    Option(1,"♥  CURTIR",() => Swipe(true));
                    break;
                case BedroomPhase.Match:
                    SetCopy(story.Current.Name.ToUpperInvariant(), dialogue ??
                        $"Deu match!\n\n«Te encontro no {story.Current.Venue}.»");
                    Option(0, Speech.Listening ? "CANCELAR FALA" : "TOQUE PARA FALAR",
                        () => { if (Speech.Listening) Speech.Cancel(); else Speech.Begin(); });
                    Option(1, "QUE HORAS?", () => OnSpeech("que horas"));
                    Option(2, "ONDE?", () => OnSpeech("onde"));
                    Option(3, "AVANÇAR DUAS HORAS", Advance);
                    break;
                case BedroomPhase.Wait:
                    SetCopy("DUAS HORAS DEPOIS", "Faltam vinte minutos. De algum jeito, eu ainda estou de pijama.");
                    Option(0, "ME PREPARAR", Advance);
                    break;
                case BedroomPhase.Prep:
                    SetCopy("HORA DE SAIR", "Preparação atual\n\n" + BedroomStory.PrepNames[story.prep]);
                    Option(0, "PARTIR", Advance);
                    break;
                case BedroomPhase.Exit:
                    SetCopy("ATÉ LOGO", $"Você sai rumo a: {story.Current.Venue}.");
                    Option(0, "PARTIR", TryDate);
                    Option(1, "RECOMEÇAR", ResetStory);
                    break;
                case BedroomPhase.Aftermath:
                    SetCopy("ALGO MUDOU", "Você abre os olhos no quarto.\n\nUma mensagem piscou na tela: «Já estou aqui.»");
                    Option(0, "RECOMEÇAR", ResetStory);
                    break;
            }
        }

        private void TryDate()
        {
            if (activeDate) return;
            var handoff = FirstDateStory.Transfer(story);
            if (handoff == null)
            {
                Narration.Say("Não foi possível abrir o encontro. Recomece pelo celular.");
                return;
            }
            try { activeDate = FirstDateVenue.Enter(handoff, ResetStory); }
            catch (System.Exception error)
            {
                Debug.LogException(error);
                Narration.Say("O salão não abriu. Tente partir outra vez pelo celular.");
            }
        }

        private void ResetStory()
        {
            FirstDateVenue.ClearProgress();
            story = new BedroomStory { reducedIntensity = story.reducedIntensity };
            dialogue = null;
            Phone.Recover();
            SaveAndShow();
        }

        private void SetCopy(string heading, string copy) { Heading.text = heading; Copy.text = copy; }
        private void Option(int index, string label, UnityEngine.Events.UnityAction action)
        {
            var button = PhoneButtons[index];
            button.GetComponentInChildren<Text>(true).text = label;
            button.onClick.AddListener(action);
            button.gameObject.SetActive(true);
        }
    }
}
