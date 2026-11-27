using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;

namespace WorstDateEver.Editor
{
    /// <summary>Headless Linux desktop build of the playable bedroom + first date.</summary>
    public static class BuildLinux
    {
        private const string Scene = "Assets/WorstDateEver/Scenes/BedroomDesktop.unity";
        private const string Output = "Builds/Linux/WorstDateEver.x86_64";

        [MenuItem("Worst Date Ever/Build Linux Player")]
        public static void Build()
        {
            Directory.CreateDirectory(Path.GetDirectoryName(Output) ?? "Builds/Linux");
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { Scene },
                locationPathName = Output,
                target = BuildTarget.StandaloneLinux64,
                options = BuildOptions.None
            });
            if (report.summary.result != BuildResult.Succeeded)
                throw new InvalidOperationException(
                    $"Linux build failed: {report.summary.result} " +
                    $"({report.summary.totalErrors} errors, {report.summary.totalWarnings} warnings)");
            UnityEngine.Debug.Log($"Worst Date Ever Linux build: {Output} " +
                                  $"({report.summary.totalSize} bytes)");
        }
    }
}
