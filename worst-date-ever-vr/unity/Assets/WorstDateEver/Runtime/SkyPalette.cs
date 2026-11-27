using UnityEngine;

namespace WorstDateEver
{
    /// <summary>One palette shared by the bedroom window and the outdoor picnic sky.</summary>
    public static class SkyPalette
    {
        public static readonly Color DayZenith = Hex("#5b9ed8");
        public static readonly Color DayHorizon = Hex("#cfe6f2");
        public static readonly Color DayGround = Hex("#b8d6b0");
        public static readonly Color DaySun = Hex("#fff2c8");
        public static readonly Color DayCloud = Hex("#f7f7f2");

        public static readonly Color GoldenZenith = Hex("#4a7fa8");
        public static readonly Color GoldenHorizon = Hex("#e89f6b");
        public static readonly Color GoldenSun = Hex("#ffd27a");
        public static readonly Color GoldenCloud = Hex("#f2c3a4");

        public static readonly Color NightZenith = Hex("#0a1028");
        public static readonly Color NightHorizon = Hex("#26324f");
        public static readonly Color NightSun = Hex("#9fb3e0");
        public static readonly Color NightCloud = Hex("#303a52");

        public static Color Hex(string value) =>
            ColorUtility.TryParseHtmlString(value, out var color) ? color : Color.magenta;
    }
}
