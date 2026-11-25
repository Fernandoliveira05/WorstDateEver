using UnityEngine;
using UnityEngine.UI;

namespace WorstDateEver
{
    public sealed class BedroomNarration : MonoBehaviour
    {
        public bool InHeadset;
        private Canvas canvas;
        private Text line;
        private RectTransform panel;
        private Camera eye;
        private string pending;
        private float hideAt;

        public void Say(string value, float seconds = 0)
        {
            if (string.IsNullOrWhiteSpace(value)) return;
            pending = value;
            hideAt = Time.unscaledTime + (seconds > 0 ? seconds : Mathf.Clamp(2.8f + value.Length * .035f, 4f, 8f));
            if (line) line.text = value;
        }

        private void LateUpdate()
        {
            if (!canvas && !Build()) return;
            if (InHeadset)
            {
                if (!eye) return;
                canvas.transform.SetPositionAndRotation(
                    eye.transform.position + eye.transform.rotation * new Vector3(0, -.205f, .95f),
                    eye.transform.rotation);
            }
            panel.gameObject.SetActive(!string.IsNullOrEmpty(pending) && Time.unscaledTime < hideAt);
        }

        private bool Build()
        {
            if (InHeadset)
            {
                eye = Camera.main;
                if (!eye) return false;
            }

            var root = new GameObject("Legenda do narrador", typeof(RectTransform), typeof(Canvas));
            root.transform.SetParent(transform, false);
            canvas = root.GetComponent<Canvas>();
            canvas.renderMode = InHeadset ? RenderMode.WorldSpace : RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 90;
            var rootRect = (RectTransform)root.transform;
            if (InHeadset)
            {
                rootRect.sizeDelta = new Vector2(900, 170);
                rootRect.localScale = Vector3.one * .00062f;
            }
            else
            {
                var scaler = root.AddComponent<CanvasScaler>();
                scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
                scaler.referenceResolution = new Vector2(1440, 900);
            }

            panel = new GameObject("Fundo", typeof(RectTransform), typeof(Image)).GetComponent<RectTransform>();
            panel.SetParent(root.transform, false);
            panel.anchorMin = panel.anchorMax = new Vector2(.5f, InHeadset ? .5f : 0f);
            panel.anchoredPosition = InHeadset ? Vector2.zero : new Vector2(0, 77);
            panel.sizeDelta = new Vector2(870, 105);
            var background = panel.GetComponent<Image>();
            background.color = new Color(.08f, .05f, .15f, .87f);
            background.raycastTarget = false;

            line = new GameObject("Texto", typeof(RectTransform), typeof(Text)).GetComponent<Text>();
            line.transform.SetParent(panel, false);
            line.rectTransform.anchorMin = Vector2.zero;
            line.rectTransform.anchorMax = Vector2.one;
            line.rectTransform.offsetMin = new Vector2(25, 6);
            line.rectTransform.offsetMax = new Vector2(-25, -6);
            line.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            line.fontSize = 31;
            line.alignment = TextAnchor.MiddleCenter;
            line.color = new Color(1f, .96f, .85f);
            line.raycastTarget = false;
            line.text = pending;
            return true;
        }
    }
}
