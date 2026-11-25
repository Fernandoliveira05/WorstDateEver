using UnityEngine;

namespace WorstDateEver
{
    public sealed class PreparationStation : MonoBehaviour
    {
        public BedroomController Bedroom;
        private void OnTriggerEnter(Collider other)
        {
            var prop = other.GetComponentInParent<BedroomProp>();
            if (prop && prop.PreparationItem > 0) Bedroom.SelectPreparation(prop.PreparationItem);
        }
    }
}
