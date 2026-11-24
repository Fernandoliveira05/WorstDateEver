using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace WorstDateEver
{
    public sealed class PhoneSwipe : MonoBehaviour, IPointerDownHandler, IPointerUpHandler,
        IInitializePotentialDragHandler, IBeginDragHandler, IDragHandler, IEndDragHandler
    {
        public BedroomController Bedroom;
        public RectTransform Card;
        public Text Badge;
        public Image BadgeBackground;
        private int pointer = int.MinValue;
        private Vector2 start;
        private RectTransform surface;

        private void Awake() => surface = (RectTransform)transform;
        public void OnInitializePotentialDrag(PointerEventData e) => e.useDragThreshold = false;
        public void OnBeginDrag(PointerEventData e) => OnDrag(e);
        public void OnEndDrag(PointerEventData e) => Complete(e);
        public void OnPointerUp(PointerEventData e) => Complete(e);
        private void OnDisable() => Clear();

        public void OnPointerDown(PointerEventData e)
        {
            if (pointer != int.MinValue || !LocalPoint(e,out start)) return;
            pointer = e.pointerId;
        }

        public void OnDrag(PointerEventData e)
        {
            if (e.pointerId != pointer || !LocalPoint(e,out var point)) return;
            var movement = point-start;
            var fraction = Mathf.Clamp(movement.x/surface.rect.width,-1,1);
            Card.anchoredPosition = new Vector2(fraction*65f,0);
            Card.localRotation = Quaternion.Euler(0,0,-fraction*9);
            BadgeBackground.enabled = Mathf.Abs(fraction)>.12f && Mathf.Abs(movement.x)>Mathf.Abs(movement.y);
            Badge.text = BadgeBackground.enabled ? fraction>0 ? "CURTI" : "PASSO" : "";
        }

        private void Complete(PointerEventData e)
        {
            if (e.pointerId != pointer) return;
            var valid = LocalPoint(e,out var end);
            var movement = end-start;
            Clear();
            if (valid && Mathf.Abs(movement.x)>surface.rect.width*.16f && Mathf.Abs(movement.x)>Mathf.Abs(movement.y))
                Bedroom.Swipe(movement.x>0);
        }

        private bool LocalPoint(PointerEventData e,out Vector2 position)
        {
            var hit = e.pointerCurrentRaycast;
            if (hit.gameObject == gameObject && hit.worldPosition.sqrMagnitude>.01f)
            {
                position = surface.InverseTransformPoint(hit.worldPosition);
                return true;
            }
            return RectTransformUtility.ScreenPointToLocalPointInRectangle(surface,e.position,e.pressEventCamera,out position);
        }

        private void Clear()
        {
            pointer = int.MinValue;
            if (!Card) return;
            Card.anchoredPosition = Vector2.zero;
            Card.localRotation = Quaternion.identity;
            Badge.text = "";
            BadgeBackground.enabled = false;
        }
    }
}
