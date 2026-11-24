using UnityEngine;

namespace WorstDateEver
{
    public sealed class BedroomMirror : MonoBehaviour
    {
        public const int AvatarLayer = 26;
        public Renderer Glass;
        private Camera reflectionCamera;
        private RenderTexture image;
        private float refreshAt;
        private bool rendering;

        private void OnEnable() => Camera.onPreCull += DrawReflection;

        private void OnDisable()
        {
            Camera.onPreCull -= DrawReflection;
            if (reflectionCamera) Destroy(reflectionCamera.gameObject);
            if (image) Destroy(image);
        }

        private void DrawReflection(Camera eye)
        {
            if (rendering || eye != Camera.main || Time.unscaledTime < refreshAt) return;
            var normal = -transform.forward;
            if (Vector3.Dot(eye.transform.position - transform.position, normal) <= .1f ||
                !GeometryUtility.TestPlanesAABB(GeometryUtility.CalculateFrustumPlanes(eye), Glass.bounds)) return;

            if (!reflectionCamera)
            {
                reflectionCamera = new GameObject("Câmera do espelho", typeof(Camera)).GetComponent<Camera>();
                reflectionCamera.enabled = false;
            }
            var width = 640;
            var height = Mathf.Clamp(Mathf.RoundToInt(width / eye.aspect), 320, 640);
            if (!image || image.height != height)
            {
                if (image) Destroy(image);
                image = new RenderTexture(width, height, 16) { name = "Reflexo do quarto" };
                var block = new MaterialPropertyBlock();
                Glass.GetPropertyBlock(block);
                block.SetTexture("_Reflection", image);
                Glass.SetPropertyBlock(block);
            }

            refreshAt = Time.unscaledTime + 1f / 24f;
            reflectionCamera.CopyFrom(eye);
            reflectionCamera.targetTexture = image;
            reflectionCamera.allowMSAA = false;
            reflectionCamera.stereoTargetEye = StereoTargetEyeMask.None;
            reflectionCamera.cullingMask |= 1 << AvatarLayer;
            var planePoint = transform.position;
            var reflected = Matrix4x4.identity;
            for (var row = 0; row < 3; row++)
            {
                for (var col = 0; col < 3; col++) reflected[row,col] -= 2 * normal[row] * normal[col];
                reflected[row,3] = 2 * Vector3.Dot(planePoint, normal) * normal[row];
            }
            reflectionCamera.transform.SetPositionAndRotation(reflected.MultiplyPoint(eye.transform.position), eye.transform.rotation);
            var view = eye.worldToCameraMatrix * reflected;
            reflectionCamera.worldToCameraMatrix = view;
            var clipNormal = view.MultiplyVector(normal).normalized;
            var clipPoint = view.MultiplyPoint(planePoint + normal * .012f);
            reflectionCamera.projectionMatrix = eye.CalculateObliqueMatrix(
                new Vector4(clipNormal.x, clipNormal.y, clipNormal.z, -Vector3.Dot(clipPoint, clipNormal)));

            var culling = GL.invertCulling;
            try
            {
                rendering = true;
                Glass.enabled = false;
                GL.invertCulling = !culling;
                reflectionCamera.Render();
            }
            finally
            {
                GL.invertCulling = culling;
                Glass.enabled = true;
                rendering = false;
            }
        }
    }
}
