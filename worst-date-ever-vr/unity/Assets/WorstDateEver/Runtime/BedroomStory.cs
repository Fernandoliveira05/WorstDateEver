using System;
using System.Globalization;
using System.Linq;
using System.Text;
using UnityEngine;

namespace WorstDateEver
{
    public enum BedroomPhase { Intro, Identity, Preference, Browse, Match, Wait, Prep, Exit, Aftermath }

    [Serializable]
    public sealed class BedroomStory
    {
        public const string SaveKey = "worst-date-ever-native-bedroom-v1";
        public static readonly string[] AppearanceNames = { "Original", "Jaqueta", "Traje social" };
        public static readonly string[] PrepNames = { "Sem item", "Maconha", "LSD", "Álcool", "DMT" };
        public static readonly DateProfile[] Profiles = {
            new("Caio", "Homens", "Cafeteria", "27 · Filosofia, kombucha e discursos apaixonados.", "Uma coisa antes: você prefere café ou debater o conceito de café?"),
            new("Rafa", "Homens", "Restaurante japonês", "24 · Tênis, carros, negócios e talvez ainda a ex.", "Show. Reservei duas cadeiras. Três, se a minha ex aparecer."),
            new("Bia", "Mulheres", "Bistrô", "24 · Trends, fofoca e um feed impecável.", "Fechado. Chega cedo para eu fingir que não fiquei te esperando."),
            new("Luiza", "Mulheres", "Barzinho", "26 · Sertanejo, rodeio, cavalos e risadas.", "Combinado. Se o garçom perguntar, o cavalo ficou lá fora.")
        };

        public BedroomPhase phase;
        public int identity = -1, preference = -1, profile, match = -1, appearance, prep;
        public bool reducedIntensity;
        public bool windowOverride;
        public int windowTime;

        public DateProfile[] Eligible => preference switch {
            0 => Profiles.Where(p => p.Group == "Homens").ToArray(),
            1 => Profiles.Where(p => p.Group == "Mulheres").ToArray(),
            _ => Profiles
        };

        public DateProfile Current => phase == BedroomPhase.Browse ? Eligible[profile] : Profiles[match];
        public bool HasMatch => match >= 0 && match < Profiles.Length;

        public bool TryAdvance()
        {
            switch (phase)
            {
                case BedroomPhase.Intro: phase = BedroomPhase.Identity; break;
                case BedroomPhase.Match: phase = BedroomPhase.Wait; break;
                case BedroomPhase.Wait: phase = BedroomPhase.Prep; break;
                case BedroomPhase.Prep: phase = prep == 4 ? BedroomPhase.Aftermath : BedroomPhase.Exit; break;
                default: return false;
            }
            return true;
        }

        public void SetIdentity(int value)
        {
            if (phase != BedroomPhase.Identity || value is < 0 or > 1) return;
            identity = value;
            phase = BedroomPhase.Preference;
        }

        public void SetPreference(int value)
        {
            if (phase != BedroomPhase.Preference || value is < 0 or > 2) return;
            preference = value;
            profile = 0;
            phase = BedroomPhase.Browse;
        }

        public void Swipe(bool like)
        {
            if (phase != BedroomPhase.Browse) return;
            if (like)
            {
                match = Array.IndexOf(Profiles, Current);
                phase = BedroomPhase.Match;
            }
            else profile = (profile + 1) % Eligible.Length;
        }

        public string Respond(string text)
        {
            if (!HasMatch) return "";
            var normalized = new string((text ?? "").Normalize(NormalizationForm.FormD)
                .Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark).ToArray())
                .ToLowerInvariant().Trim();
            if (normalized.Contains("hora") || normalized.Contains("quando"))
                return "Daqui a duas horas. Se eu disser que já estou saindo, acrescenta meia hora.";
            if (normalized.Contains("onde") || normalized.Contains("lugar"))
                return $"{Current.Venue}. Vou estar na mesa com a cadeira desmontando.";
            return Current.Reply;
        }

        public void Save() => PlayerPrefs.SetString(SaveKey, JsonUtility.ToJson(this));

        public static BedroomStory Load()
        {
            if (!PlayerPrefs.HasKey(SaveKey)) return new BedroomStory();
            try
            {
                var loaded = JsonUtility.FromJson<BedroomStory>(PlayerPrefs.GetString(SaveKey, "{}"));
                if (loaded != null && Enum.IsDefined(typeof(BedroomPhase), loaded.phase) &&
                    loaded.identity is >= -1 and <= 1 && loaded.preference is >= -1 and <= 2 &&
                    loaded.profile >= 0 && loaded.profile < loaded.Eligible.Length &&
                    loaded.match is >= -1 and < 4 && (loaded.phase < BedroomPhase.Match || loaded.HasMatch) &&
                    loaded.appearance >= 0 && loaded.appearance < AppearanceNames.Length &&
                    loaded.prep >= 0 && loaded.prep < PrepNames.Length)
                    return loaded;
            }
            catch (ArgumentException) { }
            return new BedroomStory();
        }
    }

    public sealed class DateProfile
    {
        public readonly string Name, Group, Venue, Bio, Reply;
        public DateProfile(string name, string group, string venue, string bio, string reply)
        {
            Name = name; Group = group; Venue = venue; Bio = bio; Reply = reply;
        }
    }
}
