using UnityEngine;

namespace WorstDateEver
{
    public sealed class FirstDateFrameMetrics : MonoBehaviour
    {
        public bool Sample = false;
        public uint Samples { get; private set; }
        public double LatestCpuMilliseconds { get; private set; }
        public double LatestGpuMilliseconds { get; private set; }
        private readonly FrameTiming[] timings = new FrameTiming[1];

        private void LateUpdate()
        {
            if (!Sample || !FrameTimingManager.IsFeatureEnabled()) return;
            FrameTimingManager.CaptureFrameTimings();
            if (FrameTimingManager.GetLatestTimings(1, timings) == 0) return;
            Samples++;
            LatestCpuMilliseconds = timings[0].cpuFrameTime;
            LatestGpuMilliseconds = timings[0].gpuFrameTime;
        }
    }
}
